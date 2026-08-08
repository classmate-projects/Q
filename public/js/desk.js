let services = window.__SERVICES__ || [];
let selectedId = services.length ? services[0].id : null;

const panel = document.getElementById('desk-panel');
const tabs = document.getElementById('service-tabs');

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
    // A successful call updates state through the WebSocket 'call' broadcast.
  } catch (err) {
    showToast('Something went wrong. Please try again.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
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
}

function flashDesk(deskNumber) {
  const card = panel.querySelector(`.desk-card[data-desk="${deskNumber}"]`);
  if (!card) return;
  card.classList.remove('flash');
  void card.offsetWidth;
  card.classList.add('flash');
}

function applyCall(msg) {
  const svc = svcById(msg.id);
  if (!svc) return;
  const desk = svc.desks.find(d => d.number === msg.deskNumber);
  if (desk) desk.current = msg.token;
  svc.waiting = msg.waiting;
  if (msg.id === selectedId) {
    renderPanel();
    flashDesk(msg.deskNumber);
  }
}

function applyQueue(msg) {
  const svc = svcById(msg.id);
  if (!svc) return;
  svc.waiting = msg.waiting;
  if (msg.id === selectedId) {
    const pill = document.getElementById('waiting-pill');
    if (pill) pill.textContent = `${svc.waiting} waiting`;
  }
}

function selectService(id) {
  selectedId = id;
  renderTabs();
  renderPanel();
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'call') applyCall(msg);
    else if (msg.type === 'queue') applyQueue(msg);
    else if (msg.type === 'recall') {
      if (msg.id === selectedId) flashDesk(msg.deskNumber);
    } else if (msg.type === 'services-updated') {
      location.reload();
    }
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

if (tabs) {
  tabs.querySelectorAll('.service-tab').forEach(tab => {
    tab.addEventListener('click', () => selectService(tab.dataset.id));
  });
}

renderTabs();
renderPanel();
connectWs();
