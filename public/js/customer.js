function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadServices() {
  const res = await fetch('/api/services');
  const services = await res.json();
  renderGrid(services);
}

function renderGrid(services) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  if (services.length === 0) {
    grid.innerHTML = '<p class="empty">No services available right now.</p>';
    return;
  }
  services.forEach(service => {
    const btn = document.createElement('button');
    btn.className = 'grid-item';
    btn.innerHTML = `<span class="service-name">${escapeHtml(service.name)}</span>`;
    btn.addEventListener('click', () => generateToken(service.id, btn));
    grid.appendChild(btn);
  });
}

async function generateToken(id, btn) {
  btn.disabled = true;
  try {
    const res = await fetch(`/api/services/${id}/token`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    showToast(`${data.name}: Your token is #${data.currentToken}`);
  } catch (err) {
    showToast('Something went wrong. Please try again.', true);
  } finally {
    btn.disabled = false;
  }
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

loadServices();
