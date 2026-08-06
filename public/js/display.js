let services = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadServices() {
  const res = await fetch('/api/services');
  services = await res.json();
  render();
}

function render() {
  const list = document.getElementById('display-list');
  list.innerHTML = '';
  if (services.length === 0) {
    list.innerHTML = '<p class="empty">No services available.</p>';
    return;
  }
  services.forEach(service => {
    const row = document.createElement('div');
    row.className = 'display-row';
    row.dataset.id = service.id;
    row.innerHTML = `
      <div class="display-name">${escapeHtml(service.name)}</div>
      <div class="display-tokens">
        <div class="token-block current">
          <span class="token-label">Current</span>
          <span class="token-number">${service.currentToken || '-'}</span>
        </div>
        <div class="token-block previous">
          <span class="token-label">Previous</span>
          <span class="token-number">${service.previousToken || '-'}</span>
        </div>
      </div>
    `;
    list.appendChild(row);
  });
}

function updateService(payload) {
  const service = services.find(s => s.id === payload.id);
  if (!service) return;
  service.currentToken = payload.currentToken;
  service.previousToken = payload.previousToken;
  render();
  const row = document.querySelector(`.display-row[data-id="${payload.id}"]`);
  if (row) {
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1000);
  }
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'token') {
      updateService(msg);
    } else if (msg.type === 'services-updated') {
      loadServices();
    }
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

loadServices();
connectWs();
