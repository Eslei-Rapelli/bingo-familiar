'use strict';
/* Bingo Familiar - tempo real com Firebase Realtime Database */
const $ = id => document.getElementById(id);

const firebaseConfig = {
  apiKey: "AIzaSyBM4GABS3cUEq2V501zyWQSndeQVh1tHOw",
  authDomain: "bingo-familiar-6ed9d.firebaseapp.com",
  databaseURL: "https://bingo-familiar-6ed9d-default-rtdb.firebaseio.com",
  projectId: "bingo-familiar-6ed9d",
  storageBucket: "bingo-familiar-6ed9d.firebasestorage.app",
  messagingSenderId: "310169431398",
  appId: "1:310169431398:web:2a3b4c2bed10c92734eca7"
};

let db = null;
try { firebase.initializeApp(firebaseConfig); db = firebase.database(); } catch (e) { console.error(e); }

/* ---------- armazenamento local ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

/* ---------- estado ---------- */
const S = {
  pid: store.get('bf_pid', null),
  me: null, room: '', ref: null, connRef: null, data: null,
  card: [], round: 0, isHost: false,
  timer: null, timerInterval: 0, prevCount: -1, shownWin: 0,
  sound: store.get('bf_sound', true),
  voiceOn: store.get('bf_voice', true),
  gender: store.get('bf_gender', 'f')
};
if (!S.pid) { S.pid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); store.set('bf_pid', S.pid); }

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
UFS.forEach(uf => { const o = document.createElement('option'); o.value = uf; o.textContent = uf; $('playerState').appendChild(o); });

