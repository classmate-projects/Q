const crypto = require('crypto');

const COOKIE_NAME = 'q_admin_session';

// Stateless auth: the session cookie is an HMAC of a fixed marker keyed by the
// admin password. This works across serverless instances (no shared in-memory
// session store) and invalidates automatically if the password changes.
function secret() {
  return process.env.ADMIN_PASSWORD || 'admin123';
}

function sign() {
  return crypto.createHmac('sha256', secret()).update('q-admin').digest('hex');
}

function valid(token) {
  if (!token) return false;
  const expected = sign();
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function login(password) {
  if (password !== secret()) return null;
  return sign();
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (valid(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { login, requireAuth, COOKIE_NAME };
