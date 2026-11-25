import {teams, rounds, rivals, drawCup, advanceCup, drawFlag} from './cup.js';
import {replayPose} from './replay.js';
import {FriendRoom, roomFromLink, hasRoomSeat} from './friend-room.js?v=2';
import {friendLobby} from './friend-lobby.js';
import {startMusic} from './music.js';
import {project, slime, drawBall} from './meshes.js?v=4';
import * as S from './sim.js?v=6';

const { W, H, GROUND, NET_X, NET_TOP, NET_HW, SLIME_R: R, BALL_R: BR, DT } = S;
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const pad = document.getElementById('pad');
const FONT = "Impact,Haettenschweiler,'Arial Narrow Bold','Arial Black',sans-serif";
const TOUCH = matchMedia('(any-pointer:coarse)').matches;
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const YOU = { name: 'YOU', color: '#22d3a0' };
const P1 = { name: 'PLAYER 1', color: '#22d3a0' }, P2 = { name: 'PLAYER 2', color: '#3aa0ff' };
const OPP = [
  { id: 'sludge', name: 'SLUDGE', tag: 'THE ROOKIE', blurb: 'SLOW. SLEEPY. NEVER LEAVES THE GROUND.', color: '#9aa63a', acc: 'lid' },
  { id: 'brick', name: 'BRICK', tag: 'THE WALL', blurb: 'CAMPS DEEP. RETURNS EVERYTHING.', color: '#d0603f', acc: 'band' },
  { id: 'pyro', name: 'PYRO', tag: 'THE SPIKER', blurb: 'LIVES AT THE NET. JUMPS AT ANYTHING.', color: '#ff8a1a', acc: 'mohawk' },
  { id: 'jinx', name: 'JINX', tag: 'THE TRICKSTER', blurb: 'MOONBALLS, DROP SHOTS, LIES.', color: '#b44cff', acc: 'hat' },
  { id: 'inferno', name: 'INFERNO', tag: 'THE CHAMP', blurb: "READS EVERY BOUNCE. AIMS WHERE YOU AREN'T.", color: '#e01838', acc: 'horns' },
];

// ---------- state ----------
let scene = 'title', mode = 'ladder', oppI = 0, quickI = 0, menuI = 0, sceneT = 0, T = 0, paused = false;
let selectedSport = 'volleyball', cup = null, countryI = 0;
try { if (localStorage.getItem('slime-sport') === 'soccer') selectedSport = 'soccer'; } catch {}
function cycleSport() {
  selectedSport = selectedSport === 'soccer' ? 'volleyball' : 'soccer';
  try { localStorage.setItem('slime-sport', selectedSport); } catch {}
  startDemo();
  play('sel');
}
let replayClip = null, snapshotAt = 0;
let match, brains = [null, null], looks = [YOU, OPP[0]];
let acc = 0, timeScale = 1, slowT = 0, freeze = 0;
let shake = 0, excite = 0, netWob = 0, spin = 0, fwT = 0;
const P = [], later = [], scorch = [], calls = [], btns = [];
const vis = [{ w: 0, wv: 0, char: 0 }, { w: 0, wv: 0, char: 0 }];
const keys = {};

// ---------- audio ----------
let ac = null, master = null, crowd = null, noiseBuf = null, muted = false;
const muteKey = 'slime-volleyball-2000_muted';
try { muted = localStorage.getItem(muteKey) === '1'; } catch {}
const voiceKey = 'slime-volleyball-2000_announcer';
let voiceOn = true, musicGain;
const speaking = new Set();
const highlightShouts = ['holy', 'hell', 'damn'];
const replayCalls = {
  net: { scored: ['filthy', 'sauce'], conceded: ['past', 'blink'] },
  fire: { scored: ['rocket', 'roof'], conceded: ['burn', 'pancake'] },
};
const callsByName = new Map();
const scoringCalls = ['holy','hell','damn','rocket','roof','gravy','peel','filthy','pudding','sauce'];
const concedingCalls = ['burn','pants','pancake','floor','ouch','tax','past','blink','stings','skid'];
const pointCalls = {
  ordinary: { scored: scoringCalls, conceded: concedingCalls },
  ace: { scored: ['ace-untouched','ace-stamp'], conceded: ['aced-frozen','aced-past'] },
  rally: { scored: ['rally-finish','rally-finally'], conceded: ['outlasted','outlasted-gas'] },
  streak: { scored: ['streak-snapped','streak-ice'], conceded: ['streak-ended','streak-cold'] },
};
const recentCalls = new Map();
try { voiceOn = localStorage.getItem(voiceKey) !== 'off'; } catch {}
function stopCall() {
  for (const source of speaking) source.stop();
  speaking.clear();
  if (musicGain) {
    musicGain.gain.cancelScheduledValues(ac.currentTime);
    musicGain.gain.setTargetAtTime(0.8, ac.currentTime, 0.12);
  }
}
function toggleVoice() {
  voiceOn = !voiceOn;
  if (!voiceOn) stopCall();
  try { localStorage.setItem(voiceKey, voiceOn ? 'on' : 'off'); } catch {}
}
function pickCall(pool) {
  const available = pool.filter(name => callsByName.has(name));
  if (!available.length) return;
  const history = recentCalls.get(pool) || [];
  let remaining = available.filter(name => !history.includes(name));
  if (!remaining.length) {
    const last = history.pop();
    history.length = 0;
    remaining = available.filter(name => name !== last);
  }
  const next = pick(remaining.length ? remaining : available);
  history.push(next); recentCalls.set(pool, history);
  return callsByName.get(next);
}
function announcePoint(event, celebrate) {
  if (!voiceOn || muted || !ac) return;
  const perspective = celebrate ? 'scored' : 'conceded';
  const specific = event.pointKind === 'ordinary' && replayCalls[event.highlight];
  const pool = (specific || pointCalls[event.pointKind])[perspective];
  const pools = event.highlight ? [highlightShouts, pool] : [pool];
  const clips = pools.map(pickCall).filter(Boolean);
  if (!clips.length) return;
  stopCall();
  const t = ac.currentTime;
  let cursor = t;
  for (const buffer of clips) {
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    source.onended = () => { speaking.delete(source); source.disconnect(); };
    speaking.add(source);
    source.start(cursor);
    cursor += buffer.duration + 0.07;
  }
  musicGain.gain.setTargetAtTime(0.33,t,0.025);
  musicGain.gain.setTargetAtTime(0.8,cursor,0.12);
}
function audio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ac.destination);
  musicGain = ac.createGain(); musicGain.gain.value = 0.8; musicGain.connect(master);
  startMusic(ac, musicGain).catch(console.error);
  for (const name of Object.values(pointCalls).flatMap(pool => [...pool.scored, ...pool.conceded])) {
    fetch('./audio/'+name+'.mp3?v=2').then(r => r.arrayBuffer()).then(data => ac.decodeAudioData(data))
      .then(buffer => callsByName.set(name, buffer)).catch(console.error);
  }
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.5;
  crowd = ac.createGain(); crowd.gain.value = 0.03;
  src.connect(bp).connect(crowd).connect(master); src.start();
}
function noise(dur, f0, f1, vol) {
  const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master); src.start(t, rnd(1)); src.stop(t + dur);
}
function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur);
}
const sfx = {
  hit(speed,fire) {
    const pitch = 220 + speed * 0.30;
    tone('triangle',pitch,110,0.085,0.40); noise(0.032,4200,1100,0.22);
    tone('sine',pitch*1.6,pitch*0.74,0.13,0.19,0.025);
    if (fire) tone('sawtooth',640,160,0.16,0.085);
  },
  jump() { tone('sine',165,420,0.10,0.19); tone('triangle',310,540,0.07,0.07,0.035); },
  point(celebrate, event) {
    // Short answers to the impact: a bright resolution or a tumbling bass lick.
    const phrases = celebrate ? [
      [523,659,784], [587,784,988,1175], [659,523,1047],
      [392,494,587,784], [784,988,1319],
    ] : [
      [294,247,196], [349,330,247,175], [392,233,196],
      [330,294,220,165], [294,185,147],
    ];
    const index = { ace: 1, rally: 2, streak: 3, ordinary: event.fire ? 4 : 0 }[event.pointKind];
    phrases[index].forEach((hz,i) => tone(celebrate ? 'triangle' : 'sine', hz, hz*(celebrate?1:0.88), 0.12, 0.13, 0.07+i*0.065));
  },
  boom(p) { noise(0.55 * p, 1500, 45, 0.45); tone('sine', 95, 26, 0.43, 0.42); tone('triangle', 60, 28, 0.42, 0.22); },
  pop() { noise(0.35, 2400, 200, 0.2); },
  net() { [0,0.044,0.083].forEach((t,i)=>tone('triangle',310-i*43,200-i*35,0.065,0.18/(i+1),t)); },
  wall() { tone('sine', 260, 180, 0.04, 0.1); },
  whistle() { tone('square', 2300, 2360, 0.2, 0.07); tone('square', 2460, 2400, 0.2, 0.05); },
  sel() { tone('square', 520, 520, 0.04, 0.08); },
  go() { tone('square', 520, 1040, 0.12, 0.1); },
  sting() { [1, 1.5, 2].forEach((m, i) => tone('sawtooth', 220 * m, 222 * m, 0.3, 0.13, i * 0.07)); },
  land(hard) { tone('sine',hard?155:190,55,hard?0.15:0.08,hard?0.38:0.16); noise(0.07,1200,250,hard?0.24:0.09); },
};
const play = (n, ...a) => { if (ac && scene !== 'title') sfx[n](...a); };
function cheer(a) {
  if (!ac || scene === 'title') return;
  const t = ac.currentTime;
  crowd.gain.cancelScheduledValues(t);
  crowd.gain.setTargetAtTime(a, t, 0.08);
  crowd.gain.setTargetAtTime(0.03, t + 0.9, 0.8);
}
function toggleMute() {
  muted = !muted;
  if (muted) stopCall();
  if (master) master.gain.value = muted ? 0 : 0.6;
  try { localStorage.setItem(muteKey, muted ? '1' : '0'); } catch {}
}