/* ---------- avisos ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4500);
}

/* ---------- áudio: bipe e música ---------- */
let actx = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, start, dur, type, vol) {
  const ctx = audio(); if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol || 0.08, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function beep() { if (S.sound) tone(660, 0, 0.13, 'sine', 0.06); }
function victoryMusic() {
  if (!S.sound) return;
  const mel = [
    [523,0,.15],[659,.15,.15],[784,.3,.15],[1047,.45,.35],[784,.9,.15],[1047,1.05,.15],[1319,1.2,.5],
    [698,1.8,.15],[880,1.95,.15],[1047,2.1,.15],[1397,2.25,.4],[1319,2.7,.15],[1175,2.85,.15],
    [1047,3.0,.15],[1319,3.15,.15],[1568,3.3,.8]
  ];
  mel.forEach(([f, s, d]) => { tone(f, s, d, 'triangle', 0.09); tone(f / 2, s, d, 'square', 0.025); });
}

/* ---------- voz humana (voz do próprio celular) ---------- */
let voices = [];
function loadVoices() { if ('speechSynthesis' in window) voices = speechSynthesis.getVoices() || []; }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(g) {
  const pt = voices.filter(v => /^pt/i.test(v.lang));
  const br = pt.filter(v => /br/i.test(v.lang));
  const list = br.length ? br : pt;
  const fem = /luciana|maria|francisca|fernanda|vit[oó]ria|camila|helena|raquel|google|feminin|female/i;
  const mas = /felipe|daniel|ricardo|ant[oô]nio|jorge|thiago|donato|masculin|male/i;
  return list.find(v => (g === 'f' ? fem : mas).test(v.name)) || null;
}
function speak(text) {
  if (!S.voiceOn || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; u.rate = 0.9;
    const v = pickVoice(S.gender);
    if (v) { u.voice = v; u.pitch = 1; }
    else {
      const any = voices.find(x => /^pt/i.test(x.lang)); if (any) u.voice = any;
      u.pitch = S.gender === 'f' ? 1.3 : 0.6;
    }
    speechSynthesis.speak(u);
  } catch (e) {}
}
const LETTER_NAMES = { B: 'Bê', I: 'I', N: 'Ene', G: 'Gê', O: 'Ó' };
function ballText(n) { const L = 'BINGO'[Math.ceil(n / 15) - 1]; return `${LETTER_NAMES[L]}, ${n}`; }
function ballLabel(n) { return 'BINGO'[Math.ceil(n / 15) - 1] + ' ' + n; }

document.addEventListener('pointerdown', () => {
  audio();
  try { if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) {}
}, { once: true });

/* ---------- cartela ---------- */
function makeCard() {
  const cols = [];
  for (let c = 0; c < 5; c++) {
    const pool = Array.from({ length: 15 }, (_, i) => c * 15 + 1 + i);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    cols.push(pool.slice(0, 5));
  }
  const out = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out.push(cols[c][r]);
  out[12] = 'LIVRE';
  return out;
}
function cardKey() { return `bf_card_${S.room}_${S.round}_${S.pid}`; }
function loadCard() {
  let c = store.get(cardKey(), null);
  if (!Array.isArray(c) || c.length !== 25) { c = makeCard(); store.set(cardKey(), c); }
  S.card = c;
}
function getDrawn() {
  const d = S.data && S.data.drawn;
  if (!d) return [];
  return (Array.isArray(d) ? d : Object.values(d)).filter(x => x != null);
}
function hasLine() {
  const set = new Set(getDrawn());
  const m = i => S.card[i] === 'LIVRE' || set.has(S.card[i]);
  const idx = [0, 1, 2, 3, 4], lines = [];
  for (let r = 0; r < 5; r++) lines.push(idx.map(c => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push(idx.map(r => r * 5 + c));
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return lines.some(l => l.every(m));
}

/* ---------- desenho da tela ---------- */
function renderCard() {
  const root = $('card'); root.innerHTML = '';
  const set = new Set(getDrawn());
  S.card.forEach(n => {
    const d = document.createElement('div');
    d.className = 'cell' + (n === 'LIVRE' ? ' free' : '') + (set.has(n) ? ' marked' : '');
    d.textContent = n; root.appendChild(d);
  });
}
function renderDrawn() {
  const drawn = getDrawn();
  const last = drawn.length ? drawn[drawn.length - 1] : null;
  $('lastBall').textContent = last ? last : '--';
  $('lastLetter').textContent = last ? 'BINGO'[Math.ceil(last / 15) - 1] : '';
  $('drawCount').textContent = `${drawn.length} de 75 sorteadas`;
  const h = $('history'); h.innerHTML = '';
  drawn.slice().reverse().forEach(n => {
    const s = document.createElement('span'); s.className = 'ball'; s.textContent = n; h.appendChild(s);
  });
  renderCard();
}
function renderPlayers() {
  const ul = $('players'); ul.innerHTML = '';
  const p = (S.data && S.data.players) || {};
  const list = Object.keys(p).map(id => Object.assign({ id }, p[id])).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  $('playerCount').textContent = list.length + (list.length === 1 ? ' pessoa' : ' pessoas');
  list.forEach(pl => {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot' + (pl.online ? ' on' : ''); li.appendChild(dot);
    const name = document.createElement('strong'); name.textContent = pl.name || 'Sem nome'; li.appendChild(name);
    if (pl.id === (S.data && S.data.host)) { const b = document.createElement('span'); b.className = 'pill'; b.textContent = 'sorteia'; li.appendChild(b); }
    const where = [pl.city, pl.state].filter(Boolean).join('/');
    let extra = where;
    if (S.isHost && pl.phone) extra += (extra ? ' · ' : '') + pl.phone;
    if (extra) { const s = document.createElement('small'); s.textContent = extra; li.appendChild(s); }
    ul.appendChild(li);
  });
}
function renderControls() {
  const d = S.data; if (!d) return;
  $('hostControls').classList.toggle('hidden', !S.isHost);
  $('guestNote').classList.toggle('hidden', S.isHost);
  $('guestNote').textContent = `Quem sorteia: ${d.hostName || 'o dono da sala'} · ${d.mode === 'manual' ? 'globo físico' : (d.auto ? 'sorteio automático rodando' : 'sorteio automático')}. Os números aparecem aqui sozinhos.`;
  $('autoMode').classList.toggle('selected', d.mode !== 'manual');
  $('manualMode').classList.toggle('selected', d.mode === 'manual');
  $('autoControls').classList.toggle('hidden', d.mode === 'manual');
  $('manualEntry').classList.toggle('hidden', d.mode !== 'manual');
  $('autoToggle').textContent = d.auto ? '⏸ Pausar sorteio automático' : '▶ Rodar sozinho';
  $('autoToggle').classList.toggle('running', !!d.auto);
  if (document.activeElement !== $('intervalSel')) $('intervalSel').value = String(d.interval || 5);
}

/* ---------- temporizador do dono da sala ---------- */
let wake = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) { if (!wake) wake = await navigator.wakeLock.request('screen'); }
    else if (wake) { await wake.release(); wake = null; }
  } catch (e) { wake = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.timer) { wake = null; keepAwake(true); } });

