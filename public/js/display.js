// ---- Sound (Web Audio, generated tones — no audio files needed) ----
// Browsers block audio until the user interacts with the page, so an
// "Enable sound" toggle in the header arms it with a single click.

let audioCtx = null;
let soundOn = localStorage.getItem('q-sound') === 'on';

function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function tone(freq, startOffset, duration, gainVal, type) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

// New call: a pleasant two-tone "ding-dong" chime.
function playCall() {
  if (!soundOn) return;
  ensureAudio();
  tone(880.0, 0, 0.35, 0.28, 'sine');
  tone(659.25, 0.26, 0.5, 0.28, 'sine');
}

// Recall: a distinct, more urgent triple beep.
function playRecall() {
  if (!soundOn) return;
  ensureAudio();
  tone(987.77, 0.0, 0.13, 0.22, 'triangle');
  tone(987.77, 0.17, 0.13, 0.22, 'triangle');
  tone(987.77, 0.34, 0.17, 0.22, 'triangle');
}

function updateSoundBtn() {
  const btn = document.getElementById('sound-toggle');
  if (!btn) return;
  if (localStorage.getItem('q-sound') === null) {
    btn.textContent = '🔔 Enable sound';
    btn.classList.add('off');
    return;
  }
  btn.textContent = soundOn ? '🔔 Sound on' : '🔕 Sound off';
  btn.classList.toggle('off', !soundOn);
}

function setupSound() {
  const btn = document.getElementById('sound-toggle');
  if (!btn) return;
  updateSoundBtn();
  btn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('q-sound', soundOn ? 'on' : 'off');
    if (soundOn) {
      ensureAudio();
      playCall(); // confirmation blip + unlocks audio for later events
    }
    updateSoundBtn();
  });
  document.addEventListener('pointerdown', () => { if (soundOn) ensureAudio(); }, { once: true });
}

// ---- Board updates via polling ----

const POLL_MS = 2000;
let prev = null; // { [serviceId]: { [deskNumber]: { current, pulse } } }

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

// Signature of the rendered structure vs. fetched data, so we reload only when
// services/desks are added or removed (not on every token change).
function dataSignature(services) {
  return services.map(s => `${s.id}:${s.deskCount}`).sort().join('|');
}

function domSignature() {
  return [...document.querySelectorAll('.board-card')]
    .map(c => `${c.dataset.id}:${c.querySelectorAll('.board-desk').length}`)
    .sort()
    .join('|');
}

async function poll() {
  let services;
  try {
    services = await (await fetch('/api/services')).json();
  } catch {
    return;
  }

  if (dataSignature(services) !== domSignature()) {
    location.reload();
    return;
  }

  const next = {};
  services.forEach(s => {
    next[s.id] = {};
    s.desks.forEach(d => {
      next[s.id][d.number] = { current: d.current, pulse: d.pulse };
      if (!prev) return;
      const p = prev[s.id] && prev[s.id][d.number];
      const el = deskEl(s.id, d.number);
      if (!el || !p) return;
      if (d.current !== p.current) {
        el.querySelector('.desk-token').textContent = d.current || '—';
        if (d.current > p.current) {
          flashDesk(el);
          playCall();
        }
      } else if (d.pulse !== p.pulse) {
        flashDesk(el);
        playRecall();
      }
    });
  });
  prev = next;
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

setupSound();
tickClock();
setInterval(tickClock, 1000);
poll();
setInterval(poll, POLL_MS);
