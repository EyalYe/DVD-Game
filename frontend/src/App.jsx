import React, { useState } from "react";
import AdminPanel from "./components/AdminPanel";
import PlayerJoin from "./components/PlayerJoin";
import GameScreen from "./components/GameScreen";
import "./styles/App.css";

function App() {
  const [role, setRole] = useState(null);
  const [playerName, setPlayerName] = useState("");

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
      {role === "player" && <GameScreen playerName={playerName} />}
      {!role && (
        <div className="role-selection">
          <h2>Select Your Role</h2>
          <button onClick={() => setRole("admin")}>Admin</button>
          <button onClick={() => setRole("player")}>Player</button>
        </div>
      )}
      {role === "player" && !playerName && <PlayerJoin onJoin={(name) => setPlayerName(name)} />}
    </div>
  );
}

export default App;