function syncTimer() {
  const d = S.data;
  const want = S.isHost && d && d.auto && d.mode !== 'manual' ? (Number(d.interval) || 5) : 0;
  if (!want) {
    if (S.timer) { clearInterval(S.timer); S.timer = null; S.timerInterval = 0; keepAwake(false); }
    return;
  }
  if (S.timer && S.timerInterval === want) return;
  if (S.timer) clearInterval(S.timer);
  S.timerInterval = want;
  keepAwake(true);
  S.timer = setInterval(() => {
    if (getDrawn().length >= 75) { S.ref.update({ auto: false }); return; }
    drawRandom();
  }, want * 1000);
}

/* ---------- sorteio (somente o dono da sala) ---------- */
function pushBall(n) {
  const drawn = getDrawn(); drawn.push(n);
  return S.ref.update({ drawn, last: n });
}
function drawRandom() {
  if (!S.isHost) return;
  const d = getDrawn();
  if (d.length >= 75) { S.ref.update({ auto: false }); toast('Todas as 75 bolinhas já foram sorteadas!'); return; }
  const left = []; for (let i = 1; i <= 75; i++) if (!d.includes(i)) left.push(i);
  pushBall(left[Math.floor(Math.random() * left.length)]);
}

/* ---------- ouvindo a sala ---------- */
function onRoom(snap) {
  const d = snap.val();
  if (!d) { toast('Esta sala não existe mais.'); leave(true); return; }
  const first = S.data === null;
  S.data = d; S.isHost = d.host === S.pid;

  if (d.round !== S.round) {
    S.round = d.round || 1; loadCard(); S.prevCount = -1;
    if (!(d.winner && d.winner.round === S.round)) hideVictory();
  }
  const drawn = getDrawn();
  if (S.prevCount >= 0 && drawn.length > S.prevCount) {
    const n = drawn[drawn.length - 1];
    beep(); speak(ballText(n));
  }
  S.prevCount = drawn.length;

  const w = d.winner && d.winner.round === S.round ? d.winner : null;
  if (w && S.isHost && d.auto) S.ref.update({ auto: false });
  if (w && S.shownWin !== S.round) { S.shownWin = S.round; showVictory(w.name, first); }
  $('winnerStrip').classList.toggle('hidden', !w);
  if (w) $('winnerStrip').textContent = `🏆 Bingo de ${w.name} nesta rodada!`;

  $('hello').textContent = `Olá, ${S.me.name}!`;
  $('roundLabel').textContent = `Rodada ${S.round}`;
  renderPlayers(); renderControls(); renderDrawn(); syncTimer();
}

/* ---------- entrar, criar e sair ---------- */
function readProfile() {
  const name = $('playerName').value.trim();
  if (!name) { toast('Digite seu nome completo primeiro.'); return null; }
  const p = { name, phone: $('playerPhone').value.trim(), state: $('playerState').value, city: $('playerCity').value.trim() };
  if (!p.state || !p.city) { toast('Escolha seu estado e digite sua cidade.'); return null; }
  store.set('bf_profile', p); return p;
}
function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

