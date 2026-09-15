// src/middleware/auth.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Copy .env.example to .env and set a real secret.");
}

const TOKEN_COOKIE = "mohau_admin_session";
const TOKEN_TTL = "12h"; // short-lived per docs/SECURITY.md

function issueToken(adminEmail) {
  return jwt.sign({ sub: adminEmail, role: "admin" }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Requires a valid admin session, via cookie (browser admin UI) or
// Authorization: Bearer header (for programmatic/API use).
function requireAdmin(req, res, next) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.[TOKEN_COOKIE] || bearer;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = { email: payload.sub };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired or invalid. Please log in again." });
  }
}

module.exports = { issueToken, requireAdmin, TOKEN_COOKIE, TOKEN_TTL };
