const MAX_DESKS = 20;

// Timezone that defines when "a new day" starts — i.e. when the daily token
// counters reset (at local midnight). Serverless hosts (Netlify) run in UTC, so
// without this the reset would happen at UTC midnight. Defaults to UAE (UTC+4);
// set QUEUE_TIMEZONE to any IANA name (e.g. "Europe/London", "Asia/Kolkata").
const TIMEZONE = process.env.QUEUE_TIMEZONE || 'Asia/Dubai';

// Today's date (YYYY-MM-DD) in the configured timezone, so counters reset at
// local midnight regardless of the server's own timezone.
function todayStr(tz = TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    // Invalid timezone -> fall back to the server's local date.
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function clampDesks(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_DESKS);
}

module.exports = { MAX_DESKS, todayStr, clampDesks };