async function createRoom() {
  const p = readProfile(); if (!p) return;
  if (!db) { toast('Sem conexão com o servidor. Verifique a internet e tente de novo.'); return; }
  audio();
  try {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '';
    for (let t = 0; t < 6 && !code; t++) {
      let c = ''; for (let i = 0; i < 5; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
      const s = await db.ref('rooms/' + c).once('value'); if (!s.exists()) code = c;
    }
    if (!code) { toast('Não consegui gerar o código. Tente de novo.'); return; }
    await db.ref('rooms/' + code).set({
      host: S.pid, hostName: p.name, round: 1, mode: 'auto', auto: false, interval: 5, last: 0,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    enter(code, p);
  } catch (e) { console.error(e); toast('Não consegui criar a sala. Verifique a internet.'); }
}
async function joinRoom() {
  const p = readProfile(); if (!p) return;
  const code = cleanCode($('roomCodeInput').value);
  if (!code) { toast('Digite o código da sala.'); return; }
  if (!db) { toast('Sem conexão com o servidor. Verifique a internet e tente de novo.'); return; }
  audio();
  try {
    const s = await db.ref('rooms/' + code).once('value');
    if (!s.exists()) { toast('Sala não encontrada. Confira o código.'); return; }
    enter(code, p);
  } catch (e) { console.error(e); toast('Não consegui entrar. Verifique a internet.'); }
}
function enter(code, p) {
  if (S.ref) S.ref.off();
  S.me = Object.assign({ id: S.pid }, p); S.room = code; S.ref = db.ref('rooms/' + code);
  S.data = null; S.round = 0; S.prevCount = -1; S.shownWin = 0;
  const pr = S.ref.child('players/' + S.pid);
  pr.update({ name: p.name, phone: p.phone || '', state: p.state, city: p.city, online: true, joinedAt: firebase.database.ServerValue.TIMESTAMP });
  S.connRef = db.ref('.info/connected');
  S.connRef.on('value', s => {
    const ok = s.val() === true;
    $('connection').textContent = ok ? 'Conectado em tempo real ✅' : 'Sem conexão, tentando reconectar…';
    if (ok && S.ref) { pr.child('online').onDisconnect().set(false); pr.child('online').set(true); }
  });
  $('roomCode').textContent = code;
  $('welcome').classList.add('hidden'); $('game').classList.remove('hidden');
  store.set('bf_room', code);
  S.ref.on('value', onRoom, err => toast('Erro ao ler a sala: ' + err.message));
}
function leave(silent) {
  try {
    if (S.timer) { clearInterval(S.timer); S.timer = null; S.timerInterval = 0; }
    keepAwake(false);
    if (S.ref) {
      if (S.isHost && !silent) S.ref.update({ auto: false });
      if (!silent) S.ref.child('players/' + S.pid + '/online').set(false);
      S.ref.off();
    }
    if (S.connRef) S.connRef.off();
  } catch (e) {}
  S.ref = null; S.connRef = null; S.data = null; S.isHost = false; S.room = '';
  store.del('bf_room'); hideVictory();
  $('game').classList.add('hidden'); $('welcome').classList.remove('hidden');
}

/* ---------- vitória ---------- */
function showVictory(name, silent) {
  $('winnerName').textContent = name;
  const box = $('confetti'); box.innerHTML = '';
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span'); s.textContent = ['🎉', '✨', '🎊', '⭐'][i % 4];
    s.style.left = Math.random() * 100 + '%'; s.style.animationDelay = (Math.random() * 2) + 's';
    s.style.animationDuration = (3 + Math.random() * 3) + 's'; box.appendChild(s);
  }
  $('victory').classList.remove('hidden');
  if (!silent) { victoryMusic(); setTimeout(() => speak(`${name}, você ganhou! Parabéns!`), 3400); }
}
function hideVictory() { $('victory').classList.add('hidden'); }
$('closeVictory').onclick = hideVictory;

/* ---------- botões ---------- */
$('createRoom').onclick = createRoom;
$('showJoin').onclick = () => $('joinArea').classList.toggle('hidden');
$('joinRoom').onclick = joinRoom;
$('leave').onclick = () => leave(false);

$('autoMode').onclick = () => S.isHost && S.ref.update({ mode: 'auto', auto: false });
$('manualMode').onclick = () => S.isHost && S.ref.update({ mode: 'manual', auto: false });
$('draw').onclick = drawRandom;
$('autoToggle').onclick = () => {
  if (!S.isHost || !S.data) return;
  audio();
  if (S.data.auto) { S.ref.update({ auto: false }); return; }
  S.ref.update({ auto: true, mode: 'auto', interval: Number($('intervalSel').value) || 5 });
  drawRandom();
};
$('intervalSel').onchange = () => { if (S.isHost) S.ref.update({ interval: Number($('intervalSel').value) || 5 }); };
$('registerNumber').onclick = () => {
  if (!S.isHost) return;
  const n = Number($('manualNumber').value);
  if (!Number.isInteger(n) || n < 1 || n > 75) return toast('Digite um número inteiro de 1 a 75.');
  if (getDrawn().includes(n)) return toast('Esse número já saiu.');
  pushBall(n); $('manualNumber').value = '';
};
$('reset').onclick = () => {
  if (!S.isHost) return toast('Só quem criou a sala pode começar uma nova rodada.');
  if (confirm('Começar uma nova rodada? Isso apaga o sorteio atual e dá uma cartela nova para todos.')) {
    S.ref.update({ round: S.round + 1, drawn: null, last: 0, auto: false, winner: null });
  }
};
$('bingoBtn').onclick = () => {
  if (!S.ref) return;
  if (!hasLine()) return toast('Ainda não fechou uma linha, coluna ou diagonal. Continue!');
  S.ref.child('winner').transaction(cur => {
    if (cur && cur.round === S.round) return;
    return { name: S.me.name, round: S.round, pid: S.pid, ts: firebase.database.ServerValue.TIMESTAMP };
  }, (err, committed, snap) => {
    if (err) return toast('Falha de conexão. Tente de novo.');
    if (!committed) { const w = snap.val(); toast(`${w ? w.name : 'Alguém'} já cantou bingo nesta rodada.`); }
  });
};

/* áudio */
function refreshAudioButtons() {
  $('soundToggle').textContent = S.sound ? '🔊 Som ligado' : '🔇 Som desligado';
  $('voiceToggle').textContent = S.voiceOn ? '🗣️ Voz ligada' : '🤐 Voz desligada';
  $('voiceGender').value = S.gender;
}
$('soundToggle').onclick = () => { S.sound = !S.sound; store.set('bf_sound', S.sound); refreshAudioButtons(); };
$('voiceToggle').onclick = () => { S.voiceOn = !S.voiceOn; store.set('bf_voice', S.voiceOn); refreshAudioButtons(); };
$('voiceGender').onchange = () => { S.gender = $('voiceGender').value; store.set('bf_gender', S.gender); speak('Bê, 7'); };
$('voiceTest').onclick = () => { const was = S.voiceOn; S.voiceOn = true; speak('Gê, 52'); S.voiceOn = was; };
refreshAudioButtons();

/* convite */
$('shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '?sala=' + S.room;
  const text = `Entre no Bingo Familiar! Código da sala: ${S.room}`;
  try { if (navigator.share) { await navigator.share({ title: 'Bingo Familiar', text, url }); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Convite copiado!'); }
  catch (e) { prompt('Copie o convite:', text + ' ' + url); }
};

/* início: preencher dados salvos, link de convite e retomar sala */
(function init() {
  const p = store.get('bf_profile', null);
  if (p) { $('playerName').value = p.name || ''; $('playerPhone').value = p.phone || ''; $('playerState').value = p.state || ''; $('playerCity').value = p.city || ''; }
  const q = cleanCode(new URLSearchParams(location.search).get('sala'));
  if (q) { $('roomCodeInput').value = q; $('joinArea').classList.remove('hidden'); }
  const r = store.get('bf_room', null);
  if (r && p && db && !q) {
    db.ref('rooms/' + r).once('value').then(s => { if (s.exists()) enter(r, p); else store.del('bf_room'); }).catch(() => {});
  }
})();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
