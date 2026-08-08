let services = window.__SERVICES__ || [];
let selectedId = services.length ? services[0].id : null;

const panel = document.getElementById('desk-panel');
const tabs = document.getElementById('service-tabs');
const POLL_MS = 2000;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function svcById(id) {
  return services.find(s => s.id === id);
}

function renderTabs() {
  if (!tabs) return;
  tabs.querySelectorAll('.service-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.id === selectedId);
  });
}

function renderPanel() {
  if (!panel) return;
  const svc = svcById(selectedId);
  panel.innerHTML = '';
  if (!svc) return;
  panel.style.setProperty('--svc', `var(--cat-${svc.colorIndex})`);

  const head = document.createElement('div');
  head.className = 'desk-panel-head';
  head.innerHTML =
    `<h2>${escapeHtml(svc.name)}</h2>` +
    `<span class="waiting-pill" id="waiting-pill">${svc.waiting} waiting</span>`;
  panel.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'desk-cards';
  svc.desks.forEach(desk => {
    const card = document.createElement('div');
    card.className = 'desk-card';
    card.dataset.desk = desk.number;
    card.innerHTML =
      `<div class="desk-card-label">Desk ${desk.number}</div>` +
      `<div class="desk-card-token">${desk.current || '—'}</div>` +
      `<div class="desk-card-actions">` +
      `<button class="call-btn" type="button">Call Next</button>` +
      `<button class="recall-btn" type="button">Recall</button>` +
      `</div>`;
    card.querySelector('.call-btn').addEventListener('click', () => callNext(svc.id, desk.number));
    card.querySelector('.recall-btn').addEventListener('click', () => recall(svc.id, desk.number));
    grid.appendChild(card);
  });
  panel.appendChild(grid);
}

async function callNext(id, deskNumber) {
  const card = panel.querySelector(`.desk-card[data-desk="${deskNumber}"]`);
  const btn = card && card.querySelector('.call-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/services/${id}/desks/${deskNumber}/call`, { method: 'POST' });
    const data = await res.json();
    if (!data.called) showToast('No one waiting.', true);
  } catch (err) {
    showToast('Something went wrong. Please try again.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
  refresh();
}

async function recall(id, deskNumber) {
  try {
    const res = await fetch(`/api/services/${id}/desks/${deskNumber}/recall`, { method: 'POST' });
    const data = await res.json();
    if (!data.token) {
      showToast("This desk isn't serving anyone yet.", true);
    } else {
      showToast(`Recalling token #${data.token} to Desk ${deskNumber}`);
    }
  } catch (err) {
    showToast('Something went wrong. Please try again.', true);
  }
  refresh();
}

function selectService(id) {
  selectedId = id;
  renderTabs();
  renderPanel();
}

function structureChanged(data) {
  const sig = list => list.map(s => `${s.id}:${s.deskCount}`).sort().join('|');
  return sig(data) !== sig(services);
}

async function refresh() {
  let data;
  try {
    data = await (await fetch('/api/services')).json();
  } catch {
    return;
  }
  if (structureChanged(data)) {
    location.reload();
    return;
  }
  const before = JSON.stringify(svcById(selectedId));
  services = data;
  if (JSON.stringify(svcById(selectedId)) !== before) renderPanel();
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

if (tabs) {
  tabs.querySelectorAll('.service-tab').forEach(tab => {
    tab.addEventListener('click', () => selectService(tab.dataset.id));
  });
}

renderTabs();
renderPanel();
setInterval(refresh, POLL_MS);

// ---- Subscription reminder: desk page only, shown at most once per day and
// dismissible so it never disturbs normal use. ----
function showSubModal(days) {
  const modal = document.getElementById('sub-modal');
  const text = document.getElementById('sub-modal-text');
  if (!modal || !text) return;
  const n = days === 1 ? '1 day' : `${days} days`;
  text.textContent = `The subscription expires in ${n}. Please contact the administrator to renew.`;
  modal.classList.remove('hidden');
}

async function checkSubscription() {
  try {
    const res = await fetch('/api/desk-alert');
    const data = await res.json();
    if (data.show && localStorage.getItem('q-subalert') !== data.today) {
      showSubModal(data.daysRemaining);
      localStorage.setItem('q-subalert', data.today);
    }
  } catch (err) {
    /* ignore */
  }
}

const subClose = document.getElementById('sub-modal-close');
if (subClose) {
  subClose.addEventListener('click', () => document.getElementById('sub-modal').classList.add('hidden'));
}

checkSubscription();
setInterval(checkSubscription, 30 * 60 * 1000); // re-evaluate every 30 min