// ---------- particles ----------
function sp(type, x, y, vx, vy, life, size, color) {
  if (P.length > 1400) return;
  P.push({ type, x, y, vx, vy, life, max: life, size, color, rot: rnd(6.28) });
}
function fireBurst(x, y, n, pow, up = 0.3) {
  for (let i = 0; i < n; i++) {
    const a = rnd(6.28), v = rnd(40, pow);
    sp('fire', x + rnd(-6, 6), y + rnd(-6, 6), Math.cos(a) * v, Math.sin(a) * v - pow * up, rnd(0.3, 0.8), rnd(14, 38));
  }
}
function sparks(x, y, n, pow, color) {
  for (let i = 0; i < n; i++) {
    const a = rnd(6.28), v = rnd(pow * 0.3, pow);
    sp('spark', x, y, Math.cos(a) * v, Math.sin(a) * v - pow * 0.3, rnd(0.25, 0.7), rnd(1.5, 3), color);
  }
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function explode(x, y, p) {
  const quiet = reducedMotion.matches;
  if (!quiet) shake = Math.max(shake, 4 * p);
  excite = 1;
  scorch.push({ x, y, r: 34 * p + rnd(10), born: T, power: p, angle: rnd(Math.PI*2), quiet });
  if (scorch.length > 24) scorch.shift();
  if (match) match.slimes.forEach((s, i) => {
    const d = Math.abs(s.x - x);
    if (d < 190) { vis[i].char = 1.8; if (mode !== 'online' && !match.replaying && s.y >= GROUND) s.vy = -(300 + (190 - d) * 2.2); }
  });
}
function firework(x, y) {
  const c = pick(['#ffd23a', '#ff5a8a', '#5ad1ff', '#8aff6a', '#ffffff', '#ff8a1a']);
  for (let i = 0; i < 46; i++) { const a = rnd(6.28), v = rnd(60, 330); sp('spark', x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.6, 1.3), rnd(1.5, 3), c); }
  sp('bulb', x, y, 0, 0, 0.25, 160);
  play('pop');
}
function say(text, delay = 0, size = 92) {
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i].t >= 0 && delay === 0) calls.splice(i, 1);
  calls.push({ text, t: -delay, dur: 1.25, size });
}
function resetFx() {
  replayClip = null;
  stopCall();
  P.length = later.length = scorch.length = calls.length = 0;
  shake = excite = slowT = freeze = acc = 0; timeScale = 1;
  vis.forEach(v => { v.w = v.wv = v.char = 0; });
}

function updateFx(dt) {
  T += dt;
  shake *= Math.exp(-dt * 7); excite *= Math.exp(-dt * 1.2); netWob *= Math.exp(-dt * 8);
  for (let i = later.length - 1; i >= 0; i--) if ((later[i].t -= dt) <= 0) { later[i].fn(); later.splice(i, 1); }
  for (const c of calls) c.t += dt;
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i].t > calls[i].dur) calls.splice(i, 1);
  for (const v of vis) {
    v.wv += (-260 * v.w - 14 * v.wv) * dt; v.w += v.wv * dt; v.char = Math.max(0, v.char - dt);
  }
  if (Math.random() < 0.06 + excite * 1.5) sp('bulb', rnd(W), rnd(262, 372), 0, 0, 0.1, rnd(10, 24));
  if (match) {
    const b = match.ball, v = Math.hypot(b.vx, b.vy);
    spin += b.vx * dt * 0.03;
    if (match.phase === 'play') {
      if (b.fire) {
        for (let i = 0; i < 3; i++) sp('fire', b.x + rnd(-6, 6), b.y + rnd(-6, 6), -b.vx * 0.15 + rnd(-40, 40), -b.vy * 0.15 + rnd(-40, 40), rnd(0.25, 0.5), rnd(22, 38));
        if (Math.random() < 0.4) sparks(b.x, b.y, 1, 200);
      } else if (v > 600) sp('fire', b.x, b.y, -b.vx * 0.1 + rnd(-20, 20), -b.vy * 0.1 + rnd(-20, 20), rnd(0.15, 0.35), 8 + (v - 600) * 0.07);
    }
    match.slimes.forEach((s, i) => {
      const k = match.streak[i];
      if (k >= 3) for (let j = 0; j < 2; j++) { const a = rnd(Math.PI); sp('fire', s.x + Math.cos(a) * R * 0.9, s.y - Math.sin(a) * R * 0.9, rnd(-30, 30), -rnd(40, 140), rnd(0.25, 0.5), rnd(18, 32)); }
      else if (k === 2 && Math.random() < 0.3) sp('smoke', s.x + rnd(-R * 0.6, R * 0.6), s.y - R * 0.8, rnd(-15, 15), -rnd(30, 70), rnd(0.6, 1.1), rnd(12, 20));
      if (vis[i].char > 0.4 && Math.random() < 0.4) sp('smoke', s.x + rnd(-20, 20), s.y - R * 0.8, rnd(-15, 15), -rnd(30, 70), rnd(0.5, 1), rnd(12, 20));
    });
  }
  if ((scene === 'result' || scene === 'champ') && (fwT -= dt) <= 0) {
    fwT = scene === 'champ' ? 0.3 : 0.7;
    const w = match.winner;
    firework(scene === 'champ' ? rnd(80, W - 80) : rnd(40, 440) + (w ? 480 : 0), rnd(60, 260));
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    if ((p.life -= dt) <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
    if (p.type === 'fire') { const k = 1 - 2.5 * dt; p.vx *= k; p.vy = p.vy * k - 260 * dt; }
    else if (p.type === 'smoke') { p.vx *= 1 - 1.5 * dt; p.vy -= 30 * dt; p.size += 30 * dt; }
    else if (p.type === 'spark') { p.vy += 700 * dt; if (p.y > GROUND + 30 && p.vy > 0) p.vy *= -0.4; }
    else if (p.type === 'ring') p.size += p.vx * dt;
    if (p.type !== 'ring') { p.x += p.vx * dt; p.y += p.vy * dt; }
  }
}

