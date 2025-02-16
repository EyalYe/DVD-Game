import React, { useState, useEffect } from "react";
import "../styles/GameScreen.css";

const GameScreen = ({ playerName }) => {
  const [question, setQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000");
    ws.onopen = () => console.log("Connected to WebSocket");
    ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.type === "question") {
        setQuestion(data.question);
        setSelectedAnswer(null);
        setFeedback(null);
      }
    };

    setSocket(ws);
    return () => ws.close();
  }, []);

  const handleAnswerSubmit = () => {
    if (selectedAnswer === null) {
      alert("Please select an answer.");
      return;
    }

    socket.send(JSON.stringify({
      type: "answer",
      player: playerName,
      answerIndex: selectedAnswer
    }));

    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.type === "feedback") {
        setFeedback(data.correct ? "✅ Correct!" : "❌ Incorrect");
      }
    };
  };

  if (!question) return <p>Waiting for the game to start...</p>;

  return (
    <div className="game-screen-container">
      <h2>{question.question}</h2>
      {question.image && <img src={`http://localhost:3000${question.image}`} alt="Question" />}
      <ul>
        {question.options.map((option, index) => (
          <li key={index}>
            <label>
              <input
                type="radio"
                name="answer"
                value={index}
                checked={selectedAnswer === index}
                onChange={() => setSelectedAnswer(index)}
              />
              {option}
            </label>
          </li>
        ))}
      </ul>
      <button className="submit-btn" onClick={handleAnswerSubmit}>Submit Answer</button>
      {feedback && <p className="feedback">{feedback}</p>}
    </div>
  );
};

export default GameScreen;
