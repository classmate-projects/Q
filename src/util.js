const MAX_DESKS = 20;

// Local calendar date as YYYY-MM-DD (not UTC), so the day rolls over with the
// shop's actual day.
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

module.exports = { MAX_DESKS, todayStr, clampDesks };
