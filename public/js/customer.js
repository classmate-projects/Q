const confirmBar = document.getElementById('confirm-bar');
const selectedName = document.getElementById('selected-name');
const nextToken = document.getElementById('next-token');
const confirmBtn = document.getElementById('confirm-btn');
const confirmClose = document.getElementById('confirm-close');

let selectedTile = null;

function nextTokenText(btn) {
  const n = parseInt(btn.dataset.next, 10);
  return Number.isFinite(n) ? `#${n}` : '#—';
}

function selectService(btn) {
  if (selectedTile) selectedTile.classList.remove('selected');
  selectedTile = btn;
  btn.classList.add('selected');
  selectedName.textContent = btn.querySelector('.service-name').textContent;
  nextToken.textContent = nextTokenText(btn);
  confirmBar.classList.remove('hidden');
}

function clearSelection() {
  if (selectedTile) selectedTile.classList.remove('selected');
  selectedTile = null;
  confirmBar.classList.add('hidden');
}

async function confirmSelection() {
  if (!selectedTile) return;
  const id = selectedTile.dataset.id;
  confirmBtn.disabled = true;
  try {
    const res = await fetch(`/api/services/${id}/token`, { method: 'POST' });
    if (!res.ok) {
      let msg = 'Something went wrong. Please try again.';
      try {
        const e = await res.json();
        if (e && e.error) msg = e.error;
      } catch {}
      showToast(msg, true);
      return;
    }
    const data = await res.json();
    showToast(`${data.name}: Your token is #${data.token}`);
    clearSelection();
  } catch (err) {
    showToast('Something went wrong. Please try again.', true);
  } finally {
    confirmBtn.disabled = false;
  }
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 1500);
}

document.querySelectorAll('.grid-item').forEach(btn => {
  btn.addEventListener('click', () => selectService(btn));
});

confirmBtn.addEventListener('click', confirmSelection);
confirmClose.addEventListener('click', clearSelection);

// ---- Live "Now serving" numbers (poll) ----

const POLL_MS = 2000;

function servingText(service) {
  return service.lastCalled ? `#${service.lastCalled}` : '—';
}

// Signature of the on-screen service tiles, so we reload only when services are
// added or removed by the admin (not on every token change).
function domServiceSignature() {
  return [...document.querySelectorAll('.grid-item')]
    .map(el => el.dataset.id)
    .sort()
    .join('|');
}

async function pollServing() {
  let services;
  try {
    services = await (await fetch('/api/services')).json();
  } catch {
    return;
  }

  const signature = services.map(s => s.id).sort().join('|');
  if (signature !== domServiceSignature()) {
    location.reload();
    return;
  }

  services.forEach(service => {
    const tile = document.querySelector(`.grid-item[data-id="${service.id}"]`);
    if (!tile) return;

    // Keep the "next token to be issued" figure current for this tile.
    tile.dataset.next = service.issued + 1;
    if (selectedTile === tile) nextToken.textContent = nextTokenText(tile);

    // Reflect the plan's per-service daily cap: disable a tile once it's full.
    tile.classList.toggle('full', !!service.full);
    tile.disabled = !!service.full;
    if (service.full && selectedTile === tile) clearSelection();

    const num = tile.querySelector('.svc-serving-num');
    if (!num) return;
    const next = servingText(service);
    if (num.textContent !== next) {
      num.textContent = next;
      num.classList.remove('flash');
      void num.offsetWidth; // restart the animation if already running
      num.classList.add('flash');
    }
  });
}

setInterval(pollServing, POLL_MS);
