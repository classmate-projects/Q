require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const ejs = require('ejs');

const db = require('./src/db');
const auth = require('./src/auth');
const subscription = require('./src/subscription');

// Resolve views/public whether we run locally (node server.js) or bundled inside
// a Netlify function, where the working directory differs.
function resolveDir(name) {
  const candidates = [
    path.join(__dirname, name),
    path.join(process.cwd(), name),
    process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, name),
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

const app = express();
// Register the EJS engine explicitly (with a static require above) so the
// serverless bundler includes ejs and Express never does its dynamic
// `require('ejs')` at render time, which fails in a bundled function.
app.engine('ejs', ejs.__express);
app.set('view engine', 'ejs');
app.set('views', resolveDir('views'));

app.use(express.json());
app.use(cookieParser());
app.use(express.static(resolveDir('public')));

// ---- Login gate (unprotected) ----

// Every page and API below is protected by the admin password. Unauthenticated
// visitors land here (via requirePage) and are returned to their original
// destination after logging in.
app.get('/login', (req, res) => {
  if (auth.isAuthed(req)) return res.redirect(auth.safeNext(req.query.next));
  res.render('login', { next: auth.safeNext(req.query.next) });
});

app.post('/api/admin/login', (req, res) => {
  const token = auth.login(req.body.password || '');
  if (!token) return res.status(401).json({ error: 'Invalid password' });
  res.cookie(auth.COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

// ---- Pages (server-rendered, password-protected) ----

app.get('/', auth.requirePage, (req, res) => res.render('home'));

app.get('/customer', auth.requirePage, async (req, res) => {
  const limits = await subscription.getLimits();
  res.render('index', { services: await db.listServices({ enabledOnly: true, limits }) });
});

app.get('/display', auth.requirePage, async (req, res) => {
  const limits = await subscription.getLimits();
  res.render('display', { services: await db.listServices({ enabledOnly: true, limits }) });
});

app.get('/desk', auth.requirePage, async (req, res) => {
  const limits = await subscription.getLimits();
  res.render('desk', { services: await db.listServices({ enabledOnly: true, limits }) });
});

app.get('/admin', auth.requirePage, (req, res) => res.render('admin'));

// ---- API (customer + display + desk pages, password-protected) ----

app.get('/api/services', auth.requireAuth, async (req, res) => {
  const limits = await subscription.getLimits();
  res.json(await db.listServices({ enabledOnly: true, limits }));
});

// A customer takes a token (joins the queue). Gated by the plan's per-service
// daily cap and service limit (Free plan).
app.post('/api/services/:id/token', auth.requireAuth, async (req, res) => {
  const limits = await subscription.getLimits();
  const result = await db.takeToken(req.params.id, limits);
  if (result.ok) {
    return res.json({ id: result.id, name: result.name, token: result.token, waiting: result.waiting });
  }
  if (result.reason === 'not_found') {
    return res.status(404).json({ error: 'Service not found' });
  }
  if (result.reason === 'token_limit') {
    return res.status(403).json({
      reason: 'token_limit',
      error: `Daily limit reached — this service has issued its ${result.limit} tokens for today (Free plan). Contact the administrator to upgrade.`,
    });
  }
  if (result.reason === 'service_disabled') {
    return res.status(403).json({
      reason: 'service_disabled',
      error: 'This service is unavailable on the Free plan. Contact the administrator to upgrade.',
    });
  }
  return res.status(400).json({ error: 'Unable to issue token' });
});

// A desk calls the next waiting token (FIFO).
app.post('/api/services/:id/desks/:desk/call', auth.requireAuth, async (req, res) => {
  const result = await db.callNext(req.params.id, parseInt(req.params.desk, 10));
  if (!result) return res.status(404).json({ error: 'Service or desk not found' });
  res.json(result);
});

// A desk re-announces the token it is already serving.
app.post('/api/services/:id/desks/:desk/recall', auth.requireAuth, async (req, res) => {
  const result = await db.recall(req.params.id, parseInt(req.params.desk, 10));
  if (!result) return res.status(404).json({ error: 'Service or desk not found' });
  res.json(result);
});

// Desk page only: whether to show the "subscription nearing expiry" reminder.
// Also runs the daily subscription evaluation (auto-downgrade). Deliberately
// exposes no plan/date details to the customer/display pages.
app.get('/api/desk-alert', auth.requireAuth, async (req, res) => {
  try {
    const s = await subscription.getStatus();
    res.json({ show: s.nearExpiry, daysRemaining: s.daysRemaining, today: s.today });
  } catch {
    res.json({ show: false });
  }
});

// ---- Admin auth ----

app.post('/api/admin/logout', auth.requireAuth, (req, res) => {
  res.clearCookie(auth.COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/admin/check', auth.requireAuth, (req, res) => res.json({ ok: true }));

// Admin only: subscription status (plan, days remaining, near-expiry flag).
app.get('/api/admin/subscription', auth.requireAuth, async (req, res) => {
  try {
    res.json(await subscription.getStatus());
  } catch {
    res.status(500).json({ error: 'Subscription check failed' });
  }
});

// ---- Admin service management ----

app.get('/api/admin/services', auth.requireAuth, async (req, res) => {
  const limits = await subscription.getLimits();
  res.json(await db.listServices({ limits }));
});

app.post('/api/admin/services', auth.requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const service = await db.addService(name, req.body.deskCount);
  res.json(service);
});

app.patch('/api/admin/services/:id', auth.requireAuth, async (req, res) => {
  const service = await db.setDeskCount(req.params.id, req.body.deskCount);
  if (!service) return res.status(404).json({ error: 'Not found' });
  res.json(service);
});

app.delete('/api/admin/services/:id', auth.requireAuth, async (req, res) => {
  const ok = await db.deleteService(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ---- Daily report ----

app.get('/api/admin/report', auth.requireAuth, async (req, res) => {
  const date = req.query.date || db.todayStr();
  const rows = await db.getReport(date);
  const lines = [
    'Service,Customers Served',
    ...rows.map(r => `"${r.name.replace(/"/g, '""')}",${r.count}`),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="report-${date}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = app;
