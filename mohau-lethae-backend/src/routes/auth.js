// src/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { issueToken, requireAdmin, TOKEN_COOKIE } = require("../middleware/auth");

const router = express.Router();

// Rate-limited per docs/SECURITY.md — blunts credential-stuffing against
// the single known admin account.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});

router.post("/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const admin = db.prepare("SELECT * FROM admin_users WHERE email = ?").get(email);
  // Deliberately identical error for "no such user" and "wrong password" —
  // don't let the response shape leak which admin emails exist.
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = issueToken(admin.email);
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true, email: admin.email });
});

router.post("/logout", (req, res) => {
  res.clearCookie(TOKEN_COOKIE);
  res.json({ ok: true });
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

module.exports = router;
