const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { todayStr } = require('./util');

// Are we in a serverless (AWS Lambda / Netlify Functions) runtime? Netlify's
// `NETLIFY` env var is only set at BUILD time, not at function runtime, so we
// detect the Lambda runtime instead (LAMBDA_TASK_ROOT=/var/task). There the
// filesystem is read-only except the OS temp dir, and Netlify Blobs is
// available once connectLambda() has run in the handler.
const SERVERLESS =
  !!process.env.LAMBDA_TASK_ROOT ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.NETLIFY_DEV;
const BLOB_STORE = 'q-data';
const BLOB_KEY = 'db';
const EMPTY = { services: [], tokens: [] };

// File fallback location: a fixed path if set, the OS temp dir in a serverless
// runtime (the only writable place), or the project's data/ dir locally.
const FILE =
  process.env.QUEUE_DB_PATH ||
  (SERVERLESS ? path.join(os.tmpdir(), 'q-db.json') : path.join(__dirname, '..', 'data', 'db.json'));

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

let getStoreFn = null;
async function getBlobStore() {
  if (!SERVERLESS) return null;
  try {
    if (!getStoreFn) ({ getStore: getStoreFn } = await import('@netlify/blobs'));
    // Create the store per call so it picks up the current request's Blobs
    // context (wired up by connectLambda in the function handler).
    return getStoreFn({ name: BLOB_STORE, consistency: 'strong' });
  } catch {
    return null; // Blobs unavailable this request -> use the file fallback
  }
}

async function read() {
  const store = await getBlobStore();
  if (store) {
    try {
      return normalize((await store.get(BLOB_KEY, { type: 'json' })) || EMPTY);
    } catch {
      // Blobs unreachable -> fall through to the file so read/write stay consistent
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
    try {
      await store.setJSON(BLOB_KEY, state);
      return;
    } catch {
      // Blobs write failed -> fall through to the file instead of crashing
    }
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2));
}

module.exports = { read, write };