// ---------- match flow ----------
let room = null, roomMenu = false;
const panel = document.getElementById('friend-lobby');
const lobby = friendLobby(panel, {leave: exitRoom});
function clearInput() {
  for (const k in keys) keys[k] = false;
  releaseControls();
  room?.input({l:0,r:0,u:false,d:false});
}
function exitRoom() {
  const old = room; room = null;
  old?.leave();
  history.replaceState(null, '', location.pathname + location.search);
  lobby.hide(); clearInput(); roomMenu = false; mode = 'ladder'; toTitle();
}
function showRoom(status, detail = '') {
  if (!room) return;
  if (status === 'playing') {
    if (scene !== 'match') {
      resetFx(); beginPlay(); clearInput();
    }
    if (!roomMenu) lobby.hide();
    return;
  }
  if (status === 'finished') {
    roomMenu = false;
    scene = 'room';
    const final = room.sample() || match;
    const title = final.winner < 0 ? 'Match finished' : final.winner === room.side ? 'You win!' : 'Friend wins!';
    const waiting = room.wantsRematch || room.players.rematch?.[room.side];
    const message = [final.score.join(' – '), waiting ? 'Waiting for your friend…' : room.detail].filter(Boolean).join(' · ');
    lobby.show(title, message, waiting ? 'Rematch requested' : 'Rematch', waiting ? null : () => {
      room.rematch(); showRoom('finished');
    });
    return;
  }
  roomMenu = false; scene = 'room'; clearInput();
  if (status === 'waiting') {
    const link = room.side === 0 && room.canShare ? room.inviteURL : '';
    lobby.show(room.sport === 'soccer' ? 'Slime soccer' : 'Play a friend', detail || 'Waiting for your friend…',
      'Ready', room.wantsReady ? null : () => {
        audio(); fitMatchScreen(); room.ready();
        if (room.status === 'waiting') showRoom('waiting', detail);
      }, link);
  } else {
    const fallback = {connecting:'Connecting…', reconnecting:'Reconnecting…',
      away:'Waiting for your friend to reconnect…', closed:'This match has ended.', error:'Could not connect.'};
    lobby.show('Play a friend', detail || fallback[status] || 'Connecting…');
  }
}
function enterRoom(id) {
  audio(); mode = 'online'; scene = 'room'; paused = roomMenu = false;
  resetFx(); brains = [null,null]; looks = [P1,P2]; match = S.createMatch({sport: selectedSport});
  const session = new FriendRoom({
    onStatus(status, detail) {
      if (room !== session) return;
      if (status === 'waiting' && !session.state && session.sport !== match.sport) {
        match = S.createMatch({sport: session.sport});
      }
      if (session.side === 0 || session.side === 1) {
        looks = [P1,P2].map((look,i)=>({...look, name:i === session.side ? 'YOU' : 'FRIEND'}));
      }
      showRoom(status, detail);
    },
    onSnapshot(state, events) {
      if (room !== session) return;
      match = state; snapshotAt = performance.now();
      if (state.phase !== 'point') replayClip = null;
      for (const ev of events || []) handle(ev);
      if (session.status === 'finished') showRoom('finished');
    }
  });
  room = session;
  showRoom('connecting');
  (id ? session.join(id) : session.create(selectedSport)).catch(error => {
    if (room === session) showRoom('error',error.message);
  });
}
function openRoomMenu() {
  if (roomMenu || !room || room.status !== 'playing') return;
  roomMenu = true; clearInput();
  lobby.show('Live match', 'The match is still playing.', 'Keep playing', () => {
    roomMenu = false; lobby.hide();
  });
}
function setSpeeds() { brains.forEach((b, i) => { match.slimes[i].speed = b ? b.cfg.speed : 1; }); }
function fitMatchScreen() {
  if (TOUCH && document.fullscreenEnabled && !document.fullscreenElement &&
      !navigator.standalone && !matchMedia('(display-mode: standalone)').matches &&
      matchMedia('(orientation: landscape)').matches) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
function pickCountry() {
  if (countryI >= teams.length) countryI = 0;
  mode = 'cup'; scene = 'countries'; sceneT = 0; paused = false; cup = null;
  clearInput(); resetFx(); fitMatchScreen();
}
function startCup(i) {
  countryI = i; cup = drawCup(teams[i]); startMatch();
}
function startMatch() {
  if (scene === 'title') fitMatchScreen();
  const o = OPP[oppI];
  looks = mode === 'cup' ? cup.field.slice(0,2) : mode === '2p' ? [P1,P2] : [YOU,o];
  match = S.createMatch({sport: selectedSport});
  brains = [null, mode === '2p' ? null : S.makeBrain(mode === 'cup' ? rivals[cup.round] : o.id)];
  setSpeeds(); resetFx();
  scene = 'vs'; sceneT = 0; paused = false; menuI = 0;
}
function startDemo() {
  const a = (Math.random() * 5) | 0, b = (a + 1 + ((Math.random() * 4) | 0)) % 5;
  looks = [OPP[a], OPP[b]];
  match = S.createMatch({sport: selectedSport, highlights: false});
  brains = [S.makeBrain(OPP[a].id), S.makeBrain(OPP[b].id)];
  setSpeeds(); resetFx();
}
function toTitle() { scene = 'title'; sceneT = 0; menuI = 0; paused = false; startDemo(); }
function beginPlay() { scene = 'match'; sceneT = 0; play('go'); }
function resultItems() {
  if (mode === 'cup') {
    const next = match.winner === 0
      ? ['PLAY ' + rounds[cup.round+1], () => { advanceCup(cup); startMatch(); }]
      : ['NEW CUP', pickCountry];
    return [next, ['MAIN MENU', toTitle]];
  }
  if (mode === 'ladder' && match.winner === 0) return [[`NEXT UP: ${OPP[oppI + 1].name}`, () => { oppI++; startMatch(); }], ['MAIN MENU', toTitle]];
  return [['REMATCH', startMatch], ['MAIN MENU', toTitle]];
}
const titleActs = [
  () => { if (selectedSport === 'soccer') return pickCountry(); mode = 'ladder'; oppI = 0; startMatch(); },
  () => { mode = 'quick'; oppI = quickI; startMatch(); },
  () => { mode = '2p'; startMatch(); },
  () => enterRoom(null), toggleMute, toggleVoice, cycleSport,
];

function handle(e) {
  const demo = scene === 'title';
  switch (e.type) {
    case 'jump': play('jump'); break;
    case 'hit': {
      sparks(e.x, e.y, 5 + e.speed / 70, 120 + e.speed * 0.5);
      vis[e.side].wv += 4;
      if (e.fire) { fireBurst(e.x, e.y, 26, 380); sp('ring', e.x, e.y, 500, 0, 0.3, 6); shake = Math.max(shake, 9); freeze = 0.05; }
      else if (e.speed > 760) { shake = Math.max(shake, 5); freeze = 0.03; }
      play('hit', e.speed, e.fire);
      break;
    }
    case 'net': netWob = 1; play('net'); break;
    case 'wall': sparks(e.x, e.y, 4, 160); play('wall'); break;
    case 'land': {
      const s = match.slimes[e.side];
      vis[e.side].wv -= e.hard ? 7 : 3.5;
      for (let i = 0; i < (e.hard ? 10 : 4); i++) sp('smoke', s.x + rnd(-R, R), GROUND, rnd(-80, 80), -rnd(10, 40), rnd(0.3, 0.6), rnd(8, 16));
      if (e.hard) shake = Math.max(shake, 4);
      play('land', e.hard);
      break;
    }
    case 'serve': play('whistle'); break;
    case 'point': {
      const pow = clamp(e.speed / 620, 0.75, 1.5) * (e.fire ? 1.2 : 1);
      explode(e.x, match.sport === 'soccer' ? e.y : GROUND, pow);
      replayClip = e.replay || null;
      slowT = replayClip ? 0 : 0.5; play('boom', Math.min(1.3, pow)); cheer(e.highlight && !demo ? 0.23 : 0.16);
      if (demo) break;
      const celebrate = mode === '2p' || e.scorer === (mode === 'online' ? room.side : 0);
      announcePoint(e, celebrate);
      play('point', celebrate, e);
      const k = match.streak[e.scorer];
      if (match.sport === 'soccer') say('GOAL!');
      else if (e.pointKind === 'streak') say('EXTINGUISHED!', 0, 80);
      else if (e.pointKind === 'rally') say('WHAT A RALLY!', 0, 80);
      else if (e.pointKind === 'ace') say('ACE!', 0, 110);
      else if (k === 3) say('ON FIRE!');
      else if (k === 2) say("SMOKIN'!");
      else if (e.speed > 800) say(pick(['KABOOM!', 'OBLITERATED!', 'CRATERED!', 'NUKED!']));
      else say(pick(['BOOM!', 'DENIED!', 'SCORCHED!', 'WRECKED!', 'INCOMING!']));
      if (k === 3) play('sting');
      const sc = match.score[e.scorer];
      if (sc === match.win - 1) say('MATCH POINT!', 1, 76);
      break;
    }
    case 'over': {
      if (mode === 'online') { cheer(0.2); play('sting'); break; }
      const lo = e.winner ? 0 : 480;
      for (let k = 0; k < 5; k++) later.push({ t: k * 0.22, fn: () => { explode(lo + rnd(50, 430), GROUND, rnd(0.8, 1.2)); play('boom', 1); } });
      if (demo) { later.push({ t: 3, fn: startDemo }); break; }
      cheer(0.2); play('sting');
      const lastRound = mode === 'cup' ? cup.round === rounds.length-1 : mode === 'ladder' && oppI === OPP.length-1;
      scene = lastRound && e.winner === 0 ? 'champ' : 'result';
      sceneT = 0; menuI = 0; fwT = 0.6;
      break;
    }
  }
}

const touchKeys = { KeyA: 0, KeyD: 0, KeyS: false, KeyW: false };
const held = key => keys[key] || touchKeys[key];
const human = (a,b) => ({
  l: Math.max(held(a[0]) || 0, (b && held(b[0])) || 0),
  r: Math.max(held(a[1]) || 0, (b && held(b[1])) || 0),
  u: held(a[2]) || (b && held(b[2])), d: held(a[3]) || (b && held(b[3])),
});
const WASD = ['KeyA', 'KeyD', 'KeyW', 'KeyS'], ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
function stepSim() {
  const m = match;
  const i0 = brains[0] ? S.think(m, 0, brains[0]) : human(WASD, mode === '2p' ? null : ARROWS);
  const i1 = brains[1] ? S.think(m, 1, brains[1]) : human(ARROWS);
  S.step(m, [i0, i1]);
  if (m.events.length) { const evs = m.events.splice(0); for (const e of evs) { if (m !== match) break; handle(e); } }
}

function update(dt) {
  sceneT += dt;
  if (mode === 'online') {
    if (scene === 'match' && room && room.status === 'playing') {
      if (!roomMenu) room.input(human(WASD,ARROWS));
      match = room.sample() || match;
      updateFx(dt);
    }
    return;
  }
  const running = scene === 'title' || scene === 'result' || scene === 'champ' || (scene === 'match' && !paused);
  if (scene === 'vs' && sceneT > 4) beginPlay();
  if (!running) { if (scene === 'vs') T += dt; return; }
  if (freeze > 0) { freeze -= dt; return; }
  if (slowT > 0) { slowT -= dt; timeScale = 0.22; } else timeScale += (1 - timeScale) * Math.min(1, dt * 6);
  const sdt = dt * timeScale;
  acc += sdt;
  while (acc >= DT) { acc -= DT; stepSim(); }
  updateFx(sdt);
}

// ---------- drawing ----------
function txt(s, x, y, size, o = {}) {
  ctx.save(); ctx.translate(x, y);
  if (o.scale) ctx.scale(o.scale, o.scale);
  ctx.transform(1, 0, o.skew ?? -0.16, 1, 0, 0);
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = '#0a0410'; ctx.strokeText(s, 0, 0);
  const ink = o.fill === 'fire' ? '#ffbb39' : o.fill === 'chrome' ? '#bdede8' : o.fill || '#fff6dc';
  if (o.fill === 'fire' || o.fill === 'chrome') {
    ctx.fillStyle = o.fill === 'fire' ? '#a64126' : '#456579';
    ctx.fillText(s, 0, Math.ceil(size / 18));
  }
  ctx.fillStyle = ink; ctx.fillText(s, 0, 0);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}
function button(label, x, y, size, i, fn, cycling = false) {
  const sel = menuI === i;
  const w = txt(label, x, y, size, { fill: sel ? '#ffd23a' : '#fff', alpha: sel ? 1 : 0.72, scale: sel ? 1.06 + Math.sin(T * 8) * 0.02 : 1 });
  if (sel && !cycling) { txt('▸', x - w / 2 - 26, y, size, { fill: '#ff5a12', skew: 0 }); txt('◂', x + w / 2 + 26, y, size, { fill: '#ff5a12', skew: 0 }); }
  const height = cycling ? 52 : size * 1.3;
  btns.push({ x: x - w / 2 - 40, y: y - height / 2, w: w + 80, h: height, fn: () => { menuI = i; fn(); } });
  return w;
}

function polygon(g, color, points) {
  g.fillStyle = color;
  g.beginPath(); g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.closePath(); g.fill();
}

function drawArena(soccer) {
  const bg = document.createElement('canvas');
  bg.width = W / 2; bg.height = H / 2;
  const g = bg.getContext('2d');
  g.scale(0.5, 0.5);
  g.fillStyle = '#35395a'; g.fillRect(0, 0, W, H);
  // A low bank of dusk clouds behind the open end of the arena.
  polygon(g, '#58516b', [0,172, 164,172, 228,152, 574,152, 700,122, 960,122, 960,320, 0,320]);
  polygon(g, '#996f77', [0,222, 230,222, 354,202, 728,202, 816,182, 960,182, 960,320, 0,320]);
  polygon(g, '#41465c', [0,280, 104,226, 166,248, 268,202, 338,242, 412,222, 508,266, 678,210, 744,242, 862,200, 960,238, 960,320, 0,320]);
  for (const x of [96, 864]) {
    polygon(g, '#2b3546', [x-8,270, x-4,136, x+3,136, x+10,270]);
    polygon(g, '#747986', [x-4,136, x,136, x-2,270, x-8,270]);
    polygon(g, '#242c40', [x-34,116, x+32,116, x+28,140, x-38,140]);
    g.fillStyle = '#ffeab5';
    for (let k=0; k<5; k++) for (let row=0; row<2; row++) g.fillRect(x-29+k*12-row*2,120+row*9,8,6);
  }
  // Three terraces with sloped wings and blocks of spectators.
  for (let row=0; row<3; row++) {
    const y=270+row*38;
    polygon(g, '#242f43', [0,y-38, 220,y, 740,y, 960,y-38, 960,y+72, 0,y+72]);
    for (let x=0; x<W; x+=12) {
      const slope=Math.max(0, 220-Math.min(x,W-x))*0.17;
      if (Math.floor(x/72)%4 === 1) continue;
      for (let k=0;k<2;k++) {
        g.fillStyle=pick(['#62667a','#788589','#886b66','#465772']);
        g.fillRect(x+k*3,y+6+k*12-slope,6,8);
      }
    }
    polygon(g, '#535a6c', [0,y-8, 220,y+30, 740,y+30, 960,y-8, 960,y-2, 740,y+36, 220,y+36, 0,y-2]);
  }
  const [wallX,wallY]=screen(0,GROUND,-230);
  const [farX,farY]=screen(W,GROUND,-230);
  g.save(); g.translate(wallX,wallY); g.transform(1,(farY-wallY)/(farX-wallX),0,1,0,0);
  g.fillStyle='#202e41'; g.fillRect(-W,-25,3*W,28);
  g.font='17px '+FONT; g.textAlign='center'; g.fillStyle='#a5bbb6';
  for(let i=0;i<4;i++) g.fillText(soccer ? 'SLIME SOCCER 2000' : 'SLIME VOLLEYBALL 2000',(i+0.5)*(farX-wallX)/4,-6,190);
  g.restore();
  if (soccer) {
    drawPitch(g);
    return bg;
  }
  floorFace(g,'#4a7c77',-1600,1600,-230,700);
  floorFace(g,'#5b9c8e',0,NET_X,-136,136);
  floorFace(g,'#508e83',NET_X,W,-136,136);
  for (const x of [0,NET_X,W-3]) floorFace(g,'#cfdbc2',x,x+3,-136,136);
  for (const z of [-136,133]) floorFace(g,'#cfdbc2',0,W,z,z+3);
  return bg;
}
const arenas = { volleyball: drawArena(false), soccer: drawArena(true) };
function drawPitch(g) {
  floorFace(g,'#426b56',-1600,1600,-230,700);
  for (let i=0; i<8; i++) floorFace(g,i%2 ? '#508450' : '#578f58',i*W/8,(i+1)*W/8,-136,136);
  const ink='#d5e1b8';
  for (const z of [-136,133]) floorFace(g,ink,0,W,z,z+3);
  for (const x of [0,NET_X-1.5,W-3]) floorFace(g,ink,x,x+3,-136,136);
  for (const x of [0,W-116]) {
    for (const z of [-80,77]) floorFace(g,ink,x,x+116,z,z+3);
    const inner=x===0?113:x;
    floorFace(g,ink,inner,inner+3,-80,80);
  }
  g.strokeStyle=ink; g.lineWidth=2.5; g.beginPath();
  for (let i=0;i<=32;i++) {
    const a=i*Math.PI/16, p=screen(NET_X+66*Math.cos(a),GROUND,66*Math.sin(a));
    if (!i) g.moveTo(...p); else g.lineTo(...p);
  }
  g.stroke();
  floorFace(g,ink,NET_X-4,NET_X+4,-4,4);
}
function drawGoals(front) {
  const top = S.GOAL_TOP, z = 67;
  function line(a,b,ink,width) {
    ctx.strokeStyle=ink; ctx.lineWidth=width; ctx.beginPath();
    ctx.moveTo(...screen(...a)); ctx.lineTo(...screen(...b)); ctx.stroke();
  }
  for (const x of [0,W]) {
    const back=x+(x===0?-22:22), white='#f3eed5', grid='#859888';
    if (!front) {
      for(let d=-z;d<=z;d+=16) line([back,top,d],[back,GROUND,d],grid,1.5);
      for(let y=top;y<=GROUND;y+=16) line([back,y,-z],[back,y,z],grid,1.5);
      line([back,top,-z],[back,top,z],white,2);
      line([x,top,-z],[x,GROUND,-z],white,4);
      line([x,top,-z],[back,top,-z],white,3);
    } else {
      line([x,top,-z],[x,top,z],white,4);
      line([x,top,z],[x,GROUND,z],white,4);
      line([x,top,z],[back,top,z],white,3);
      line([back,top,z],[back,GROUND,z],grid,2);
    }
  }
}

function screen(x,y,z=0) {
  const [u,v]=project(x-W/2,GROUND-y,z);
  return [W/2+u*0.94,427+v*0.94];
}
function floorFace(g,ink,left,right,back,front) {
  polygon(g,ink,[...screen(left,GROUND,back),...screen(right,GROUND,back),...screen(right,GROUND,front),...screen(left,GROUND,front)]);
}
function drawSlime(look,side,x,y,o={}) {
  const dx=(o.bx??x)-x, dy=y-(o.by??y);
  const length=Math.hypot(dx,dy)||1;
  ctx.save(); ctx.translate(x,y); ctx.scale(o.scale||1,o.scale||1);
  slime(ctx,look,side,clamp(o.sq||0,-0.3,0.3),o.char,dx/length,dy/length); ctx.restore();
}
function net(back,front) {
  const x=NET_X+Math.sin(T*60)*netWob*2;
  function line(z1,y1,z2,y2,ink,width) {
    ctx.strokeStyle=ink; ctx.lineWidth=width;
    ctx.beginPath(); ctx.moveTo(...screen(x,y1,z1)); ctx.lineTo(...screen(x,y2,z2)); ctx.stroke();
  }
  for(let z=back+8;z<front;z+=16) line(z,NET_TOP,z,GROUND-16,'#344959',1.4);
  for(let y=NET_TOP+12;y<GROUND-14;y+=12) line(back,y,front,y,'#344959',1.4);
  line(back,NET_TOP,front,NET_TOP,'#f2dda4',3.5);
  const post=back<0?back:front;
  line(post,GROUND,post,NET_TOP-2,'#394957',6);
  line(post,GROUND,post,NET_TOP-2,'#e3cd95',2);
}
function drawParticles(front) {
  for (const p of P) {
    if (front === (p.type === 'smoke')) continue;
    const [x,y]=screen(p.x,p.y);
    const f=p.life/p.max, size=Math.max(2,p.size*f);
    if (p.type === 'ring') {
      ctx.strokeStyle='#ffe4a0'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x-p.size,y); ctx.lineTo(x-p.size/2,y-p.size/3);
      ctx.lineTo(x+p.size/2,y-p.size/3); ctx.lineTo(x+p.size,y); ctx.stroke();
    } else if (p.type === 'spark') {
      ctx.strokeStyle=p.color || '#ffdf92'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-p.vx*0.017,y-p.vy*0.017); ctx.stroke();
    } else {
      ctx.fillStyle={fire:f>0.65?'#ffe59a':f>0.3?'#ffad39':'#cc5030', smoke:'#636376', bulb:'#ffedbd'}[p.type];
      const r=size*(p.type==='bulb'?0.07:0.22);
      ctx.fillRect(x-r,y-r,r*2,r*2);
    }
  }
}
// The blast grows out of the ball, then splits into cooling lobes and falling shell pieces.
function drawImpact(mark) {
  const age = T - mark.born;
  if (age < 0 || age >= 0.85) return;
  const [cx, cy] = screen(mark.x, mark.y);
  if (age < 0.055 || mark.quiet) {
    if (age > 0.18) return;
    ctx.save(); ctx.translate(cx, cy - 6); ctx.scale(1.35, 0.52);
    drawBall(ctx, BR, mark.angle, true, match.sport === 'soccer'); ctx.restore();
    return;
  }
  const t = (age - 0.055) / 0.795;
  const spread = 1 - (1-t)**3;
  const radius = mark.r * spread * (1.7 - 0.65*t);
  ctx.save();
  for (let i=0; i<7; i++) {
    const a = mark.angle + i * Math.PI*2/7;
    const [x,y] = screen(mark.x + Math.cos(a)*radius, mark.y, Math.sin(a)*radius);
    const lift = (18 + 13*(i%3))*spread + 24*t;
    const size = (19 + (i%3)*5)*mark.power*Math.sin(Math.PI*Math.sqrt(t));
    const hot = t < 0.36;
    ctx.globalAlpha = Math.min(1,(1-t)*2);
    polygon(ctx, hot ? '#d85832' : '#575365', [x-size,y-lift,x-size*.6,y-lift-size*.8,
      x+size*.3,y-lift-size,x+size,y-lift-size*.3,x+size*.8,y-lift+size*.5,x-size*.4,y-lift+size*.6]);
    polygon(ctx, hot ? '#ffbd49' : '#837887', [x-size,y-lift,x-size*.6,y-lift-size*.8,
      x+size*.3,y-lift-size,x+size*.1,y-lift-size*.2]);
  }
  ctx.globalAlpha = 1;
  for (let i=0; i<8; i++) {
    const a = mark.angle + i*Math.PI/4;
    const reach = (52 + 16*(i%3))*spread*mark.power;
    const [x,y] = screen(mark.x + Math.cos(a)*reach,mark.y,Math.sin(a)*reach);
    const arc = 4*t*(1-t)*(38+12*(i%4))*mark.power;
    const size = (4 + i%4)*(1-t);
    ctx.save(); ctx.translate(x,y-arc); ctx.rotate(a+t*(i%2 ? 5 : -6));
    polygon(ctx, ['#fff2bd','#e98948','#51677b'][i%3], [-size,-size*.5,size,-size*.7,size*.65,size]);
    ctx.restore();
  }
  ctx.restore();
}
function drawWorld(replay) {
  const soccer = match.sport === 'soccer';
  ctx.drawImage(soccer ? arenas.soccer : arenas.volleyball, 0, 0, W, H);
  const m = replay || match, b = m.ball;
  function shadow(x,r,ink) {
    const points=[];
    for(let i=0;i<12;i++) {
      const t=i*Math.PI/6;
      points.push(...screen(x+r*Math.cos(t),GROUND,r*Math.sin(t)));
    }
    polygon(ctx,ink,points);
  }
  const marks = replay ? scorch.slice(0, -1) : scorch;
  for(const s of marks) shadow(s.x,s.r,'#446459');
  for(const s of m.slimes) shadow(s.x,R*(1-clamp((GROUND-s.y)/400,0,0.6)),'#396e66');
  const ballVisible=m.phase!=='point' && m.phase!=='over';
  if(ballVisible) shadow(b.x,BR*(1-clamp((GROUND-b.y)/600,0,0.7)),'#396e66');
  if (soccer) drawGoals(false); else net(-136,0);
  if (!replay) drawParticles(false);
  const [bx,by]=screen(b.x,b.y);
  m.slimes.forEach((s,i)=>{
    const [x,y]=screen(s.x,s.y);
    drawSlime(looks[i],soccer ? Number(b.x < s.x) : i,x,y,{scale:0.94,sq:(replay ? 0 : vis[i].w)-clamp(Math.abs(s.vy)/5000,0,0.14),char:replay ? 0 : vis[i].char,bx,by});
  });
  if(ballVisible) {
    ctx.save(); ctx.translate(bx,by);
    if(m.phase==='serve') {
      ctx.strokeStyle='#d9b64e'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,BR+6+Math.sin(T*14)*2,0,Math.PI*2); ctx.stroke();
    }
    drawBall(ctx,BR*0.94,replay ? replay.spin : spin,b.fire,soccer); ctx.restore();
    if(by < -BR) polygon(ctx,'#ffd23a',[bx,6,bx-9,22,bx+9,22]);
  }
  if (soccer) drawGoals(true); else net(0,136);
  if (replay) {
    const mark = scorch.at(-1);
    if (mark && replay.phase === 'point') drawImpact({...mark, born: T - replay.impactAge});
  } else {
    for (const mark of scorch) drawImpact(mark);
    drawParticles(true);
  }
}
function drawHud() {
  const m = match;
  for (let i = 0; i < 2; i++) {
    const x = i ? W - 24 : 24, al = i ? 'right' : 'left', k = m.streak[i];
    const flagOffset = mode === 'cup' ? (i ? -43 : 43) : 0;
    if (mode === 'cup') drawFlag(ctx, looks[i], i ? x-35 : x, 17, 35, 22);
    txt(looks[i].name, x + flagOffset, 28, 26, { align: al, fill: looks[i].color });
    txt(String(m.score[i]), i ? W - 26 : 26, 82, 70, { align: al, fill: k >= 3 ? 'fire' : '#fff' });
    if (k >= 3) txt('ON FIRE', i ? W - 80 : 80, 70, 20, { align: al, fill: 'fire', alpha: 0.75 + Math.sin(T * 20) * 0.25 });
    else if (k === 2) txt("SMOKIN'", i ? W - 80 : 80, 70, 18, { align: al, fill: '#c9c2d0' });
  }
  txt(`FIRST TO ${m.win}`, W / 2, 24, 18, { fill: '#ffd23a' });
  if (mode === 'cup') txt(rounds[cup.round], W/2, 46, 16, {fill:'#ffd23a'});
  if (mode === 'ladder') txt(`ROUND ${oppI + 1} OF ${OPP.length}`, W / 2, 46, 14, { alpha: 0.8 });
  if (m.sport !== 'soccer' && m.phase === 'play' && m.rally >= 6) txt(`RALLY ${m.rally}`, W / 2, 72, 20, { fill: m.rally >= 14 ? 'fire' : '#fff' });
  if (TOUCH && scene === 'match') { txt(mode === 'online' ? '⋯' : paused ? '▶' : 'II', W / 2, 104, 22, { skew: 0, alpha: 0.7 }); btns.push({ x: W / 2 - 40, y: 80, w: 80, h: 48, fn: () => { if (mode === 'online') openRoomMenu(); else { paused = !paused; menuI = 0; } } }); }
}
const backOut = t => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
function drawCalls() {
  for (const c of calls) {
    if (c.t < 0) continue;
    const p = c.t / c.dur, s = p < 0.14 ? backOut(p / 0.14) * 1.0 : 1 + (p - 0.14) * 0.1;
    txt(c.text, W / 2 + rnd(-2, 2) * (p < 0.3 ? 2 : 0), 200, c.size, { fill: 'fire', scale: Math.max(0.05, s), alpha: p > 0.8 ? (1 - p) / 0.2 : 1, skew: -0.2 });
  }
}
function dim(a) { ctx.fillStyle = `rgba(8,4,22,${a})`; ctx.fillRect(-marginX, -marginY, W + 2*marginX, H + 2*marginY); }
function drawTitle() {
  dim(0.66);
  const pop = backOut(Math.min(1, sceneT / 0.5));
  txt(selectedSport === 'soccer' ? 'SLIME SOCCER' : 'SLIME VOLLEYBALL', W / 2, 112, 84, { fill: 'fire', scale: pop });
  txt('2000', W / 2 + 6, 206, 96, { fill: 'chrome', skew: -0.26, scale: pop });
  button('◀  ' + selectedSport.toUpperCase() + '  ▶', W / 2, 264, 26, 6, titleActs[6], true);
  button(selectedSport === 'soccer' ? 'WORLD CUP' : 'LADDER', W / 2, 318, 32, 0, titleActs[0]);
  const w = button(`QUICK MATCH: ${OPP[quickI].name}`, W / 2, 362, 32, 1, titleActs[1]);
  if (menuI === 1) {
    const step = d => () => { quickI = (quickI + d + OPP.length) % OPP.length; play('sel'); };
    txt('◀', W / 2 - w / 2 - 78, 362, 24, { skew: 0, fill: OPP[quickI].color }); txt('▶', W / 2 + w / 2 + 78, 362, 24, { skew: 0, fill: OPP[quickI].color });
    btns.unshift({ x: W / 2 - w / 2 - 104, y: 340, w: 50, h: 44, fn: step(-1) }, { x: W / 2 + w / 2 + 54, y: 340, w: 50, h: 44, fn: step(1) });
  }
  button('2 PLAYERS', W / 2, 400, 30, 2, titleActs[2]);
  button('PLAY A FRIEND', W / 2, 438, 30, 3, titleActs[3]);
  button(`SOUND: ${muted ? 'OFF' : 'ON'}`, W / 2 - 112, 480, 22, 4, titleActs[4]);
  button(`ANNOUNCER: ${voiceOn ? 'ON' : 'OFF'}`, W / 2 + 110, 480, 22, 5, titleActs[5]);
  if (!TOUCH) txt('P1: A/D MOVE · W JUMP · S DIVE      P2: ARROW KEYS      P PAUSE · M MUTE', W / 2, 512, 15, { alpha: 0.7, skew: 0 });
}
function drawCountries() {
  dim(0.86);
  txt('WORLD CUP', W/2, 78, 74, {fill:'fire'});
  txt('CHOOSE YOUR COUNTRY', W/2, 146, 24, {fill:'chrome'});
  teams.forEach((team,i) => {
    const x = 84 + i%4 * 202, y = 186 + Math.floor(i/4)*118;
    const selected = i === countryI;
    ctx.fillStyle = selected ? '#39475d' : '#20293a';
    ctx.fillRect(x,y,186,104);
    if (selected) { ctx.strokeStyle='#ffd23a'; ctx.lineWidth=3; ctx.strokeRect(x,y,186,104); }
    drawFlag(ctx,team,x+63,y+13,60,39);
    txt(team.name,x+93,y+77,24,{fill:selected ? '#ffd23a' : '#fff'});
    btns.push({x,y,w:186,h:104,fn:()=>startCup(i)});
  });
  txt('BACK',W/2,468,26,{fill:countryI===teams.length ? '#ffd23a' : '#ddd'});
  btns.push({x:W/2-70,y:440,w:140,h:56,fn:toTitle});
}
function drawVs() {
  dim(0.8);
  txt(mode === 'cup' ? 'WORLD CUP · ' + rounds[cup.round] : mode === 'ladder' ? `ROUND ${oppI + 1} OF ${OPP.length}` : mode === 'quick' ? 'QUICK MATCH' : '2 PLAYERS', W / 2, 60, 34, { fill: '#ffd23a' });
  if (mode === 'cup') looks.forEach((team,i) => drawFlag(ctx,team,195+i*480,125,90,54));
  const slide = 1 - Math.min(1, sceneT / 0.35) ** 0.5;
  drawSlime(looks[0], 0, 240 - slide * 500, 320, { scale: 2.3, bx: W, by: 220 });
  drawSlime(looks[1], 1, 720 + slide * 500, 320, { scale: 2.3, bx: 0, by: 220 });
  if (sceneT > 0.3) txt('VS', W / 2, 250, 120, { fill: 'fire', scale: backOut(Math.min(1, (sceneT - 0.3) / 0.25)) });
  txt(looks[0].name, 240, 368, 44, { fill: looks[0].color });
  txt(looks[1].name, 720, 368, 44, { fill: looks[1].color });
  if (looks[1].tag) { txt(looks[1].tag, 720, 410, 24, { fill: '#ffd23a' }); if (match.sport !== 'soccer') txt(looks[1].blurb, 720, 442, 17, { alpha: 0.9 }); }
  if (!TOUCH) {
    txt(mode === '2p' ? 'A/D MOVE · W JUMP · S DIVE' : 'A/D OR ←/→ MOVE · W JUMP · S DIVE', 240, 410, 17, { alpha: 0.9, skew: 0 });
    if (mode === '2p') txt('←/→ MOVE · ↑ JUMP · ↓ DIVE', 720, 410, 17, { alpha: 0.9, skew: 0 });
  }
  if (Math.sin(T * 6) > -0.3) txt(TOUCH ? 'TAP TO START' : 'PRESS ENTER', W / 2, 500, 22);
  btns.push({ x: 0, y: 0, w: W, h: H, fn: () => { if (sceneT > 0.4) beginPlay(); } });
}
function drawMenu(title, fill, sub, items, y0) {
  dim(0.5);
  txt(title, W / 2, 190, 96, { fill, scale: backOut(Math.min(1, sceneT / 0.3 || 1)) });
  if (sub) txt(sub, W / 2, 262, 30);
  items.forEach(([l, fn], i) => button(l, W / 2, y0 + i * 48, 32, i, fn));
}
function drawCupTrophy() {
  ctx.save(); ctx.translate(W/2,90);
  for (const direction of [-1,1]) {
    ctx.save(); ctx.scale(direction,1);
    ctx.strokeStyle='#db9542'; ctx.lineWidth=6; ctx.beginPath();
    ctx.moveTo(20,-19); ctx.lineTo(38,-19); ctx.lineTo(34,-3); ctx.lineTo(15,7); ctx.stroke();
    ctx.restore();
  }
  polygon(ctx,'#eca83e',[-25,-26,25,-26,21,-3,12,9,5,13,4,22,16,28,-16,28,-4,22,-5,13,-12,9,-21,-3]);
  polygon(ctx,'#ffe79c',[-23,-23,-13,-23,-9,-2,-5,9,-14,3,-19,-5]);
  ctx.fillStyle='#fff0a8'; ctx.fillRect(-26,-28,52,5);
  ctx.fillStyle='#805334'; ctx.fillRect(-20,28,40,6); ctx.restore();
}
function drawOverlays(replay) {
  drawHud();
  if (replay) txt('REPLAY', W / 2, 70, 28, {fill:'#ffd23a'});
  else drawCalls();
  if (paused) { drawMenu('PAUSED', 'chrome', null, [['RESUME', () => { paused = false; }], ['QUIT TO MENU', toTitle]], 300); return; }
  if (scene === 'result' && sceneT > 1.3) {
    const w = match.winner, won = w === 0, s = `${match.score[0]} - ${match.score[1]}`;
    const shut = match.score[1 - w] === 0 ? 'TOTAL MELTDOWN · ' : '';
    if (mode === 'cup') {
      drawMenu(won ? 'THROUGH!' : 'KNOCKED OUT', won ? 'fire' : 'chrome',
        looks[0].name + '  ' + s + '  ' + looks[1].name, resultItems(), 330);
      return;
    }
    drawMenu(mode === '2p' ? `${looks[w].name} WINS!` : won ? 'YOU WIN!' : 'YOU GOT TORCHED', won || mode === '2p' ? 'fire' : 'chrome', shut + s, resultItems(), 330);
  }
  if (scene === 'champ' && sceneT > 1.3) {
    drawMenu(mode === 'cup' ? 'WORLD CHAMPIONS' : 'LADDER CHAMPION', 'fire',
      mode === 'cup' ? looks[0].name + '  ' + match.score.join(' - ') + '  ' + looks[1].name : 'ALL FIVE. UP IN SMOKE.', [['MAIN MENU', toTitle]], 340);
    if (mode === 'cup') drawCupTrophy();
  }
}
function render() {
  ctx.setTransform(scale, 0, 0, scale, marginX * scale, marginY * scale);
  if (marginX > 0) {
    const bg = arenas[match.sport] || arenas.volleyball;
    ctx.drawImage(bg, 0, 0, 1, bg.height, -marginX, 0, marginX, H);
    ctx.drawImage(bg, bg.width-1, 0, 1, bg.height, W, 0, marginX, H);
  }
  btns.length = 0;
  ctx.save();
  let replay = null;
  if (scene === 'match' && match.phase === 'point' && replayClip) {
    // Advance smoothly between ordered online snapshots. The server owns the cut back to serve.
    const sinceSnapshot = mode === 'online' ? Math.min(0.05, (performance.now() - snapshotAt) / 1000) : 0;
    replay = replayPose(replayClip, Math.max(0, match.timer - sinceSnapshot));
  }
  if (!replay && shake > 0.3) { const z = 1 + shake * 0.003; ctx.translate(W / 2 + rnd(-shake, shake) * 0.8, H / 2 + rnd(-shake, shake) * 0.45); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
  drawWorld(replay);
  ctx.restore();
  if (scene === 'room') dim(0.78); else if (scene === 'title') drawTitle(); else if (scene === 'countries') drawCountries(); else if (scene === 'vs') drawVs(); else drawOverlays(replay);
}

// ---------- input ----------
function press(k) {
  audio();
  if (k === 'KeyM') return toggleMute();
  const up = k === 'ArrowUp' || k === 'KeyW', down = k === 'ArrowDown' || k === 'KeyS';
  const left = k === 'ArrowLeft' || k === 'KeyA', right = k === 'ArrowRight' || k === 'KeyD';
  const ok = k === 'Enter' || k === 'Space', esc = k === 'Escape';
  const nav = n => { if (up || down) { menuI = (menuI + (down ? 1 : n - 1)) % n; play('sel'); } };
  if (scene === 'title') {
    nav(titleActs.length);
    if (menuI === 1 && (left || right)) quickI = (quickI + (right ? 1 : OPP.length - 1)) % OPP.length;
    if (menuI === 6 && (left || right)) cycleSport();
    if (ok) titleActs[menuI]();
  } else if (scene === 'countries') {
    if (esc) return toTitle();
    if (countryI === teams.length) {
      if (ok) return toTitle();
      if (up || down) countryI = up ? 4 : 0;
    } else {
      if (left || right) countryI = (countryI + (right ? 1 : teams.length-1)) % teams.length;
      if (up || down) {
        const next = countryI + (down ? 4 : -4);
        countryI = next < 0 || next >= teams.length ? teams.length : next;
      }
      if (ok) startCup(countryI);
    }
  } else if (scene === 'vs') {
    if (ok && sceneT > 0.4) beginPlay();
    if (esc) toTitle();
  } else if (scene === 'match') {
    if (mode === 'online') { if (k === 'KeyP' || esc) openRoomMenu(); return; }
    if (k === 'KeyP' || esc) { paused = !paused; menuI = 0; }
    else if (paused) { nav(2); if (ok) { if (menuI) toTitle(); else paused = false; } }
  } else if (scene === 'result') {
    if (esc) return toTitle();
    if (sceneT > 1.3) { nav(2); if (ok) resultItems()[menuI][1](); }
  } else if (scene === 'champ') {
    if ((ok && sceneT > 1.3) || esc) toTitle();
  }
}
addEventListener('keydown', e => {
  if (!panel.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) press(e.code);
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { clearInput(); if (scene === 'match' && mode !== 'online') paused = true; });
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') e.preventDefault();
  audio();
  const r = cv.getBoundingClientRect();
  const x = (e.clientX-r.left)*cv.width/r.width/scale-marginX;
  const y = (e.clientY-r.top)*cv.height/r.height/scale-marginY;
  const b = btns.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (b) b.fn();
});
const stick = document.getElementById('stick'), jump = document.getElementById('jump');
function bindThumb(control, move, release) {
  let active = null;
  function reset() {
    if (active === null) return;
    const id = active;
    active = null;
    if (control.hasPointerCapture(id)) control.releasePointerCapture(id);
    release();
  }
  control.addEventListener('pointerdown', e => {
    if (active !== null || e.button !== 0) return;
    e.preventDefault(); active = e.pointerId; control.setPointerCapture(active); move(e);
  });
  control.addEventListener('pointermove', e => { if (e.pointerId === active) move(e); });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    control.addEventListener(type, e => { if (e.pointerId === active) reset(); });
  }
  return reset;
}
const knob = stick.firstElementChild;
let originX, originY;
const releaseStick = bindThumb(stick, e => {
  if (e.type === 'pointerdown') {
    originX = e.clientX;
    originY = e.clientY;
  }
  const r = stick.getBoundingClientRect();
  const dx = e.clientX-originX, dy = e.clientY-originY;
  const travel = (r.width-knob.offsetWidth)/2-2;
  const fullThrow = r.width / 2;
  const factor = travel / Math.max(fullThrow, Math.hypot(dx,dy));
  knob.style.transform = `translate(${dx*factor}px,${dy*factor}px)`;

  // Start at 20 CSS pixels, then allow the player to ease back to 15 to stop.
  const continuing = dx < 0 ? touchKeys.KeyA > 0 : touchKeys.KeyD > 0;
  const distance = Math.abs(dx);
  const speed = distance >= (continuing ? 15 : 20)
    ? clamp((distance - 15) / (fullThrow - 15), 0, 1) : 0;
  touchKeys.KeyA = dx < 0 ? speed : 0;
  touchKeys.KeyD = dx > 0 ? speed : 0;
  const diveDistance = touchKeys.KeyS ? 16 : 24;
  touchKeys.KeyS = dy >= diveDistance && dy >= Math.abs(dx) * 0.75;
}, () => {
  knob.style.transform = '';
  touchKeys.KeyA = touchKeys.KeyD = 0; touchKeys.KeyS = false;
});
const releaseJump = bindThumb(jump, () => {
  touchKeys.KeyW = true; jump.classList.add('on');
}, () => { touchKeys.KeyW = false; jump.classList.remove('on'); });
function releaseControls() { releaseStick(); releaseJump(); }
// The game handles taps through Pointer Events. Suppress native long-press
// selection on the court as well as on the two-thumb controls.
for (const type of ['touchstart', 'contextmenu', 'selectstart', 'dragstart']) {
  document.body.addEventListener(type, e => {
    if (e.cancelable && !panel.contains(e.target)) e.preventDefault();
  }, { passive: false });
}
addEventListener('blur', releaseControls);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseControls(); });

