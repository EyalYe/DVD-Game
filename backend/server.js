const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
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
app.use("/uploads", express.static("backend/uploads"));

// Existing routes
const gameRoutes = require("./routes/game");
app.use("/", gameRoutes);
const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);

// Game data
let questions = [];
let players = new Map();
let leader = null;
let gameActive = false;
let questionTimeLimit = 30;
let connectionCount = 0;

// Score + question tracking
let currentQuestionIndex = 0;
let playerScores = new Map();
let currentAnswers = new Set();
let currentQuestionData = null;
let currentQuestionTimeout = null;
let timeUpdateInterval = null;

// NEW: Track the current phase of the game
// "lobby" | "question" | "leaderboard" | "over"
let phase = "lobby";

// Flags
let questionEnded = false;

function noop() {}

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

                // Now send them the appropriate data based on the current phase
                sendCurrentState(ws);
            }

            if (data.type === "startGame") {
                console.log(`Starting game with time limit: ${data.timeLimit} seconds`);
                gameActive = true;
                questionTimeLimit = data.timeLimit;
                questions = gameManager.getQuestions();
                currentQuestionIndex = 0;
                playerScores.clear();
                phase = "question"; // We'll serve the first question

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
                    // If question is active, end it early
                    questionEnded = true;
                    clearTimeout(currentQuestionTimeout);
                    clearInterval(timeUpdateInterval);
                    timeUpdateInterval = null;
                    showLeaderboard(currentQuestionData.correctIndexes);
                } else if (phase === "leaderboard") {
                    // Move on to the next question
                    serveNextQuestion();
                }
            }

            if (data.type === "answer") {
                if (phase !== "question" || !currentQuestionData) return;
                // Prevent duplicates
                if (currentAnswers.has(ws.playerId)) return;
                currentAnswers.add(ws.playerId);

                // Compare text answers
                let isCorrect = false;
                const q = currentQuestionData;

                if (Array.isArray(data.answer)) {
                    // Multiple choice
                    const submitted = data.answer.map(a => a.trim().toLowerCase()).sort();
                    const expected = q.correctIndexes.map(idx => q.options[idx].trim().toLowerCase()).sort();
                    console.log(`Player ${ws.playerId} submitted: ${JSON.stringify(submitted)}; Expected: ${JSON.stringify(expected)}`);
                    isCorrect = JSON.stringify(submitted) === JSON.stringify(expected);
                } else {
                    // Single choice
                    const submitted = String(data.answer).trim().toLowerCase();
                    const expected = String(q.options[q.correctIndexes[0]]).trim().toLowerCase();
                    console.log(`Player ${ws.playerId} submitted: "${submitted}"; Expected: "${expected}"`);
                    isCorrect = submitted === expected;
                }

                if (isCorrect) {
                    const p = players.get(ws.playerId);
                    if (p) {
                        console.log(`${p.name} answered correctly!`);
                        playerScores.set(ws.playerId, (playerScores.get(ws.playerId) || 0) + 1);
                    }
                }

                const updatedScore = playerScores.get(ws.playerId) || 0;
                ws.send(JSON.stringify({
                    type: "answerResult",
                    correct: isCorrect,
                    score: updatedScore
                }));

                // If all players have answered, show the leaderboard
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

// Ping loop
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

// ─────────────────────────────────────────────────────────────────────────
// HELPER: sendCurrentState(ws)
// ─────────────────────────────────────────────────────────────────────────
function sendCurrentState(ws) {
    // Send the standard "gameState" if we want
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

    // Based on the current phase, send additional info
    if (phase === "question" && currentQuestionData && !questionEnded) {
        // We are in the middle of a question
        // Send them "newQuestion" so they see the question
        ws.send(JSON.stringify({
            type: "newQuestion",
            question: currentQuestionData.question,
            options: currentQuestionData.options,
            isMultipleChoice: currentQuestionData.isMultipleChoice
        }));
    } else if (phase === "leaderboard" && questionEnded && !gameOver) {
        // We are in the leaderboard phase
        // Send them the scoreboard so they see the current results
        const leaderboardData = Array.from(players.values()).map(player => ({
            id: player.id,
            score: playerScores.get(player.id) || 0
        }));
        ws.send(JSON.stringify({
            type: "leaderboard",
            scores: leaderboardData,
            correctIndexes: currentQuestionData ? currentQuestionData.correctIndexes : []
        }));
    } else if (phase === "over") {
        // The game is over
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

// ─────────────────────────────────────────────────────────────────────────
// broadcastPlayers
// ─────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// removePlayer
// ─────────────────────────────────────────────────────────────────────────
function removePlayer(ws) {
    for (const [playerId, player] of players.entries()) {
        if (player.ws === ws) {
            console.log(`Removing player: ${player.name} (${playerId})`);
            players.delete(playerId);

            if (playerId === leader) {
                const remaining = Array.from(players.keys());
                leader = remaining[0] || null;
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

// ─────────────────────────────────────────────────────────────────────────
// broadcast
// ─────────────────────────────────────────────────────────────────────────
function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────
// serveNextQuestion
// ─────────────────────────────────────────────────────────────────────────
function serveNextQuestion() {
    if (!gameActive || currentQuestionIndex >= questions.length) {
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

    // We are in question phase
    phase = "question";

    const question = questions[currentQuestionIndex];
    currentQuestionIndex++;

    currentAnswers = new Set();
    questionEnded = false;
    currentQuestionData = question;

    console.log(`Serving question ${currentQuestionIndex}: ${question.question}`);

    broadcast({
        type: "newQuestion",
        question: question.question,
        options: question.options,
        isMultipleChoice: question.isMultipleChoice
    });

    // Time updates
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
        const timeLeft = Math.max(0, Math.ceil(questionTimeLimit - elapsed));
        broadcast({ type: "timeUpdate", timeLeft });
        stepCount++;
    }, stepIntervalMs);

    currentQuestionTimeout = setTimeout(() => {
        if (!questionEnded) {
            questionEnded = true;
            clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
            showLeaderboard(question.correctIndexes);
        }
    }, questionTimeLimit * 1000);
}

// ─────────────────────────────────────────────────────────────────────────
// showLeaderboard
// ─────────────────────────────────────────────────────────────────────────
function showLeaderboard(correctIndexes) {
    console.log("Displaying leaderboard...");
    phase = "leaderboard";

    const board = Array.from(players.values()).map(player => ({
        id: player.id,
        score: playerScores.get(player.id) || 0
    }));

    broadcast({
        type: "leaderboard",
        scores: board,
        correctIndexes
    });

    // Optionally reset scores every 10 questions
    if (currentQuestionIndex % 10 === 0) {
        console.log("Resetting leaderboard after 10 questions.");
        playerScores.clear();
    }
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
});
