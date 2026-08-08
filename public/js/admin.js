function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showAdmin() {
  const now = new Date();
  document.getElementById('report-date').value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  loadServices();
  loadSubscription();
}

async function loadSubscription() {
  const banner = document.getElementById('sub-banner');
  if (!banner) return;
  let s;
  try {
    const res = await fetch('/api/admin/subscription');
    if (!res.ok) return;
    s = await res.json();
  } catch (err) {
    return;
  }

  banner.classList.remove('hidden', 'warn');
  if (s.plan === 'paid') {
    const n = s.daysRemaining === 1 ? '1 day' : `${s.daysRemaining} days`;
    if (s.expiryDate && s.nearExpiry) {
      banner.classList.add('warn');
      banner.innerHTML =
        `<strong>⚠️ Paid subscription expiring soon.</strong> ` +
        `${n} remaining (expires ${escapeHtml(s.expiryDate)}). Please contact the administrator to renew.`;
    } else if (s.expiryDate) {
      banner.innerHTML =
        `<strong>Paid subscription.</strong> ${n} remaining (expires ${escapeHtml(s.expiryDate)}).`;
    } else {
      banner.innerHTML = `<strong>Paid subscription.</strong> All services and unlimited daily tokens are enabled.`;
    }
  } else {
    banner.classList.add('warn');
    banner.innerHTML =
      `<strong>Free plan.</strong> Limited to 2 services and 10 tokens per service each day. ` +
      `Extra services are shown as disabled below. Contact the administrator to upgrade.`;
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

document.getElementById('add-service-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('new-service-name');
  const desksInput = document.getElementById('new-service-desks');
  const name = input.value.trim();
  if (!name) return;
  const deskCount = parseInt(desksInput.value, 10) || 1;
  const res = await fetch('/api/admin/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, deskCount }),
  });
  if (res.ok) {
    input.value = '';
    desksInput.value = '1';
    loadServices();
  }
});

document.getElementById('report-form').addEventListener('submit', e => {
  e.preventDefault();
  const date = document.getElementById('report-date').value;
  window.location.href = `/api/admin/report?date=${date}`;
});

async function loadServices() {
  const res = await fetch('/api/admin/services');
  const services = await res.json();
  const list = document.getElementById('service-list');
  list.innerHTML = '';
  services.forEach(service => {
    const li = document.createElement('li');
    li.className = 'service-list-item' + (service.planDisabled ? ' plan-disabled' : '');
    li.style.setProperty('--svc', `var(--cat-${service.colorIndex})`);
    li.innerHTML =
      `<span class="svc-dot"></span>` +
      `<span class="svc-label">${escapeHtml(service.name)}</span>` +
      (service.planDisabled
        ? `<span class="plan-badge">Disabled · Free plan</span>`
        : '');

    const desksField = document.createElement('label');
    desksField.className = 'desk-count-field';
    desksField.textContent = 'Desks';
    const desksInput = document.createElement('input');
    desksInput.type = 'number';
    desksInput.min = '1';
    desksInput.max = '20';
    desksInput.value = service.deskCount;
    desksInput.addEventListener('change', () => setDeskCount(service.id, desksInput));
    desksField.appendChild(desksInput);
    li.appendChild(desksField);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.className = 'delete-btn';
    delBtn.addEventListener('click', () => deleteService(service.id));
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

async function setDeskCount(id, input) {
  const deskCount = parseInt(input.value, 10) || 1;
  const res = await fetch(`/api/admin/services/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deskCount }),
  });
  if (res.ok) {
    const service = await res.json();
    input.value = service.deskCount; // reflect clamped value
  }
}

async function deleteService(id) {
  if (!confirm('Delete this service? This will remove it from the customer page.')) return;
  await fetch(`/api/admin/services/${id}`, { method: 'DELETE' });
  loadServices();
}

showAdmin();
