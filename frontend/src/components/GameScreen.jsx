import React, { useState, useEffect, useRef } from "react";
import "../styles/GameScreen.css";

const GameScreen = () => {
    const [name, setName] = useState(localStorage.getItem("playerName") || "");
    const [joined, setJoined] = useState(!!localStorage.getItem("playerName"));
    const [players, setPlayers] = useState([]);
    const [leaderId, setLeaderId] = useState(null);
    const [isLeader, setIsLeader] = useState(false);
    const [gameRunning, setGameRunning] = useState(false);
    const [timeLimit, setTimeLimit] = useState(30);
    const [connectionStatus, setConnectionStatus] = useState("disconnected");
    const [errorMessage, setErrorMessage] = useState("");
    const socketRef = useRef(null);
    const playerIdRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const MAX_RECONNECT_ATTEMPTS = 5;

    const connectWebSocket = () => {
        try {
            if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
                setErrorMessage("Maximum reconnection attempts reached. Please refresh the page.");
                return;
            }

            setConnectionStatus("connecting");
            console.log(`Initiating WebSocket connection... Attempt ${reconnectAttemptsRef.current + 1}`);
            
            const ws = new WebSocket(`ws://${window.location.hostname}:3000`);
            
            ws.onopen = () => {
                console.log("Connected to WebSocket - Ready State:", ws.readyState);
                setConnectionStatus("connected");
                setErrorMessage("");
                reconnectAttemptsRef.current = 0;
                
                if (joined && playerIdRef.current) {
                    console.log("Rejoining with existing player ID:", playerIdRef.current);
                    ws.send(JSON.stringify({ 
                        type: "join", 
                        name, 
                        playerId: playerIdRef.current 
                    }));
                }
                ws.send(JSON.stringify({ type: "requestGameState" }));
            };

            ws.onmessage = (message) => {
                const data = JSON.parse(message.data);
                console.log("Received WebSocket message:", data);

                if (data.type === "updatePlayers") {
                    setPlayers(data.players);
                    setLeaderId(data.leaderId);
                    setIsLeader(playerIdRef.current === data.leaderId);
                }

                if (data.type === "gameStatus") {
                    setGameRunning(data.running);
                }
            };

            ws.onclose = (event) => {
                console.warn("WebSocket closed. Code:", event.code, "Reason:", event.reason);
                setConnectionStatus("disconnected");
                
                if (socketRef.current) {
                    reconnectAttemptsRef.current += 1;
                    reconnectTimeoutRef.current = setTimeout(() => {
                        console.log("Attempting to reconnect...");
                        connectWebSocket();
                    }, 2000);
                }
            };

            ws.onerror = (error) => {
                console.error("WebSocket error:", error);
                setErrorMessage("Failed to connect to game server. Please check if the server is running.");
                setConnectionStatus("error");
            };

            socketRef.current = ws;
        } catch (error) {
            console.error("Error creating WebSocket:", error);
            setErrorMessage(`Connection error: ${error.message}`);
            setConnectionStatus("error");
        }
    };

    useEffect(() => {
        connectWebSocket();

        return () => {
            console.log("Cleaning up WebSocket connection");
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (socketRef.current) {
                const ws = socketRef.current;
                socketRef.current = null;
                ws.onclose = null;
                ws.close();
            }
            reconnectAttemptsRef.current = 0;
        };
    }, []);

    const joinGame = () => {
        if (!name.trim()) {
            setErrorMessage("Please enter a name");
            return;
        }

        if (connectionStatus !== "connected") {
            setErrorMessage("Not connected to server. Please wait for connection.");
            return;
        }

        console.log("Join game initiated for name:", name);
        localStorage.setItem("playerName", name);
        setJoined(true);
        playerIdRef.current = name + "_" + Math.random().toString(36).substr(2, 9);
        console.log("Generated player ID:", playerIdRef.current);

        if (socketRef.current?.readyState === WebSocket.OPEN) {
            const joinMessage = { 
                type: "join", 
                name, 
                playerId: playerIdRef.current 
            };
            console.log("Sending join message:", joinMessage);
            socketRef.current.send(JSON.stringify(joinMessage));
            setErrorMessage("");
        } else {
            setErrorMessage("Connection lost. Attempting to reconnect...");
            connectWebSocket();
        }
    };

    // Render connection status
    const renderConnectionStatus = () => {
        switch (connectionStatus) {
            case "connected":
                return <div className="text-green-600">Connected to server</div>;
            case "connecting":
                return <div className="text-yellow-600">Connecting to server...</div>;
            case "disconnected":
                return <div className="text-red-600">Disconnected from server</div>;
            case "error":
                return <div className="text-red-600">Connection error</div>;
            default:
                return null;
        }
    };

    return (
        <div className="game-container">
            {renderConnectionStatus()}
            {errorMessage && (
                <div className="text-red-600 mt-2">{errorMessage}</div>
            )}
            {!joined ? (
                <div className="join-screen">
                    <h2>Join the Game</h2>
                    <input
                        type="text"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={connectionStatus !== "connected"}
                    />
                    <button 
                        onClick={joinGame}
                        disabled={connectionStatus !== "connected"}
                    >
                        Join
                    </button>
                </div>
            ) : gameRunning ? (
                <h3>Game has started!</h3>
            ) : (
                <div className="lobby">
                    <h2>Waiting for game to start...</h2>
                    <h3>Players in Lobby:</h3>
                    <ul>
                        {players.map((player) => (
                            <li key={player.id}>
                                {player.name} {leaderId === player.id ? "(Leader)" : ""}
                            </li>
                        ))}
                    </ul>

                    {isLeader && (
                        <div className="leader-controls">
                            <h3>You are the Leader!</h3>
                            <h3>Set Question Time: {timeLimit} seconds</h3>
                            <input
                                type="range"
                                min="30"
                                max="69"
                                value={timeLimit}
                                onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                            />
                            <button 
                                onClick={startGame}
                                disabled={connectionStatus !== "connected"}
                            >
                                Start Game
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GameScreen;
