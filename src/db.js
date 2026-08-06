const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { services: [], tokens: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return { services: [], tokens: [] };
  }
}

let state = load();

function save() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
}

// A service's currentToken/previousToken only apply to the day named in
// tokenDate. If that day isn't today, nothing has been issued yet today.
function displayState(service) {
  if (service.tokenDate === todayStr()) {
    return { currentToken: service.currentToken, previousToken: service.previousToken };
  }
  return { currentToken: 0, previousToken: 0 };
}

function listServices({ includeInactive = false } = {}) {
  return state.services
    .filter(s => includeInactive || s.active)
    .map(s => ({ id: s.id, name: s.name, active: s.active, ...displayState(s) }));
}

function addService(name) {
  const service = {
    id: crypto.randomUUID(),
    name: name.trim(),
    active: true,
    currentToken: 0,
    previousToken: 0,
    tokenDate: null,
    createdAt: new Date().toISOString(),
  };
  state.services.push(service);
  save();
  return service;
}

function deleteService(id) {
  const service = state.services.find(s => s.id === id);
  if (!service) return false;
  service.active = false;
  save();
  return true;
}

function generateToken(serviceId) {
  const service = state.services.find(s => s.id === serviceId && s.active);
  if (!service) return null;

  const today = todayStr();
  if (service.tokenDate !== today) {
    service.currentToken = 0;
    service.previousToken = 0;
    service.tokenDate = today;
  }

  service.previousToken = service.currentToken;
  service.currentToken += 1;

  state.tokens.push({
    id: crypto.randomUUID(),
    serviceId: service.id,
    tokenNumber: service.currentToken,
    date: today,
    issuedAt: new Date().toISOString(),
  });

  save();

  return {
    id: service.id,
    name: service.name,
    currentToken: service.currentToken,
    previousToken: service.previousToken,
  };
}

// Includes inactive services if they had activity that day, so a report for
// a past date stays accurate even after a service is later deleted.
function getReport(date) {
  return state.services
    .map(s => ({
      name: s.name,
      active: s.active,
      count: state.tokens.filter(t => t.serviceId === s.id && t.date === date).length,
    }))
    .filter(r => r.active || r.count > 0);
}

module.exports = { todayStr, listServices, addService, deleteService, generateToken, getReport };
