import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AdminPanel from "./components/AdminPanel";
import GameScreen from "./components/GameScreen";
import Viewer from "./components/Viewer"; // Import your Viewer component
import "./styles/App.css";

// Use the environment variable or fallback to localhost
const ip = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

function App() {
  const handleStartGame = async () => {
    try {
      await fetch(`${ip}/start-game`, { method: "POST" });
    } catch (error) {
      console.error("Error starting game:", error);
    }
  };

  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route
            path="/admin"
            element={<AdminPanel onStartGame={handleStartGame} backendUrl={ip} />}
          />
          <Route path="/view" element={<Viewer backendUrl={ip} />} />
          <Route path="/" element={<GameScreen backendUrl={ip} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
