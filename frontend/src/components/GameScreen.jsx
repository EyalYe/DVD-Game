import React, { useState, useEffect, useRef } from "react";
import "../styles/GameScreen.css";

const GameScreen = ({ playerName }) => {
  const [question, setQuestion] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = new WebSocket("ws://localhost:3000");
      socketRef.current.onopen = () => console.log("Connected to WebSocket");
      socketRef.current.onmessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.type === "question") {
          setQuestion(data.question);
          setIsMultipleChoice(data.isMultipleChoice);
          setSelectedAnswers([]);
          setFeedback(null);
          setSubmitted(false);
        }
      };
    }
  }, []);

  const handleSelectAnswer = (index) => {
    if (submitted) return;
    if (isMultipleChoice) {
      setSelectedAnswers((prev) =>
        prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index]
      );
    } else {
      setSelectedAnswers([index]);
    }
  };

  const handleSubmit = () => {
    if (selectedAnswers.length === 0) {
      alert("Please select an answer!");
      return;
    }
    socketRef.current.send(
      JSON.stringify({
        type: "answer",
        player: playerName,
        answerIndexes: selectedAnswers,
      })
    );
    setSubmitted(true);
  };

  return (
    <div className="game-screen">
      {question ? (
        <div className="question-card">
          <h3>{question.question}</h3>
          {question.image && (
            <img
              src={`http://localhost:3000${question.image}`}
              alt="Question"
              className="question-image"
            />
          )}
          <ul className="question-options">
            {question.options.map((option, index) => (
              <li key={index}>
                <input
                  type={isMultipleChoice ? "checkbox" : "radio"}
                  name="answer"
                  checked={selectedAnswers.includes(index)}
                  onChange={() => handleSelectAnswer(index)}
                  disabled={submitted}
                />
                <span>{option}</span>
              </li>
            ))}
          </ul>
          <button className="submit-btn" onClick={handleSubmit} disabled={submitted}>
            {submitted ? "Answer Submitted" : "Submit Answer"}
          </button>
        </div>
      ) : (
        <h3>Waiting for the next question...</h3>
      )}
    </div>
  );
};

export default GameScreen;
