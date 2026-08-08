require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');

const db = require('./src/db');
const auth = require('./src/auth');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function broadcast(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) client.send(data);
  });
}

// ---- Pages (server-rendered) ----

app.get('/', (req, res) => {
  res.render('index', { services: db.listServices() });
});

app.get('/display', (req, res) => {
  res.render('display', { services: db.listServices() });
});

app.get('/desk', (req, res) => {
  res.render('desk', { services: db.listServices() });
});

app.get('/admin', (req, res) => {
  res.render('admin');
});

// ---- Public API (customer + display + desk pages) ----

app.get('/api/services', (req, res) => {
  res.json(db.listServices());
});

// A customer takes a token (joins the queue).
app.post('/api/services/:id/token', (req, res) => {
  const result = db.takeToken(req.params.id);
  if (!result) return res.status(404).json({ error: 'Service not found' });
  broadcast({ type: 'queue', id: result.id, waiting: result.waiting });
  res.json(result);
});

// A desk calls the next waiting token (FIFO).
app.post('/api/services/:id/desks/:desk/call', (req, res) => {
  const result = db.callNext(req.params.id, parseInt(req.params.desk, 10));
  if (!result) return res.status(404).json({ error: 'Service or desk not found' });
  if (result.called) broadcast({ type: 'call', ...result });
  res.json(result);
});

// A desk re-announces the token it is already serving.
app.post('/api/services/:id/desks/:desk/recall', (req, res) => {
  const result = db.recall(req.params.id, parseInt(req.params.desk, 10));
  if (!result) return res.status(404).json({ error: 'Service or desk not found' });
  if (result.token) broadcast({ type: 'recall', ...result });
  res.json(result);
});

// ---- Admin auth ----

app.post('/api/admin/login', (req, res) => {
  const token = auth.login(req.body.password || '');
  if (!token) return res.status(401).json({ error: 'Invalid password' });
  res.cookie(auth.COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

app.post('/api/admin/logout', auth.requireAuth, (req, res) => {
  auth.logout(req.cookies[auth.COOKIE_NAME]);
  res.clearCookie(auth.COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/admin/check', auth.requireAuth, (req, res) => res.json({ ok: true }));

// ---- Admin service management ----

app.get('/api/admin/services', auth.requireAuth, (req, res) => {
  res.json(db.listServices());
});

app.post('/api/admin/services', auth.requireAuth, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const service = db.addService(name, req.body.deskCount);
  broadcast({ type: 'services-updated' });
  res.json(service);
});

app.patch('/api/admin/services/:id', auth.requireAuth, (req, res) => {
  const service = db.setDeskCount(req.params.id, req.body.deskCount);
  if (!service) return res.status(404).json({ error: 'Not found' });
  broadcast({ type: 'services-updated' });
  res.json(service);
});

app.delete('/api/admin/services/:id', auth.requireAuth, (req, res) => {
  const ok = db.deleteService(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  broadcast({ type: 'services-updated' });
  res.json({ ok: true });
});

// ---- Daily report ----

app.get('/api/admin/report', auth.requireAuth, (req, res) => {
  const date = req.query.date || db.todayStr();
  const rows = db.getReport(date);
  const lines = [
    'Service,Customers Served',
    ...rows.map(r => `"${r.name.replace(/"/g, '""')}",${r.count}`),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="report-${date}.csv"`);
  res.send(lines.join('\n'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Q token system running at http://localhost:${PORT}`);
  console.log(`  Customer page: http://localhost:${PORT}/`);
  console.log(`  Display page:  http://localhost:${PORT}/display`);
  console.log(`  Desk page:     http://localhost:${PORT}/desk`);
  console.log(`  Admin page:    http://localhost:${PORT}/admin`);
});
