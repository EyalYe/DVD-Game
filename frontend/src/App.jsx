import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AdminPanel from "./components/AdminPanel";
import GameScreen from "./components/GameScreen";
import Viewer from "./components/Viewer"; // Import your Viewer component
import "./styles/App.css";

function App() {
  const handleStartGame = async () => {
    try {
      await fetch("http://localhost:3000/start-game", { method: "POST" });
    } catch (error) {
      console.error("Error starting game:", error);
    }
  };

  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/admin" element={<AdminPanel onStartGame={handleStartGame} />} />
          <Route path="/view" element={<Viewer />} />
          <Route path="/" element={<GameScreen />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
