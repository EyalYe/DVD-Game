// Backend: Express + WebSockets
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("backend/uploads"));
let questions = [];
let clients = {};
let currentQuestionIndex = 0;
let gameActive = false;

// Start game
app.post('/start-game', (req, res) => {
    if (questions.length === 0) return res.json({ success: false, message: "No questions available." });
    gameActive = true;
    currentQuestionIndex = 0;
    broadcastQuestion();
    res.json({ success: true, message: "Game started!" });
});

// WebSocket connections for players
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'join') {
            clients[data.name] = ws;
        } else if (data.type === 'answer') {
            const isCorrect = questions[currentQuestionIndex].correctIndex === data.answerIndex;
            ws.send(JSON.stringify({ type: 'feedback', correct: isCorrect }));
        }
    });
});

// Broadcast question to all players
function broadcastQuestion() {
    if (currentQuestionIndex < questions.length) {
        Object.values(clients).forEach(client => {
            client.send(JSON.stringify({ type: 'question', question: questions[currentQuestionIndex] }));
        });
    }
}

const gameRoutes = require("./routes/game");
app.use("/", gameRoutes);
const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
