import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import AdminPanel from "./components/AdminPanel";
import PlayerJoin from "./components/PlayerJoin";
import GameScreen from "./components/GameScreen";
import "./styles/App.css";

function App() {
  const [role, setRole] = useState(null);
  const [playerName, setPlayerName] = useState("");

  useEffect(() => {
    if (window.location.pathname === "/admin") {
      setRole("admin");
    } else {
      setRole("player");
    }
  }, []);

  const handleStartGame = async () => {
    try {
      await fetch("http://localhost:3000/start-game", { method: "POST" });
    } catch (error) {
      console.error("Error starting game:", error);
    }
  };

  return (
    <div className="app-container">
      {role === "admin" && <AdminPanel onStartGame={handleStartGame} />}
      {role === "player" && (playerName ? <GameScreen playerName={playerName} /> : <PlayerJoin onJoin={(name) => setPlayerName(name)} />)}
    </div>
  );
}

export default App;
