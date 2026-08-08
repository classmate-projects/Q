const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { createClient } = require('@supabase/supabase-js');
const { todayStr } = require('./util');

// Persistence: use Supabase (a hosted Postgres DB) when configured, otherwise a
// local JSON file so `npm start` works with no setup. The whole app state
// ({ services, tokens }) is stored as one JSON document in the `queue_state`
// table (row id = 'main').
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);

const TABLE = 'queue_state';
const ROW_ID = 'main';
const EMPTY = { services: [], tokens: [] };

// File fallback location (only used when Supabase isn't configured): the OS temp
// dir in a serverless runtime (the only writable place), else the project data/ dir.
const SERVERLESS = !!process.env.LAMBDA_TASK_ROOT || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
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

let client = null;
function supabase() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return client;
}

async function read() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase().from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    // Throw on a real query error (don't silently return empty — a later write
    // would then wipe existing data). A missing row is fine (first run).
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    return normalize(data ? data.data : EMPTY);
  }
  try {
    return normalize(JSON.parse(await fs.readFile(FILE, 'utf-8')));
  } catch {
    return normalize(EMPTY);
  }
}

async function write(state) {
  if (USE_SUPABASE) {
    const { error } = await supabase()
      .from(TABLE)
      .upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase write failed: ${error.message}`);
    return;
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2));
}

module.exports = { read, write };
