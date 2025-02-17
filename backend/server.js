const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const cors = require("cors");

// Use an environment variable for API URL on the server side (adjust as needed)
const API_URL = process.env.API_URL || "http://139.162.187.187:3000";

// Import gameManager for question management
const gameManager = require("./gameManager");

const app = express();
const server = http.createServer(app);

// Serve static files from the "uploads" folder.  
// Ensure that the uploads folder is in the same directory as this file.
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(cors());
app.use(express.json());

// Import existing routes
const gameRoutes = require("./routes/game");
app.use("/", gameRoutes);
const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);

// Global game state
let questions = []; // Loaded when the game starts
let players = new Map();
let leader = null;
let gameActive = false;
let questionTimeLimit = 30;
let connectionCount = 0;

// Game flow and scoring globals
let currentQuestionIndex = 0;
let playerScores = new Map(); // Map of playerId to score

// Tracking current question state
let currentAnswers = new Set();     // IDs of players who answered the current question
let currentQuestionData = null;     // The current question object
let currentQuestionTimeout = null;  // Timeout handle for auto-showing leaderboard
let timeUpdateInterval = null;      // Interval handle for time updates
let questionEnded = false;          // Flag to prevent multiple triggers

function noop() {}

// Create WebSocket server
const wss = new WebSocket.Server({
  server,
  clientTracking: true,
  pingTimeout: 60000,
});

wss.on("connection", (ws, req) => {
  connectionCount++;
  const clientId = `client_${connectionCount}`;
  ws.id = clientId;
  console.log(`New WebSocket connection #${connectionCount}`);

  ws.isAlive = true;
  ws.on("pong", function heartbeat() {
    this.isAlive = true;
  });

  // Send initial connection message
  ws.send(JSON.stringify({
    type: "connected",
    clientId: clientId,
  }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received:", data);

      if (data.type === "requestGameState") {
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
      }

      if (data.type === "join") {
        // Use provided playerId or fallback to ws.id
        const playerId = data.playerId || ws.id;
        console.log(`Player joining: ${data.name} (${playerId})`);

        // Attach playerId to ws
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

        // If a player joins mid-question, mark them as answered to avoid blocking
        if (gameActive && currentQuestionData) {
          console.log(`Player ${playerId} joined mid-question. Marking as answered.`);
          currentAnswers.add(playerId);
          ws.send(JSON.stringify({
            type: "answerResult",
            correct: false,
            score: playerScores.get(playerId) || 0,
            message: "You joined mid-question and have been marked as having answered incorrectly."
          }));
          if (currentAnswers.size === players.size && !questionEnded) {
            console.log("All players answered (including late joiners), showing leaderboard.");
            questionEnded = true;
            clearTimeout(currentQuestionTimeout);
            clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
            showLeaderboard(currentQuestionData.correctIndexes);
          }
        }
      }

      if (data.type === "startGame") {
        console.log(`Starting game with time limit: ${data.timeLimit} seconds`);
        gameActive = true;
        questionTimeLimit = data.timeLimit;
        questions = gameManager.getQuestions();
        currentQuestionIndex = 0;
        playerScores.clear();

        broadcast({
          type: "gameStatus",
          running: true,
          timeLimit: questionTimeLimit
        });

        setTimeout(serveNextQuestion, 3000);
      }

      if (data.type === "nextQuestion" && ws.playerId === leader) {
        console.log("Leader requested next question.");
        if (!questionEnded) {
          questionEnded = true;
          clearTimeout(currentQuestionTimeout);
          clearInterval(timeUpdateInterval);
          timeUpdateInterval = null;
          showLeaderboard(currentQuestionData.correctIndexes);
        } else {
          serveNextQuestion();
        }
      }

      if (data.type === "answer") {
        const currentQuestion = currentQuestionData;
        if (!currentQuestion) return;
        if (currentAnswers.has(ws.playerId)) return;
        currentAnswers.add(ws.playerId);

        let isCorrect = false;
        if (Array.isArray(data.answer)) {
          const submitted = data.answer.map(ans => ans.trim().toLowerCase()).sort();
          const expected = currentQuestion.correctIndexes.map(idx => currentQuestion.options[idx].trim().toLowerCase()).sort();
          console.log(`Player ${ws.playerId} submitted: ${JSON.stringify(submitted)}; Expected: ${JSON.stringify(expected)}`);
          isCorrect = JSON.stringify(submitted) === JSON.stringify(expected);
        } else {
          const submitted = String(data.answer).trim().toLowerCase();
          const expected = String(currentQuestion.options[currentQuestion.correctIndexes[0]]).trim().toLowerCase();
          console.log(`Player ${ws.playerId} submitted: "${submitted}"; Expected: "${expected}"`);
          isCorrect = submitted === expected;
        }

        if (isCorrect) {
          const player = players.get(ws.playerId);
          if (player) {
            console.log(`${player.name} answered correctly!`);
            playerScores.set(ws.playerId, (playerScores.get(ws.playerId) || 0) + 1);
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
          showLeaderboard(currentQuestion.correctIndexes);
        }
      }
    } catch (error) {
      console.error("Failed to process message:", error);
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
  wss.clients.forEach((ws) => {
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

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function serveNextQuestion() {
  if (!gameActive || currentQuestionIndex >= questions.length) {
    console.log("Game Over. No more questions.");
    broadcast({
      type: "gameOver",
      leaderboard: Array.from(players.values()).map(player => ({
        id: player.id,
        score: playerScores.get(player.id) || 0
      }))
    });
    gameActive = false;
    return;
  }

  const question = questions[currentQuestionIndex];
  currentQuestionIndex++;

  currentAnswers = new Set();
  questionEnded = false;
  currentQuestionData = question;

  console.log(`Serving question ${currentQuestionIndex}: ${question.question}`);

  // Construct full image URL if question.image exists
  const imageField = question.image ? question.image : null;

  broadcast({
    type: "newQuestion",
    question: question.question,
    options: question.options,
    isMultipleChoice: question.isMultipleChoice,
    image: imageField
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
      showLeaderboard(question.correctIndexes);
    }
  }, questionTimeLimit * 1000);
}

function showLeaderboard(correctIndexes) {
  console.log("Displaying leaderboard...");
  broadcast({
    type: "leaderboard",
    scores: Array.from(players.values()).map(player => ({
      id: player.id,
      score: playerScores.get(player.id) || 0
    })),
    correctIndexes
  });
  if (currentQuestionIndex % 10 === 0) {
    console.log("Resetting leaderboard after 10 questions.");
    playerScores.clear();
  }
}

server.listen(3000, () => {
  console.log("Game server running on port 3000");
});
