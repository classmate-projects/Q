const crypto = require('crypto');

const COOKIE_NAME = 'q_admin_session';
const sessions = new Set();

function login(password) {
  const expected = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== expected) return null;
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  return token;
}

function logout(token) {
  sessions.delete(token);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token && sessions.has(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { login, logout, requireAuth, COOKIE_NAME };
