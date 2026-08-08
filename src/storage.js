const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { todayStr } = require('./util');

// On a deployed Netlify site we persist to Netlify Blobs (the function
// filesystem is read-only/ephemeral). Everywhere else — plain `node server.js`,
// or `netlify dev` without a linked site — we fall back to a JSON file so it
// works with no setup.
const ON_NETLIFY = process.env.NETLIFY === 'true' || !!process.env.NETLIFY_DEV;
const BLOB_STORE = 'q-data';
const BLOB_KEY = 'db';
const EMPTY = { services: [], tokens: [] };

// Where the file fallback lives: a fixed path if set, the project's data/ dir
// locally, or the OS temp dir when running on Netlify without Blobs.
const FILE =
  process.env.QUEUE_DB_PATH ||
  (ON_NETLIFY ? path.join(os.tmpdir(), 'q-db.json') : path.join(__dirname, '..', 'data', 'db.json'));

// Normalize/migrate the persisted shape so older data keeps working and every
// read returns a consistent structure (desks are { current, pulse } objects).
function normalize(data) {
  const s = { services: [], tokens: [], ...(data || {}) };
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
    svc.desks = svc.desks.map(d =>
      typeof d === 'number'
        ? { current: d, pulse: 0 }
        : { current: (d && d.current) || 0, pulse: (d && d.pulse) || 0 }
    );
    delete svc.currentToken; // obsolete fields from earlier schemas
    delete svc.previousToken;
  }
  return s;
}

let blobStore = null;
let blobTried = false;
async function getBlobStore() {
  if (!ON_NETLIFY) return null;
  if (!blobTried) {
    blobTried = true;
    try {
      const { getStore } = await import('@netlify/blobs');
      blobStore = getStore({ name: BLOB_STORE, consistency: 'strong' });
    } catch {
      blobStore = null; // Blobs env not configured -> use the file fallback
    }
  }
  return blobStore;
}

async function read() {
  const store = await getBlobStore();
  if (store) {
    try {
      return normalize((await store.get(BLOB_KEY, { type: 'json' })) || EMPTY);
    } catch {
      return normalize(EMPTY);
    }
  }
  try {
    return normalize(JSON.parse(await fs.readFile(FILE, 'utf-8')));
  } catch {
    return normalize(EMPTY);
  }
}

async function write(state) {
  const store = await getBlobStore();
  if (store) {
    await store.setJSON(BLOB_KEY, state);
    return;
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2));
}

module.exports = { read, write };
