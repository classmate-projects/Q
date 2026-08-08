function updateService(payload) {
  const row = document.querySelector(`.display-row[data-id="${payload.id}"]`);
  if (!row) return;
  row.querySelector('.token-block.current .token-number').textContent = payload.currentToken || '-';
  row.querySelector('.token-block.next .token-number').textContent = payload.nextToken;
  row.classList.remove('flash');
  void row.offsetWidth; // restart the animation if it's already running
  row.classList.add('flash');
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
    if (msg.type === 'token') {
      updateService(msg);
    } else if (msg.type === 'services-updated') {
      location.reload();
    }
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

tickClock();
setInterval(tickClock, 1000);
connectWs();