// ---------- boot ----------
const scale = 0.5;
let marginX = 0, marginY = 0;
function fitCanvas() {
  const r = cv.getBoundingClientRect();
  const aspect = r.width/r.height;
  if (!Number.isFinite(aspect) || aspect <= 0) return;
  cv.width = Math.round(Math.max(W,H*aspect)*scale);
  cv.height = Math.round(Math.max(H,W/aspect)*scale);
  marginX = (cv.width/scale-W)/2; marginY = (cv.height/scale-H)/2;
  ctx.imageSmoothingEnabled = false;
  releaseControls();
}
new ResizeObserver(fitCanvas).observe(cv);
fitCanvas();
startDemo();
function checkInvitation() {
  const id = roomFromLink();
  if (!id && !new URLSearchParams(location.hash.slice(1)).has('room')) return;
  scene = 'room';
  if (!id) { lobby.show('Play a friend', 'This invite is invalid.'); return; }
  const returning = hasRoomSeat(id);
  lobby.show('Play a friend', returning ? 'Your seat is saved.' : 'Join your friend.',
    returning ? 'Rejoin match' : 'Join match', () => enterRoom(id));
}
checkInvitation();
addEventListener('hashchange', () => { if (!room) checkInvitation(); });
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  update(dt);
  const showPad = TOUCH && scene === 'match' && !paused && panel.hidden;
  if (pad.hidden === showPad) {
    pad.hidden = !showPad;
    if (!showPad) releaseControls();
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
