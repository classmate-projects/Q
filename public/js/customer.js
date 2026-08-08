const confirmBar = document.getElementById('confirm-bar');
const selectedName = document.getElementById('selected-name');
const confirmBtn = document.getElementById('confirm-btn');

let selectedTile = null;

function selectService(btn) {
  if (selectedTile) selectedTile.classList.remove('selected');
  selectedTile = btn;
  btn.classList.add('selected');
  selectedName.textContent = btn.querySelector('.service-name').textContent;
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
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    showToast(`${data.name}: Your token is #${data.currentToken}`);
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
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

document.querySelectorAll('.grid-item').forEach(btn => {
  btn.addEventListener('click', () => selectService(btn));
});

confirmBtn.addEventListener('click', confirmSelection);
