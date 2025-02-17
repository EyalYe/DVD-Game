const express = require("express");
const cors = require("cors");
const router = express.Router();
require("dotenv").config();
app.use(cors());
// Admin login route
router.post("/admin-login", (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, message: "Login successful!" });
  } else {
    res.status(401).json({ success: false, message: "Incorrect password" });
  }
});

module.exports = router;
