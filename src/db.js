const crypto = require('crypto');
const storage = require('./storage');
const { todayStr, clampDesks } = require('./util');

// Fallback color index for services migrated from a schema without a stored
// colorIndex. New services get a color in creation order (see addService).
function hashColorIndex(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 8;
}

function serviceColor(service) {
  return typeof service.colorIndex === 'number' ? service.colorIndex : hashColorIndex(service.id);
}

// Reset the day's counters when the date rolls over and keep the desks array
// length in sync with deskCount. Each desk is { current, pulse } — pulse bumps
// on every call and recall so polling clients can detect a re-announcement.
function rollDay(service) {
  if (service.tokenDate !== todayStr()) {
    service.tokenDate = todayStr();
    service.issued = 0;
    service.lastCalled = 0;
    service.desks = Array.from({ length: service.deskCount }, () => ({ current: 0, pulse: 0 }));
  }
  if (!Array.isArray(service.desks)) service.desks = [];
  while (service.desks.length < service.deskCount) service.desks.push({ current: 0, pulse: 0 });
  if (service.desks.length > service.deskCount) service.desks.length = service.deskCount;
}

function servingState(service) {
  const onToday = service.tokenDate === todayStr();
  const issued = onToday ? service.issued || 0 : 0;
  const lastCalled = onToday ? service.lastCalled || 0 : 0;
  const desks = [];
  for (let i = 0; i < service.deskCount; i++) {
    const d = onToday && Array.isArray(service.desks) ? service.desks[i] : null;
    desks.push({ number: i + 1, current: (d && d.current) || 0, pulse: (d && d.pulse) || 0 });
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

// The IDs of the services that stay enabled under the given plan limits: the
// oldest `maxServices` active ones (stable by creation order). Any active
// service outside this set is treated as temporarily disabled by the plan.
function enabledServiceIds(state, limits) {
  const max = limits ? limits.maxServices : Infinity;
  const active = state.services
    .filter(s => s.active)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return new Set(active.slice(0, max).map(s => s.id));
}

// listServices options:
//   includeInactive - also return admin-deleted (active:false) services
//   enabledOnly     - drop services the current plan has disabled (public pages)
//   limits          - plan limits from subscription.getLimits(); when omitted,
//                     no plan gating is applied (everything enabled, unlimited)
// Each returned service gains `planDisabled` (beyond the plan's service limit)
// and `full` (reached the plan's per-service daily token cap).
async function listServices({ includeInactive = false, enabledOnly = false, limits = null } = {}) {
  const state = await storage.read();
  const enabledIds = enabledServiceIds(state, limits);
  const maxTokens = limits ? limits.maxTokensPerService : Infinity;
  return state.services
    .filter(s => includeInactive || s.active)
    .map(s => {
      const pub = publicService(s);
      pub.planDisabled = s.active && !enabledIds.has(s.id);
      pub.full = pub.issued >= maxTokens;
      return pub;
    })
    .filter(s => (enabledOnly ? !s.planDisabled : true));
}

async function addService(name, deskCount = 1) {
  const state = await storage.read();
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
  await storage.write(state);
  return publicService(service);
}

async function deleteService(id) {
  const state = await storage.read();
  const service = state.services.find(s => s.id === id);
  if (!service) return false;
  service.active = false;
  await storage.write(state);
  return true;
}

async function setDeskCount(id, deskCount) {
  const state = await storage.read();
  const service = state.services.find(s => s.id === id && s.active);
  if (!service) return null;
  service.deskCount = clampDesks(deskCount);
  rollDay(service);
  await storage.write(state);
  return publicService(service);
}

// A customer takes a token (joins the queue). `limits` (from
// subscription.getLimits) gates issuance under the Free plan. Returns a tagged
// result: { ok:true, ... } on success, or { ok:false, reason } where reason is
// 'not_found', 'service_disabled' (beyond the free service limit) or
// 'token_limit' (reached the per-service daily cap).
async function takeToken(serviceId, limits = null) {
  const state = await storage.read();
  const service = state.services.find(s => s.id === serviceId && s.active);
  if (!service) return { ok: false, reason: 'not_found' };

  const enabledIds = enabledServiceIds(state, limits);
  if (!enabledIds.has(service.id)) return { ok: false, reason: 'service_disabled' };

  rollDay(service);

  const maxTokens = limits ? limits.maxTokensPerService : Infinity;
  if (service.issued >= maxTokens) {
    return { ok: false, reason: 'token_limit', limit: maxTokens };
  }

  service.issued += 1;
  state.tokens.push({
    id: crypto.randomUUID(),
    serviceId: service.id,
    tokenNumber: service.issued,
    date: todayStr(),
    issuedAt: new Date().toISOString(),
  });

  await storage.write(state);
  return {
    ok: true,
    id: service.id,
    name: service.name,
    token: service.issued,
    waiting: service.issued - service.lastCalled,
  };
}

// A desk calls the next waiting token (FIFO). Returns { called:false } when the
// queue is caught up, null for an unknown service/desk.
async function callNext(serviceId, deskNumber) {
  const state = await storage.read();
  const service = state.services.find(s => s.id === serviceId && s.active);
  if (!service) return null;
  rollDay(service);

  const idx = deskNumber - 1;
  if (idx < 0 || idx >= service.deskCount) return null;

  if (service.lastCalled >= service.issued) {
    return { id: service.id, name: service.name, deskNumber, called: false, waiting: 0 };
  }

  service.lastCalled += 1;
  service.desks[idx].current = service.lastCalled;
  service.desks[idx].pulse = (service.desks[idx].pulse || 0) + 1;
  await storage.write(state);

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

// Re-announce the token a desk is already serving. Bumps pulse (no queue
// advance) so polling clients can flash/chime the re-announcement.
async function recall(serviceId, deskNumber) {
  const state = await storage.read();
  const service = state.services.find(s => s.id === serviceId && s.active);
  if (!service) return null;
  rollDay(service);

  const idx = deskNumber - 1;
  if (idx < 0 || idx >= service.deskCount) return null;

  const token = service.desks[idx].current || 0;
  if (token) {
    service.desks[idx].pulse = (service.desks[idx].pulse || 0) + 1;
    await storage.write(state);
  }

  return {
    id: service.id,
    name: service.name,
    colorIndex: serviceColor(service),
    deskNumber,
    token,
  };
}

// Counts tokens taken (customers arrived) per service for a date. Includes
// inactive services that had activity so past reports stay accurate.
async function getReport(date) {
  const state = await storage.read();
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
  addService,
  deleteService,
  setDeskCount,
  takeToken,
  callNext,
  recall,
  getReport,
};
