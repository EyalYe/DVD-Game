import React, { useState, useEffect, useRef } from "react";
import "../styles/Viewer.css";

const PHASES = {
  LOBBY: "lobby",
  QUESTION: "question",
  LEADERBOARD: "leaderboard",
  OVER: "over"
};

const Viewer = ({ backendUrl }) => {
  const [phase, setPhase] = useState(PHASES.LOBBY);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [correctAnswers, setCorrectAnswers] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Use the provided backendUrl or fallback to window.location.hostname with port 3000
  const wsUrl =
    backendUrl && backendUrl.startsWith("http")
      ? backendUrl.replace(/^http/, "ws")
      : `ws://${window.location.hostname}:3000`;

  const connectWebSocket = () => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setErrorMessage("Maximum reconnection attempts reached. Please refresh the page.");
      return;
    }
    setConnectionStatus("connecting");
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      setConnectionStatus("connected");
      setErrorMessage("");
      reconnectAttemptsRef.current = 0;
      // As a viewer, request the current game state.
      ws.send(JSON.stringify({ type: "requestGameState" }));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        console.log("Viewer WS message:", data);
        if (data.type === "newQuestion") {
          setPhase(PHASES.QUESTION);
          setCurrentQuestion(data.question);
          setOptions(data.options);
          setTimeLeft(null);
        } else if (data.type === "leaderboard") {
          setPhase(PHASES.LEADERBOARD);
          setLeaderboard(data.scores);
          setCurrentQuestion(data.question);
          setCorrectAnswers(data.correctAnswers);
          setTimeLeft(null);
        } else if (data.type === "timeUpdate") {
          setTimeLeft(data.timeLeft);
        } else if (data.type === "gameOver") {
          setPhase(PHASES.OVER);
          setLeaderboard(data.leaderboard);
        }
      } catch (err) {
        console.error("Error parsing WS message:", err);
      }
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 2000);
      }
    };

    ws.onerror = (err) => {
      setErrorMessage("Failed to connect to server. Is it running?");
      setConnectionStatus("error");
    };

    socketRef.current = ws;
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
    };
    // We intentionally do not include wsUrl in the dependency array to avoid reconnect loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderContent = () => {
    if (phase === PHASES.QUESTION && currentQuestion) {
      return (
        <div className="viewer-section">
          <h2 className="viewer-title">Current Question</h2>
          <h3 className="viewer-question">{currentQuestion}</h3>
          <ul className="viewer-options">
            {options.map((option, idx) => (
              <li key={idx} className="viewer-option">
                {option}
              </li>
            ))}
          </ul>
          {timeLeft !== null && <p className="viewer-timer">Time Left: {timeLeft}s</p>}
        </div>
      );
    } else if (phase === PHASES.LEADERBOARD) {
      return (
        <div className="viewer-section">
          <h2 className="viewer-title">Leaderboard</h2>
          <ul className="viewer-leaderboard">
            {leaderboard.map((entry) => (
              <li key={entry.id} className="viewer-leaderboard-item">
                {entry.id}: {entry.score}
              </li>
            ))}
          </ul>
          <div className="viewer-answer">
            <h3 className="viewer-question">Question: {currentQuestion}</h3>
            <h3 className="viewer-correct">
              Correct Answer: {correctAnswers.join(", ")}
            </h3>
          </div>
        </div>
      );
    } else if (phase === PHASES.OVER) {
      return (
        <div className="viewer-section">
          <h2 className="viewer-title">Game Over!</h2>
          <h3 className="viewer-subtitle">Final Leaderboard:</h3>
          <ul className="viewer-leaderboard">
            {leaderboard.map((entry) => (
              <li key={entry.id} className="viewer-leaderboard-item">
                {entry.id}: {entry.score}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return <h3 className="viewer-waiting">Waiting for game to start...</h3>;
  };

  return (
    <div className="viewer-container">
      {connectionStatus !== "connected" && (
        <p className="viewer-connection-status">{connectionStatus}</p>
      )}
      {errorMessage && <p className="viewer-error">{errorMessage}</p>}
      {renderContent()}
    </div>
  );
};

export default Viewer;
