const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.QUEUE_DB_PATH || path.join(__dirname, '..', 'data', 'db.json');
const MAX_DESKS = 20;

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clampDesks(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_DESKS);
}

// Backfill fields for services saved under the older arrival-only schema so old
// data keeps working after the upgrade to the multi-desk calling model.
function normalize(data) {
  const s = { services: [], tokens: [], ...data };
  s.services = Array.isArray(s.services) ? s.services : [];
  s.tokens = Array.isArray(s.tokens) ? s.tokens : [];
  const today = todayStr();
  for (const svc of s.services) {
    if (typeof svc.active !== 'boolean') svc.active = true;
    if (typeof svc.deskCount !== 'number' || svc.deskCount < 1) svc.deskCount = 1;
    if (typeof svc.issued !== 'number') {
      svc.issued = s.tokens.filter(t => t.serviceId === svc.id && t.date === today).length;
    }
    if (typeof svc.lastCalled !== 'number') svc.lastCalled = 0;
    if (!Array.isArray(svc.desks)) svc.desks = [];
    delete svc.currentToken; // obsolete field from the arrival-only model
  }
  return s;
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { services: [], tokens: [] };
  }
  try {
    return normalize(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')));
  } catch {
    return { services: [], tokens: [] };
  }
}

let state = load();

function save() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
}

// Fallback 0-7 color index derived from the id, for services migrated from an
// older schema that predates the stored colorIndex. New services get a color
// assigned in creation order (see addService) so neighbours always differ.
function hashColorIndex(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 8;
}

function serviceColor(service) {
  return typeof service.colorIndex === 'number' ? service.colorIndex : hashColorIndex(service.id);
}

// Called before any mutation. Resets the day's counters when the date rolls
// over and keeps the desks array length in sync with deskCount.
function rollDay(service) {
  if (service.tokenDate !== todayStr()) {
    service.tokenDate = todayStr();
    service.issued = 0;
    service.lastCalled = 0;
    service.desks = Array.from({ length: service.deskCount }, () => 0);
  }
  if (!Array.isArray(service.desks)) service.desks = [];
  while (service.desks.length < service.deskCount) service.desks.push(0);
  if (service.desks.length > service.deskCount) service.desks.length = service.deskCount;
}

// Read-only view of today's serving state (never mutates / saves). Counters
// read as 0 when the stored day isn't today (nothing issued yet today).
function servingState(service) {
  const onToday = service.tokenDate === todayStr();
  const issued = onToday ? service.issued || 0 : 0;
  const lastCalled = onToday ? service.lastCalled || 0 : 0;
  const desks = [];
  for (let i = 0; i < service.deskCount; i++) {
    const current = onToday && Array.isArray(service.desks) ? service.desks[i] || 0 : 0;
    desks.push({ number: i + 1, current });
  }
  return { deskCount: service.deskCount, issued, lastCalled, waiting: issued - lastCalled, desks };
}

function publicService(service) {
  return {
    id: service.id,
    name: service.name,
    active: service.active,
    colorIndex: serviceColor(service),
    ...servingState(service),
  };
}

function listServices({ includeInactive = false } = {}) {
  return state.services
    .filter(s => includeInactive || s.active)
    .map(publicService);
}

function getService(id) {
  const service = state.services.find(s => s.id === id && s.active);
  return service ? publicService(service) : null;
}

function addService(name, deskCount = 1) {
  const service = {
    id: crypto.randomUUID(),
    name: name.trim(),
    active: true,
    colorIndex: state.services.length % 8, // next color in the palette order
    deskCount: clampDesks(deskCount),
    issued: 0,
    lastCalled: 0,
    desks: [],
    tokenDate: null,
    createdAt: new Date().toISOString(),
  };
  state.services.push(service);
  save();
  return publicService(service);
}

function deleteService(id) {
  const service = state.services.find(s => s.id === id);
  if (!service) return false;
  service.active = false;
  save();
  return true;
}

function setDeskCount(id, deskCount) {
  const service = state.services.find(s => s.id === id && s.active);
  if (!service) return null;
  service.deskCount = clampDesks(deskCount);
  rollDay(service);
  save();
  return publicService(service);
}

// A customer takes a token (joins the queue).
function takeToken(serviceId) {
  const service = state.services.find(s => s.id === serviceId && s.active);
  if (!service) return null;

  rollDay(service);
  service.issued += 1;

  state.tokens.push({
    id: crypto.randomUUID(),
    serviceId: service.id,
    tokenNumber: service.issued,
    date: todayStr(),
    issuedAt: new Date().toISOString(),
  });

  save();
  return {
    id: service.id,
    name: service.name,
    token: service.issued,
    waiting: service.issued - service.lastCalled,
  };
}

// A desk calls the next waiting token (FIFO). Returns { called:false } when the
// queue is caught up, null for an unknown service/desk.
function callNext(serviceId, deskNumber) {
  const service = state.services.find(s => s.id === serviceId && s.active);
  if (!service) return null;
  rollDay(service);

  const idx = deskNumber - 1;
  if (idx < 0 || idx >= service.deskCount) return null;

  if (service.lastCalled >= service.issued) {
    return { id: service.id, name: service.name, deskNumber, called: false, waiting: 0 };
  }

  service.lastCalled += 1;
  service.desks[idx] = service.lastCalled;
  save();

  return {
    id: service.id,
    name: service.name,
    colorIndex: serviceColor(service),
    deskNumber,
    token: service.lastCalled,
    called: true,
    waiting: service.issued - service.lastCalled,
  };
}

// Re-announce the token a desk is already serving (no queue advance).
function recall(serviceId, deskNumber) {
  const service = state.services.find(s => s.id === serviceId && s.active);
  if (!service) return null;
  rollDay(service);

  const idx = deskNumber - 1;
  if (idx < 0 || idx >= service.deskCount) return null;

  const token = service.desks[idx] || 0;
  return {
    id: service.id,
    name: service.name,
    colorIndex: serviceColor(service),
    deskNumber,
    token,
  };
}

// Includes inactive services if they had activity that day, so a report for
// a past date stays accurate even after a service is later deleted. Counts
// tokens taken (customers arrived) per service.
function getReport(date) {
  return state.services
    .map(s => ({
      name: s.name,
      active: s.active,
      count: state.tokens.filter(t => t.serviceId === s.id && t.date === date).length,
    }))
    .filter(r => r.active || r.count > 0);
}

module.exports = {
  todayStr,
  listServices,
  getService,
  addService,
  deleteService,
  setDeskCount,
  takeToken,
  callNext,
  recall,
  getReport,
};
