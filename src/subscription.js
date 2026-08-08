const storage = require('./storage');
const { todayStr } = require('./util');

function toUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Whole days from `today` until `expiry` (both YYYY-MM-DD). 0 = expires today,
// negative = already past.
function daysUntil(expiry, today) {
  return Math.round((toUTC(expiry) - toUTC(today)) / 86400000);
}

// Reads the subscription and evaluates it against today's date (in the app's
// timezone). If a Pro plan has reached/passed its expiry date, it is
// automatically downgraded to Free (and that is persisted). Upgrading is only
// ever done manually by the admin in the database.
async function getStatus() {
  const today = todayStr();
  const sub = await storage.readSubscription();
  let plan = sub.plan === 'pro' ? 'pro' : 'free';
  const expiryDate = sub.expiryDate;
  let daysRemaining = null;

  if (plan === 'pro' && expiryDate) {
    daysRemaining = daysUntil(expiryDate, today);
    if (daysRemaining <= 0) {
      // Reached or exceeded -> auto-downgrade. Best effort: a persist failure
      // shouldn't break the caller; it'll retry on the next check.
      plan = 'free';
      try {
        await storage.writeSubscription({ plan: 'free', expiryDate });
      } catch {
        /* ignore persist failure */
      }
    }
  }

  const nearExpiry = plan === 'pro' && daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 7;
  return { plan, expiryDate, daysRemaining, nearExpiry, today };
}

module.exports = { getStatus };
