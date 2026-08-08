function deskEl(serviceId, deskNumber) {
  return document.querySelector(
    `.board-card[data-id="${serviceId}"] .board-desk[data-desk="${deskNumber}"]`
  );
}

function flashDesk(el) {
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth; // restart the animation if it's already running
  el.classList.add('flash');
}

function applyCall(msg) {
  const el = deskEl(msg.id, msg.deskNumber);
  if (!el) return;
  el.querySelector('.desk-token').textContent = msg.token || '—';
  flashDesk(el);
}

function tickClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  el.textContent = new Date().toLocaleString([], {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'call') {
      applyCall(msg);
    } else if (msg.type === 'recall') {
      flashDesk(deskEl(msg.id, msg.deskNumber));
    } else if (msg.type === 'services-updated') {
      location.reload();
    }
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

tickClock();
setInterval(tickClock, 1000);
connectWs();
