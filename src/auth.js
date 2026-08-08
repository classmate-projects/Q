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

function isAuthed(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  return valid(token);
}

// Guard for JSON API routes: responds 401 when unauthenticated.
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Guard for server-rendered pages: redirects to the login gate, preserving the
// originally requested path so we can return there after a successful login.
function requirePage(req, res, next) {
  if (isAuthed(req)) return next();
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

// Only allow same-origin relative paths as a post-login redirect target, so the
// `next` query param can't be used as an open redirect to another site.
function safeNext(next) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/';
}

module.exports = { login, requireAuth, requirePage, safeNext, isAuthed, COOKIE_NAME };
