import React, { useState } from "react";
import "../styles/PlayerJoin.css";

const PlayerJoin = ({ onJoin }) => {
  const [name, setName] = useState("");

  const handleJoin = () => {
    if (name.trim() === "") {
      alert("Please enter your name.");
      return;
    }
    onJoin(name);
  };

  return (
    <div className="player-join-container">
      <h2>Join the Game</h2>
      <input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="join-btn" onClick={handleJoin}>Join</button>
    </div>
  );
};

export default PlayerJoin;
