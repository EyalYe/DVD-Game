import React, { useState, useEffect, useRef } from "react";
import "../styles/GameScreen.css";

const PHASES = {
  LOBBY: "lobby",
  QUESTION: "question",
  LEADERBOARD: "leaderboard",
  OVER: "over"
};

const GameScreen = () => {
  // Player identity
  const [name, setName] = useState(() => sessionStorage.getItem("playerName") || "");
  const [joined, setJoined] = useState(!!sessionStorage.getItem("playerName"));

  // Basic game data
  const [players, setPlayers] = useState([]);
  const [leaderId, setLeaderId] = useState(null);
  const [isLeader, setIsLeader] = useState(false);

  // Single source of truth for the game "phase"
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

  // Leaderboard data (phase = LEADERBOARD or OVER)
  const [leaderboard, setLeaderboard] = useState([]);
  const [correctAnswers, setCorrectAnswers] = useState([]);

  // Refs
  const socketRef = useRef(null);
  const playerIdRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // On mount, load stored playerId
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
    const ws = new WebSocket(`ws://${window.location.hostname}:3000`);

    ws.onopen = () => {
      console.log("Connected to WebSocket");
      setConnectionStatus("connected");
      setErrorMessage("");
      reconnectAttemptsRef.current = 0;

      // If we already have a name + playerId, rejoin if we haven't done so yet
      if (joined && playerIdRef.current && !sessionStorage.getItem("hasJoined")) {
        console.log("Rejoining with existing player ID:", playerIdRef.current);
        sessionStorage.setItem("hasJoined", "true");
        ws.send(JSON.stringify({ type: "join", name, playerId: playerIdRef.current }));
      }
      // Always request the current game state
      ws.send(JSON.stringify({ type: "requestGameState" }));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log("WS message:", data);

      if (data.type === "updatePlayers") {
        setPlayers(data.players);
        setLeaderId(data.leaderId);
        setIsLeader(playerIdRef.current === data.leaderId);
      }
      else if (data.type === "gameStatus") {
        // If running is false => phase = LOBBY, else => might be QUESTION or LEADERBOARD
        if (!data.running) {
          setPhase(PHASES.LOBBY);
        } else {
          // We can't be sure if it's QUESTION or LEADERBOARD yet, we'll see "newQuestion" or "leaderboard" soon
          // But let's default to QUESTION for now.
          setPhase(PHASES.QUESTION);
        }
        setTimeLimit(data.timeLimit || 30);
      }
      else if (data.type === "newQuestion") {
        // Switch to question phase
        setPhase(PHASES.QUESTION);
        setCurrentQuestion(data.question);
        setOptions(data.options);
        setIsMultipleChoice(data.isMultipleChoice);
        setSelectedAnswer([]);
        setAnswerSubmitted(false);
        setTimeLeft(timeLimit);
      }
      else if (data.type === "leaderboard") {
        // Switch to leaderboard phase
        setPhase(PHASES.LEADERBOARD);
        setLeaderboard(data.scores);
        setCorrectAnswers(data.correctIndexes);
        setCurrentQuestion(null);
        setTimeLeft(null);
      }
      else if (data.type === "timeUpdate") {
        setTimeLeft(data.timeLeft);
      }
      else if (data.type === "gameOver") {
        // Switch to over phase
        setPhase(PHASES.OVER);
        setLeaderboard(data.leaderboard);
      }
      else if (data.type === "answerResult") {
        // Just handle the local result if you want to display correctness or updated score
        console.log(`Answer result: correct=${data.correct}, newScore=${data.score}`);
      }
    };

    ws.onclose = (event) => {
      console.warn("WebSocket closed:", event.code, event.reason);
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
      console.error("WebSocket error:", err);
      setErrorMessage("Failed to connect to server. Is it running?");
      setConnectionStatus("error");
    };

    socketRef.current = ws;
  };

  // On mount, connect
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

  // If we already have a name, auto-join on connect
  useEffect(() => {
    if (joined && connectionStatus === "connected" && !sessionStorage.getItem("hasJoined")) {
      console.log("Auto-joining...");
      sessionStorage.setItem("hasJoined", "true");
      joinGame();
    }
  }, [joined, connectionStatus]);

  // Join logic
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

  // Start game
  const startGame = () => {
    if (isLeader && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "startGame",
        timeLimit
      }));
    }
  };

  // Return to lobby without reloading
  const returnToLobby = () => {
    // We'll treat "return to lobby" as resetting to LOBBY phase
    console.log("Returning to lobby...");
    setPhase(PHASES.LOBBY);
    setCurrentQuestion(null);
    setLeaderboard([]);
    setCorrectAnswers([]);
    setSelectedAnswer([]);
    setAnswerSubmitted(false);
    setTimeLeft(null);
    // Optionally request fresh game state
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "requestGameState" }));
    }
  };

  // Continue to next question
  const continueToNext = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "nextQuestion" }));
    }
  };

  // Answer submission
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

  // ─────────────────────────────────────────────────────────────────────────
  // Render logic: single switch on "phase"
  // ─────────────────────────────────────────────────────────────────────────
  const renderContent = () => {
    // If not joined yet
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

    // If phase is LOBBY
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

    // If phase is QUESTION
    if (phase === PHASES.QUESTION && currentQuestion) {
      return (
        <div className="game-play">
          <div className="question-section">
            <h3>{currentQuestion}</h3>
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
              <button
                onClick={handleSubmitMultipleChoice}
                disabled={answerSubmitted || selectedAnswer.length === 0}
              >
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

    // If phase is LEADERBOARD
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

    // If phase is OVER
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

    // Fallback
    return <h3>Loading...</h3>;
  };

  return (
    <div className="game-container">
      {connectionStatus === "connected" && <div className="text-green-600">Connected to server</div>}
      {errorMessage && <div className="text-red-600 mt-2">{errorMessage}</div>}
      {renderContent()}
    </div>
  );
};

export default GameScreen;
