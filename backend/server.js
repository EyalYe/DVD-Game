const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const gameManager = require("./gameManager");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    pingTimeout: 60000, // Increase ping timeout
});

app.use(cors());
app.use(express.json());
// Serve static files from the uploads folder (adjust if necessary)
app.use("/uploads", express.static("backend/uploads"));

// Existing routes
const gameRoutes = require("./routes/game");
app.use("/", gameRoutes);
const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);

// Global game state
let questions = [];
let players = new Map();
let leader = null;
let gameActive = false;
let questionTimeLimit = 30;
let connectionCount = 0;

// Score + question tracking
let currentQuestionData = null;
let currentQuestionTimeout = null;
let timeUpdateInterval = null;
let playerScores = new Map();
let currentAnswers = new Set();
// NEW: Track which players answered correctly for the current question
let currentCorrectAnswers = new Set();

// NEW: Track the current phase of the game: "lobby" | "question" | "leaderboard" | "over"
let phase = "lobby";

// Flag to prevent duplicate triggers
let questionEnded = false;

function noop() {}

// Helper: Shuffle an array using Fisher-Yates algorithm
function shuffleArray(array) {
    let arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

wss.on("connection", (ws, req) => {
    connectionCount++;
    const clientId = `client_${connectionCount}`;
    ws.id = clientId;

    console.log(`New WebSocket connection #${connectionCount}`);

    // Set up ping-pong
    ws.isAlive = true;
    ws.on("pong", function heartbeat() {
        this.isAlive = true;
    });

    // Send immediate connection success
    ws.send(JSON.stringify({
        type: "connected",
        clientId: clientId
    }));

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            console.log("Received:", data);

            if (data.type === "requestGameState") {
                sendCurrentState(ws);
            }

            if (data.type === "join") {
                const playerId = data.playerId || ws.id;
                console.log(`Player joining: ${data.name} (${playerId})`);

                ws.playerId = playerId;
                players.set(playerId, {
                    id: playerId,
                    name: data.name,
                    score: 0,
                    ws: ws,
                    joinedAt: new Date()
                });

                if (!leader) {
                    leader = playerId;
                    console.log(`New leader assigned: ${data.name} (${playerId})`);
                }

                broadcastPlayers();
                sendCurrentState(ws);
            }

            if (data.type === "startGame") {
                console.log(`Starting game with time limit: ${data.timeLimit} seconds`);
                gameActive = true;
                questionTimeLimit = data.timeLimit;
                // Load questions from gameManager (assume it returns an array)
                questions = gameManager.getQuestions();
                playerScores.clear();
                phase = "question";

                broadcast({
                    type: "gameStatus",
                    running: true,
                    timeLimit: questionTimeLimit
                });

                setTimeout(serveNextQuestion, 3000);
            }

            if (data.type === "nextQuestion" && ws.playerId === leader) {
                console.log("Leader requested next question.");
                if (phase === "question" && !questionEnded) {
                    // End the current question early
                    questionEnded = true;
                    clearTimeout(currentQuestionTimeout);
                    clearInterval(timeUpdateInterval);
                    timeUpdateInterval = null;
                    showLeaderboard(currentQuestionData.correctIndexes);
                } else if (phase === "leaderboard") {
                    serveNextQuestion();
                }
            }

            if (data.type === "answer") {
                if (phase !== "question" || !currentQuestionData) return;
                if (currentAnswers.has(ws.playerId)) return;
                currentAnswers.add(ws.playerId);

                let isCorrect = false;
                const q = currentQuestionData;
                if (Array.isArray(data.answer)) {
                    const submitted = data.answer.map(a => a.trim().toLowerCase()).sort();
                    const expected = q.correctIndexes.map(idx => q.options[idx].trim().toLowerCase()).sort();
                    console.log(`Player ${ws.playerId} submitted: ${JSON.stringify(submitted)}; Expected: ${JSON.stringify(expected)}`);
                    isCorrect = JSON.stringify(submitted) === JSON.stringify(expected);
                } else {
                    const submitted = String(data.answer).trim().toLowerCase();
                    const expected = String(q.options[q.correctIndexes[0]]).trim().toLowerCase();
                    console.log(`Player ${ws.playerId} submitted: "${submitted}"; Expected: "${expected}"`);
                    isCorrect = submitted === expected;
                }

                if (isCorrect) {
                    const player = players.get(ws.playerId);
                    if (player) {
                        console.log(`${player.name} answered correctly!`);
                        playerScores.set(ws.playerId, (playerScores.get(ws.playerId) || 0) + 1);
                        // NEW: Record that this player answered correctly for this round
                        currentCorrectAnswers.add(ws.playerId);
                    }
                }

                const updatedScore = playerScores.get(ws.playerId) || 0;
                ws.send(JSON.stringify({
                    type: "answerResult",
                    correct: isCorrect,
                    score: updatedScore
                }));

                if (currentAnswers.size === players.size && !questionEnded) {
                    console.log("All players answered early, showing leaderboard.");
                    questionEnded = true;
                    clearTimeout(currentQuestionTimeout);
                    clearInterval(timeUpdateInterval);
                    timeUpdateInterval = null;
                    showLeaderboard(currentQuestionData.correctIndexes);
                }
            }
        } catch (err) {
            console.error("Failed to process message:", err);
        }
    });

    ws.on("close", () => {
        console.log(`Client ${ws.id} disconnected`);
        removePlayer(ws);
    });

    ws.on("error", (err) => {
        console.error(`Client ${ws.id} error:`, err);
    });
});

