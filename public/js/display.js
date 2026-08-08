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
  // Any interaction re-arms the audio context after a programmatic reload.
  document.addEventListener('pointerdown', () => { if (soundOn) ensureAudio(); }, { once: true });
}

// ---- Board updates ----

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
  playCall();
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
      playRecall();
    } else if (msg.type === 'services-updated') {
      location.reload();
    }
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

setupSound();
tickClock();
setInterval(tickClock, 1000);
connectWs();
