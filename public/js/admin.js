const loginSection = document.getElementById('login-section');
const adminSection = document.getElementById('admin-section');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function checkAuth() {
  const res = await fetch('/api/admin/check');
  if (res.ok) showAdmin();
}

function showAdmin() {
  loginSection.classList.add('hidden');
  adminSection.classList.remove('hidden');
  document.getElementById('report-date').value = new Date().toISOString().slice(0, 10);
  loadServices();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.ok) {
    showAdmin();
  } else {
    const err = document.getElementById('login-error');
    err.textContent = 'Incorrect password';
    err.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

document.getElementById('add-service-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('new-service-name');
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch('/api/admin/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.ok) {
    input.value = '';
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
    li.className = 'service-list-item';
    li.style.setProperty('--svc', `var(--cat-${service.colorIndex})`);
    li.innerHTML = `<span class="svc-dot"></span><span class="svc-label">${escapeHtml(service.name)}</span>`;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.className = 'delete-btn';
    delBtn.addEventListener('click', () => deleteService(service.id));
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

async function deleteService(id) {
  if (!confirm('Delete this service? This will remove it from the customer page.')) return;
  await fetch(`/api/admin/services/${id}`, { method: 'DELETE' });
  loadServices();
}

checkAuth();