const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log(`Terminating inactive client ${ws.id}`);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping(noop);
    });
}, 30000);

wss.on("close", () => {
    clearInterval(interval);
});

// ──────────────────────────────────────────────────────────────
// Helper: sendCurrentState(ws)
function sendCurrentState(ws) {
    ws.send(JSON.stringify({
        type: "gameState",
        gameActive,
        players: Array.from(players.values()).map(p => ({
            id: p.id,
            name: p.name,
            isLeader: p.id === leader
        })),
        leaderId: leader
    }));

    if (phase === "question" && currentQuestionData && !questionEnded) {
        ws.send(JSON.stringify({
            type: "newQuestion",
            question: currentQuestionData.question,
            options: currentQuestionData.options,
            isMultipleChoice: currentQuestionData.isMultipleChoice,
            image: currentQuestionData.image || null
        }));
    } else if (phase === "leaderboard") {
        const board = Array.from(players.values()).map(player => ({
            id: player.id,
            score: playerScores.get(player.id) || 0
        }));
        let correctAnswersText = [];
        let originalOptions = [];
        if (currentQuestionData && currentQuestionData.options) {
            originalOptions = currentQuestionData.options;
            correctAnswersText = currentQuestionData.correctIndexes.map(idx => currentQuestionData.options[idx]);
        }
        ws.send(JSON.stringify({
            type: "leaderboard",
            scores: board,
            correctIndexes: currentQuestionData ? currentQuestionData.correctIndexes : [],
            correctAnswers: correctAnswersText,
            originalOptions: originalOptions,
            // NEW: Send the current question along with the leaderboard
            currentQuestion: currentQuestionData ? currentQuestionData.question : null
        }));
    } else if (phase === "over") {
        const finalBoard = Array.from(players.values()).map(player => ({
            id: player.id,
            score: playerScores.get(player.id) || 0
        }));
        ws.send(JSON.stringify({
            type: "gameOver",
            leaderboard: finalBoard
        }));
    }
}

// ──────────────────────────────────────────────────────────────
// Helper: broadcastPlayers
function broadcastPlayers() {
    const playerList = Array.from(players.values()).map(player => ({
        id: player.id,
        name: player.name,
        isLeader: player.id === leader
    }));
    console.log("Broadcasting players:", playerList);
    broadcast({
        type: "updatePlayers",
        players: playerList,
        leaderId: leader
    });
}

// ──────────────────────────────────────────────────────────────
// Helper: removePlayer
function removePlayer(ws) {
    for (const [playerId, player] of players.entries()) {
        if (player.ws === ws) {
            console.log(`Removing player: ${player.name} (${playerId})`);
            players.delete(playerId);
            if (playerId === leader) {
                const remainingPlayers = Array.from(players.keys());
                leader = remainingPlayers[0] || null;
                if (leader) {
                    const newLeaderWs = players.get(leader).ws;
                    newLeaderWs.send(JSON.stringify({ type: "setLeader" }));
                }
            }
            broadcastPlayers();
            break;
        }
    }
}

