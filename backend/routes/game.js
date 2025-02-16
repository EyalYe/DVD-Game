const express = require("express");
const multer = require("multer");
const path = require("path");
const { addQuestion, getQuestions, deleteQuestion, updateCorrectAnswers} = require("../gameManager");
const { updateMultipleChoice } = require("../gameManager");
const router = express.Router();

// Set up storage for images
const storage = multer.diskStorage({
  destination: "backend/uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Route to add a question with an optional image
router.post("/add-question", upload.single("image"), (req, res) => {
  const { question, options, correctIndexes, isMultipleChoice } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (!question || !options || !correctIndexes) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  addQuestion(question, JSON.parse(options), JSON.parse(correctIndexes), isMultipleChoice === "true", image);
  res.json({ success: true, message: "Question added successfully!" });
});

// Route to get all questions
router.get("/questions", (req, res) => {
  res.json({ success: true, questions: getQuestions() });
});

// Route to delete a question
router.delete("/delete-question/:id", (req, res) => {
  const { id } = req.params;
  deleteQuestion(id);
  res.json({ success: true, message: "Question deleted successfully!" });
});

router.post("/add-questions-json", (req, res) => {
  const { questions } = req.body;

  if (!questions || !Array.isArray(questions)) {
    return res.status(400).json({ success: false, message: "Invalid JSON format." });
  }

  try {
    questions.forEach(({ question, options, correctIndexes, isMultipleChoice, image }) => {
      addQuestion(question, options, correctIndexes, isMultipleChoice, image);
    });

    res.json({ success: true, message: "Questions added successfully!" });
  } catch (error) {
    console.error("Error adding questions:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

router.put("/update-correct-answers/:id", (req, res) => {
  const { id } = req.params;
  const { correctIndexes, isMultipleChoice } = req.body;

  if (!correctIndexes || !Array.isArray(correctIndexes)) {
    return res.status(400).json({ success: false, message: "Invalid data format." });
  }

  try {
    updateCorrectAnswers(id, correctIndexes, isMultipleChoice);
    res.json({ success: true, message: "Correct answer updated successfully!" });
  } catch (error) {
    console.error("Error updating correct answer:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

router.put("/update-multiple-choice/:id", (req, res) => {
  const { id } = req.params;
  const { isMultipleChoice } = req.body;

  if (typeof isMultipleChoice !== "boolean") {
    return res.status(400).json({ success: false, message: "Invalid data format." });
  }

  try {
    updateMultipleChoice(id, isMultipleChoice);
    res.json({ success: true, message: "Multiple choice setting updated!" });
  } catch (error) {
    console.error("Error updating multiple choice setting:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;
