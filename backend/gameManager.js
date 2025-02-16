const Database = require("better-sqlite3");

// Initialize database
const db = new Database("./data/questions.db");

// Create questions table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correctIndexes TEXT NOT NULL,
    isMultipleChoice INTEGER NOT NULL,
    image TEXT
  );
`);

// Add a question to the database
function addQuestion(question, options, correctIndexes, isMultipleChoice, image) {
  const stmt = db.prepare(`
    INSERT INTO questions (question, options, correctIndexes, isMultipleChoice, image)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    question,
    JSON.stringify(options),
    JSON.stringify(correctIndexes),
    isMultipleChoice ? 1 : 0,
    image || null
  );
}

// Get all questions from the database
function getQuestions() {
  return db.prepare("SELECT * FROM questions").all().map(q => ({
    ...q,
    options: JSON.parse(q.options),
    correctIndexes: JSON.parse(q.correctIndexes),
  }));
}
// Delete a question from the database
function deleteQuestion(id) {
  const stmt = db.prepare("DELETE FROM questions WHERE id = ?");
  stmt.run(id);
}

function updateCorrectAnswers(id, correctIndexes, isMultipleChoice) {
  const stmt = db.prepare(`
    UPDATE questions
    SET correctIndexes = ?, isMultipleChoice = ?
    WHERE id = ?
  `);
  stmt.run(JSON.stringify(correctIndexes), isMultipleChoice ? 1 : 0, id);
}

function updateMultipleChoice(id, isMultipleChoice) {
  const stmt = db.prepare(`
    UPDATE questions
    SET isMultipleChoice = ?
    WHERE id = ?
  `);
  stmt.run(isMultipleChoice ? 1 : 0, id);
}

module.exports = { addQuestion, getQuestions, deleteQuestion, updateCorrectAnswers, updateMultipleChoice };
