import React, { useState, useEffect, useRef } from "react";
import "../styles/GameScreen.css";

// Use environment variable for API URL if available; fallback to your production URL.
// (This is still used for API/WebSocket connections, but not for image concatenation.)
const API_URL =
  typeof process !== "undefined" && process.env.REACT_APP_API_URL
    ? process.env.REACT_APP_API_URL
    : "http://139.162.187.187:3000";

const PHASES = {
  LOBBY: "lobby",
  QUESTION: "question",
  LEADERBOARD: "leaderboard",
  OVER: "over"
};

const GamePanel = () => {
  // Player identity
  const [name, setName] = useState(() => sessionStorage.getItem("playerName") || "");
  const [joined, setJoined] = useState(!!sessionStorage.getItem("playerName"));

  // Basic game data
  const [players, setPlayers] = useState([]);
  const [leaderId, setLeaderId] = useState(null);
  const [isLeader, setIsLeader] = useState(false);

  // Single source for game phase
  const [phase, setPhase] = useState(PHASES.LOBBY);

  // Additional states
  const [timeLimit, setTimeLimit] = useState(30);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");

  // Current question data (phase = QUESTION)
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState([]);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  // NEW: We now store the image as provided by the server (assumed relative)
  const [questionImage, setQuestionImage] = useState(null);

  // Leaderboard data (phase = LEADERBOARD or OVER)
  const [leaderboard, setLeaderboard] = useState([]);
  const [correctAnswers, setCorrectAnswers] = useState([]);

  // Flash color state for answer feedback ("green", "red", or null)
  const [flashColor, setFlashColor] = useState(null);

  // Refs
  const socketRef = useRef(null);
  const playerIdRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Clear flash effect after a short time
  useEffect(() => {
    if (flashColor) {
      const timeout = setTimeout(() => {
        setFlashColor(null);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [flashColor]);

  // On mount, load stored playerId if available
  useEffect(() => {
    const storedId = sessionStorage.getItem("playerId");
    if (storedId) {
      playerIdRef.current = storedId;
    }
  }, []);

  // Connect to WebSocket
  const connectWebSocket = () => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setErrorMessage("Maximum reconnection attempts reached. Please refresh the page.");
      return;
    }
    setConnectionStatus("connecting");
    console.log(`Initiating WebSocket connection... Attempt ${reconnectAttemptsRef.current + 1}`);
    // Convert API_URL from http to ws for WebSocket connection
    const wsUrl = API_URL.replace(/^http/, "ws");
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Connected to WebSocket");
      setConnectionStatus("connected");
      setErrorMessage("");
      reconnectAttemptsRef.current = 0;
      if (joined && playerIdRef.current && !sessionStorage.getItem("hasJoined")) {
        console.log("Rejoining with existing player ID:", playerIdRef.current);
        sessionStorage.setItem("hasJoined", "true");
        ws.send(JSON.stringify({ type: "join", name, playerId: playerIdRef.current }));
      }
      ws.send(JSON.stringify({ type: "requestGameState" }));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log("WS message:", data);
      if (data.type === "updatePlayers") {
        setPlayers(data.players);
        setLeaderId(data.leaderId);
        setIsLeader(playerIdRef.current === data.leaderId);
      } else if (data.type === "gameStatus") {
        if (!data.running) {
          setPhase(PHASES.LOBBY);
        } else {
          setPhase(PHASES.QUESTION);
        }
        setTimeLimit(data.timeLimit || 30);
      } else if (data.type === "newQuestion") {
        setPhase(PHASES.QUESTION);
        setCurrentQuestion(data.question);
        setOptions(data.options);
        setIsMultipleChoice(data.isMultipleChoice);
        setSelectedAnswer([]);
        setAnswerSubmitted(false);
        setTimeLeft(timeLimit);
        // Set questionImage using the relative path provided by the server.
        setQuestionImage(data.image || null);
      } else if (data.type === "leaderboard") {
        setPhase(PHASES.LEADERBOARD);
        setLeaderboard(data.scores);
        setCorrectAnswers(data.correctIndexes || []);
        setCurrentQuestion(null);
        setTimeLeft(null);
        setQuestionImage(null);
      } else if (data.type === "timeUpdate") {
        setTimeLeft(data.timeLeft);
      } else if (data.type === "gameOver") {
        setPhase(PHASES.OVER);
        setLeaderboard(data.leaderboard);
      } else if (data.type === "answerResult") {
        console.log(`Answer result: correct=${data.correct}, newScore=${data.score}`);
        setFlashColor(data.correct ? "green" : "red");
      }
    };

    ws.onclose = (event) => {
      console.warn("WS closed:", event.code, event.reason);
      setConnectionStatus("disconnected");
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Reconnecting...");
          connectWebSocket();
        }, 2000);
      }
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
      setErrorMessage("Failed to connect to server. Is it running?");
      setConnectionStatus("error");
    };

    socketRef.current = ws;
  };

  useEffect(() => {
    if (!sessionStorage.getItem("sessionStarted")) {
      sessionStorage.setItem("sessionStarted", "true");
      sessionStorage.removeItem("playerName");
      sessionStorage.removeItem("hasJoined");
    }
    connectWebSocket();
    return () => {
      console.log("Cleaning up WebSocket");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
      reconnectAttemptsRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (joined && connectionStatus === "connected" && !sessionStorage.getItem("hasJoined")) {
      console.log("Auto-joining...");
      sessionStorage.setItem("hasJoined", "true");
      joinGame();
    }
  }, [joined, connectionStatus]);

  const joinGame = () => {
    if (!name.trim()) {
      setErrorMessage("Please enter a name");
      return;
    }
    if (connectionStatus !== "connected") {
      setErrorMessage("Not connected to server");
      return;
    }
    console.log("Joining game with name:", name);
    sessionStorage.setItem("playerName", name);
    setJoined(true);
    if (!playerIdRef.current) {
      playerIdRef.current = name + "_" + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem("playerId", playerIdRef.current);
      console.log("Generated player ID:", playerIdRef.current);
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "join",
        name,
        playerId: playerIdRef.current
      }));
      setErrorMessage("");
    } else {
      setErrorMessage("Connection lost. Attempting to reconnect...");
      connectWebSocket();
    }
  };

  const startGame = () => {
    if (isLeader && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "startGame",
        timeLimit
      }));
    }
  };

  const returnToLobby = () => {
    console.log("Returning to lobby...");
    setPhase(PHASES.LOBBY);
    setCurrentQuestion(null);
    setLeaderboard([]);
    setCorrectAnswers([]);
    setSelectedAnswer([]);
    setAnswerSubmitted(false);
    setTimeLeft(null);
    setQuestionImage(null);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "requestGameState" }));
    }
  };

  const continueToNext = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "nextQuestion" }));
    }
  };

  const handleOptionClick = (option) => {
    if (answerSubmitted) return;
    if (isMultipleChoice) {
      if (selectedAnswer.includes(option)) {
        setSelectedAnswer(selectedAnswer.filter(a => a !== option));
      } else {
        setSelectedAnswer([...selectedAnswer, option]);
      }
    } else {
      setAnswerSubmitted(true);
      submitAnswer([option]);
    }
  };

  const submitAnswer = (answerArray) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log("Submitting answer:", answerArray);
      socketRef.current.send(JSON.stringify({
        type: "answer",
        answer: answerArray
      }));
    }
  };

  const handleSubmitMultipleChoice = () => {
    if (!answerSubmitted) {
      setAnswerSubmitted(true);
      submitAnswer(selectedAnswer);
    }
  };

  const renderContent = () => {
    if (!joined) {
      return (
        <div className="join-screen">
          <h2>Join the Game</h2>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={connectionStatus !== "connected"}
          />
          <button onClick={joinGame} disabled={connectionStatus !== "connected"}>
            Join
          </button>
        </div>
      );
    }
    if (phase === PHASES.LOBBY) {
      return (
        <div className="lobby">
          <h2>Waiting for game to start...</h2>
          <h3>Players in Lobby:</h3>
          <ul>
            {players.map(p => (
              <li key={p.id}>
                {p.name} {leaderId === p.id ? "(Leader)" : ""}
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
              <button onClick={startGame} disabled={connectionStatus !== "connected"}>
                Start Game
              </button>
            </div>
          )}
        </div>
      );
    }
    if (phase === PHASES.QUESTION && currentQuestion) {
      return (
        <div className="game-play">
          <div className="question-section">
            <h3>{currentQuestion}</h3>
            {questionImage && (
              // Use the relative image URL directly.
              <img src={questionImage} alt="Question" className="question-image" />
            )}
            <div className="options">
              {options.map((option, idx) => {
                const isSelected = selectedAnswer.includes(option);
                return (
                  <button
                    key={idx}
                    onClick={() => handleOptionClick(option)}
                    disabled={answerSubmitted}
                    className={isSelected ? "selected" : ""}
                  >
                    {isMultipleChoice
                      ? isSelected ? `[x] ${option}` : `[ ] ${option}`
                      : option}
                  </button>
                );
              })}
            </div>
            {isMultipleChoice && (
              <button onClick={handleSubmitMultipleChoice} disabled={answerSubmitted || selectedAnswer.length === 0}>
                Submit
              </button>
            )}
            {timeLeft !== null && (
              <div className="time-left">
                <h4>Time Left: {timeLeft}s</h4>
              </div>
            )}
          </div>
        </div>
      );
    }
    if (phase === PHASES.LEADERBOARD) {
      return (
        <div className="game-play">
          <div className="leaderboard">
            <h3>Leaderboard</h3>
            <ul>
              {leaderboard.map(entry => (
                <li key={entry.id}>{entry.id}: {entry.score}</li>
              ))}
            </ul>
            <h4>Correct Answer: {correctAnswers.join(", ")}</h4>
            {isLeader && (
              <button onClick={continueToNext}>
                Continue
              </button>
            )}
          </div>
        </div>
      );
    }
    if (phase === PHASES.OVER) {
      return (
        <div className="game-over">
          <h3>Game Over!</h3>
          <h3>Final Leaderboard:</h3>
          <ul>
            {leaderboard.map(entry => (
              <li key={entry.id}>{entry.id}: {entry.score}</li>
            ))}
          </ul>
          <button onClick={returnToLobby}>Return to Lobby</button>
        </div>
      );
    }
    return <h3>Loading...</h3>;
  };

  return (
    <div className={`game-container ${flashColor ? `flash-${flashColor}` : ""}`}>
      {connectionStatus === "connected" && <div className="text-green-600">Connected to server</div>}
      {errorMessage && <div className="text-red-600 mt-2">{errorMessage}</div>}
      {renderContent()}
    </div>
  );
};

export default GamePanel;
