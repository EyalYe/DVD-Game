import React, { useState, useEffect } from "react";
import "../styles/AdminPanel.css";

const AdminPanel = ({ onStartGame, backendUrl }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [question, setQuestion] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [options, setOptions] = useState([""]);
  const [correctIndexes, setCorrectIndexes] = useState([]);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [image, setImage] = useState(null);
  const [questions, setQuestions] = useState([]);

  // Use the provided backendUrl or default to localhost
  const ip = backendUrl || "http://localhost:3000";

  // Fetch questions from the backend
  const fetchQuestions = () => {
    fetch(`${ip}/questions`)
      .then((res) => res.json())
      .then((data) => setQuestions(data.questions))
      .catch((err) => console.error("Failed to fetch questions:", err));
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // Handle Admin Login
  const handleLogin = async () => {
    try {
      const response = await fetch(`${ip}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (data.success) {
        setIsAuthenticated(true);
      } else {
        alert("Incorrect password. Try again.");
      }
    } catch (error) {
      console.error("Error during login:", error);
      alert("Server error. Try again.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <h2>Admin Login</h2>
        <input
          type="password"
          placeholder="Enter admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="login-btn" onClick={handleLogin}>
          Login
        </button>
      </div>
    );
  }

  // Add question manually
  const addOption = () => setOptions([...options, ""]);
  const removeOption = (index) => setOptions(options.filter((_, i) => i !== index));

  const toggleCorrectAnswer = (index) => {
    if (isMultipleChoice) {
      setCorrectIndexes((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
      );
    } else {
      setCorrectIndexes([index]);
    }
  };

  const handleImageUpload = (e) => {
    setImage(e.target.files[0]);
  };

  const handleAddQuestion = async () => {
    if (question.trim() === "" || options.some((opt) => opt.trim() === "")) {
      alert("Please fill out the question and all options.");
      return;
    }

    const formData = new FormData();
    formData.append("question", question);
    formData.append("options", JSON.stringify(options));
    formData.append("correctIndexes", JSON.stringify(correctIndexes));
    formData.append("isMultipleChoice", isMultipleChoice);
    if (image) formData.append("image", image);

    try {
      const response = await fetch(`${ip}/add-question`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      console.log(data.message);

      setQuestion("");
      setOptions([""]);
      setCorrectIndexes([]);
      setIsMultipleChoice(false);
      setImage(null);

      fetchQuestions(); // Refresh question list
    } catch (error) {
      console.error("Error adding question:", error);
    }
  };

  // Import multiple questions via JSON
  const handleAddQuestionsFromJson = async () => {
    try {
      const parsedQuestions = JSON.parse(jsonInput);

      if (!Array.isArray(parsedQuestions)) {
        alert("Invalid JSON format. Please provide an array of questions.");
        return;
      }

      const response = await fetch(`${ip}/add-questions-json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: parsedQuestions }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Questions added successfully!");
        setJsonInput(""); // Clear JSON input field
        fetchQuestions(); // Refresh questions list
      } else {
        alert("Failed to add questions.");
      }
    } catch (error) {
      console.error("Error adding questions from JSON:", error);
      alert("Invalid JSON format.");
    }
  };

  // Delete question
  const handleDeleteQuestion = async (id) => {
    try {
      await fetch(`${ip}/delete-question/${id}`, { method: "DELETE" });
      fetchQuestions();
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  // Update multiple-choice toggle per question
  const handleUpdateMultipleChoice = async (id, isMultipleChoice) => {
    try {
      await fetch(`${ip}/update-multiple-choice/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMultipleChoice }),
      });
      fetchQuestions();
    } catch (error) {
      console.error("Error updating multiple-choice setting:", error);
    }
  };

  const handleUpdateCorrectAnswers = async (id, updatedCorrectIndexes, isMultipleChoice) => {
    try {
      const response = await fetch(`${ip}/update-correct-answers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correctIndexes: updatedCorrectIndexes, isMultipleChoice }),
      });
      const data = await response.json();
      if (data.success) {
        fetchQuestions(); // Refresh the question list
      } else {
        alert("Failed to update correct answer.");
      }
    } catch (error) {
      console.error("Error updating correct answer:", error);
    }
  };

  return (
    <div className="admin-container">
      <h2>Admin Panel</h2>

      {/* Add New Question Section */}
      <h3>Add New Question</h3>
      <input
        type="text"
        placeholder="Enter question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="question-input"
      />

      {/* Multiple-choice Toggle */}
      <div className="option-container">
        <label>
          <input
            type="checkbox"
            checked={isMultipleChoice}
            onChange={() => setIsMultipleChoice(!isMultipleChoice)}
          />
          Allow Multiple Answers
        </label>
      </div>

      {/* Answer Options */}
      {options.map((opt, index) => (
        <div key={index} className="option-container">
          <input
            type="text"
            placeholder={`Option ${index + 1}`}
            value={opt}
            onChange={(e) => {
              const newOptions = [...options];
              newOptions[index] = e.target.value;
              setOptions(newOptions);
            }}
          />
          <input
            type={isMultipleChoice ? "checkbox" : "radio"}
            checked={correctIndexes.includes(index)}
            onChange={() => toggleCorrectAnswer(index)}
          />
          <button onClick={() => removeOption(index)} className="delete-btn">
            ❌
          </button>
        </div>
      ))}

      {/* Add Option Button */}
      <button onClick={addOption} className="add-btn">
        ➕ Add Option
      </button>

      {/* Image Upload */}
      <input type="file" accept="image/*" onChange={handleImageUpload} />

      {/* Control Buttons */}
      <div className="button-group">
        <button className="add-btn" onClick={handleAddQuestion}>
          ✅ Add Question
        </button>
        <button className="start-btn" onClick={onStartGame}>
          🚀 Start Game
        </button>
      </div>

      {/* JSON Input Section */}
      <div className="json-input-container">
        <h3>Add Questions via JSON</h3>
        <textarea
          placeholder='Paste JSON here (array of questions)'
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          className="json-textarea"
        ></textarea>
        <button className="json-btn" onClick={handleAddQuestionsFromJson}>
          📥 Import JSON Questions
        </button>
      </div>

      {/* Existing Questions Section */}
      <h3 className="existing-questions">Existing Questions</h3>
      {questions.length === 0 ? (
        <p>No questions added yet.</p>
      ) : (
        questions.map((q) => (
          <div key={q.id} className="question-card">
            <p>
              <strong>{q.question}</strong>
            </p>
            <label>
              <input
                type="checkbox"
                checked={q.isMultipleChoice}
                onChange={() =>
                  handleUpdateMultipleChoice(q.id, !q.isMultipleChoice)
                }
              />
              Multiple Choice
            </label>
            {q.image && (
              <img
                src={`${ip}${q.image}`}
                alt="Question Image"
                className="question-image"
              />
            )}
            <ul className="question-options">
              {q.options.map((option, index) => (
                <li key={index}>
                  <input
                    type={q.isMultipleChoice ? "checkbox" : "radio"}
                    name={`correct-${q.id}`}
                    checked={q.correctIndexes.includes(index)}
                    onChange={() => {
                      const updatedCorrectIndexes = q.isMultipleChoice
                        ? q.correctIndexes.includes(index)
                          ? q.correctIndexes.filter((i) => i !== index)
                          : [...q.correctIndexes, index]
                        : [index];
                      handleUpdateCorrectAnswers(
                        q.id,
                        updatedCorrectIndexes,
                        q.isMultipleChoice
                      );
                    }}
                  />
                  <span>{option}</span>
                </li>
              ))}
            </ul>
            <button
              className="delete-btn"
              onClick={() => handleDeleteQuestion(q.id)}
            >
              ❌ Remove Question
            </button>
          </div>
        ))
      )}
    </div>
  );
};

export default AdminPanel;