// ──────────────────────────────────────────────────────────────
// Helper: broadcast
function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// ──────────────────────────────────────────────────────────────
// serveNextQuestion: Choose a random question and shuffle its options
function serveNextQuestion() {
    if (!gameActive || questions.length === 0) {
        console.log("Game Over. No more questions.");
        phase = "over";
        const finalBoard = Array.from(players.values()).map(player => ({
            id: player.id,
            score: playerScores.get(player.id) || 0
        }));
        broadcast({
            type: "gameOver",
            leaderboard: finalBoard
        });
        gameActive = false;
        return;
    }

    // Reset answer tracking for the new question
    currentAnswers = new Set();
    currentCorrectAnswers = new Set(); // NEW: Reset correct answer tracking
    questionEnded = false;

    // Choose a random question from the list (do not remove it immediately)
    const randomIndex = Math.floor(Math.random() * questions.length);
    const selectedQuestion = questions[randomIndex];

    // Shuffle options and update correct indexes accordingly.
    const originalOptions = selectedQuestion.options.slice();
    const shuffledOptions = shuffleArray(originalOptions);
    // Compute new correct indexes by matching option text (case-insensitive)
    const newCorrectIndexes = [];
    selectedQuestion.correctIndexes.forEach(oldIdx => {
        const correctOption = originalOptions[oldIdx].trim().toLowerCase();
        const newIdx = shuffledOptions.findIndex(opt => opt.trim().toLowerCase() === correctOption);
        if (newIdx !== -1) {
            newCorrectIndexes.push(newIdx);
        }
    });

    // Update the question data that will be sent to clients.
    currentQuestionData = {
        question: selectedQuestion.question,
        options: shuffledOptions,
        correctIndexes: newCorrectIndexes,
        isMultipleChoice: selectedQuestion.isMultipleChoice,
        image: selectedQuestion.image || null
    };

    phase = "question";

    console.log(`Serving random question: ${currentQuestionData.question}`);

    broadcast({
        type: "newQuestion",
        question: currentQuestionData.question,
        options: currentQuestionData.options,
        isMultipleChoice: currentQuestionData.isMultipleChoice,
        image: currentQuestionData.image // Relative URL as stored in DB
    });

    // Time updates: broadcast a "timeUpdate" every 10% of questionTimeLimit seconds
    const steps = 10;
    let stepCount = 1;
    const stepIntervalMs = (questionTimeLimit * 1000) / steps;
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
    }
    timeUpdateInterval = setInterval(() => {
        if (questionEnded || stepCount >= steps) {
            clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
            return;
        }
        const elapsed = stepCount * (questionTimeLimit / steps);
        const timeRemaining = Math.max(0, Math.ceil(questionTimeLimit - elapsed));
        broadcast({
            type: "timeUpdate",
            timeLeft: timeRemaining
        });
        stepCount++;
    }, stepIntervalMs);

    currentQuestionTimeout = setTimeout(() => {
        if (!questionEnded) {
            questionEnded = true;
            clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
            showLeaderboard(currentQuestionData.correctIndexes);
        }
    }, questionTimeLimit * 1000);
}

// ──────────────────────────────────────────────────────────────
// showLeaderboard: Send leaderboard with actual answer texts along with current question
function showLeaderboard(correctIndexes) {
    console.log("Displaying leaderboard...");
    phase = "leaderboard";

    const board = Array.from(players.values()).map(player => ({
        id: player.id,
        score: playerScores.get(player.id) || 0
    }));

    let correctAnswersText = [];
    let originalOptions = [];
    if (currentQuestionData && currentQuestionData.options) {
        originalOptions = currentQuestionData.options;
        correctAnswersText = currentQuestionData.correctIndexes.map(idx => currentQuestionData.options[idx]);
    }

    broadcast({
        type: "leaderboard",
        scores: board,
        correctIndexes: correctIndexes,
        correctAnswers: correctAnswersText,
        originalOptions: originalOptions,
        // NEW: Send the current question along with the leaderboard
        currentQuestion: currentQuestionData ? currentQuestionData.question : null
    });

    // NEW: If every connected player answered correctly, remove the question from the pool.
    if (currentCorrectAnswers.size === players.size) {
        console.log("Every player answered correctly. Removing question from pool.");
        const index = questions.findIndex(q => q.question === currentQuestionData.question);
        if (index !== -1) {
            questions.splice(index, 1);
        }
    }
}

server.listen(3000, () => {
    console.log("Game server running on port 3000");
});

