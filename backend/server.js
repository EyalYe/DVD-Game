const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    // Increase ping timeout
    pingTimeout: 60000,
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("backend/uploads"));

// Importing existing routes
const gameRoutes = require("./routes/game");
app.use("/", gameRoutes);
const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);

let questions = [];
let players = new Map();
let leader = null;
let gameActive = false;
let questionTimeLimit = 30;
let connectionCount = 0;

function noop() {}

wss.on('connection', function connection(ws, req) {
    connectionCount++;
    const clientId = `client_${connectionCount}`;
    ws.id = clientId;
    
    console.log(`New WebSocket connection #${connectionCount}`);
    
    // Set up ping-pong
    ws.isAlive = true;
    ws.on('pong', function heartbeat() {
        this.isAlive = true;
    });

    // Send immediate connection success
    ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId
    }));

    ws.on('message', function incoming(message) {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);

            if (data.type === 'requestGameState') {
                ws.send(JSON.stringify({
                    type: 'gameState',
                    gameActive,
                    players: Array.from(players.values()).map(p => ({
                        id: p.id,
                        name: p.name,
                        isLeader: p.id === leader
                    })),
                    leaderId: leader
                }));
            }

            if (data.type === 'join') {
                const playerId = data.playerId || clientId;
                console.log(`Player joining: ${data.name} (${playerId})`);
                
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
            }
        } catch (error) {
            console.error('Failed to process message:', error);
        }
    });

    ws.on('close', function close() {
        console.log(`Client ${clientId} disconnected`);
        removePlayer(ws);
    });

    ws.on('error', function error(err) {
        console.error(`Client ${clientId} error:`, err);
    });
});

// Keep-alive ping
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
            console.log(`Terminating inactive client ${ws.id}`);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping(noop);
    });
}, 30000);

wss.on('close', function close() {
    clearInterval(interval);
});

function broadcastPlayers() {
    const playerList = Array.from(players.values()).map(player => ({
        id: player.id,
        name: player.name,
        isLeader: player.id === leader
    }));

    console.log('Broadcasting players:', playerList);

    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'updatePlayers',
                players: playerList,
                leaderId: leader
            }));
        }
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
                    newLeaderWs.send(JSON.stringify({ type: 'setLeader' }));
                }
            }

            broadcastPlayers();
            break;
        }
    }
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
});
