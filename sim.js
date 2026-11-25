// pure game simulation + ai. no dom, so it also runs under node.
export const W = 960, H = 540, GROUND = 460;
export const NET_X = 480, NET_HW = 5, NET_TOP = 378;
export const SLIME_R = 46, BALL_R = 14, DT = 1 / 120;
export const HOME = [300, 660];
export const WIN_SCORE = 7;

const MOVE = 340, JUMP = 640, SLIME_G = 1950, DIVE = 1000;
const BALL_G = 900, MIN_POP = 520, REST = 0.78, CARRY = 0.5;
const MAX = 900, MAX_FIRE = 1080, FIRE = 1.2;
const RR = SLIME_R + BALL_R;

const ev = (st, type, data) => st.events.push({ type, ...data });
const mk = i => ({ x: HOME[i], y: GROUND, vx: 0, vy: 0, speed: 1, dive: false });

export function createMatch(o = {}) {
  const st = {
    slimes: [mk(0), mk(1)],
    ball: { x: 0, y: 0, vx: 0, vy: 0, fire: false },
    score: [0, 0], streak: [0, 0],
    phase: 'serve', timer: 0, server: o.server ?? 0,
    rally: 0, seq: 0, time: 0, winner: -1, win: o.win ?? WIN_SCORE, events: [],
  };
  serve(st);
  return st;
}

function serve(st) {
  const b = st.ball;
  b.x = HOME[st.server]; b.y = 175; b.vx = b.vy = 0; b.fire = false;
  st.phase = 'serve'; st.timer = 0.9; st.rally = 0; st.seq++;
  st.lastHitter = -1; st.exchanges = 0;
}

function moveSlime(st, i, inp) {
  const s = st.slimes[i];
  s.vx = ((inp.r || 0) - (inp.l || 0)) * MOVE * s.speed;
  const air = s.y < GROUND;
  if (!air && inp.u) { s.vy = -JUMP; ev(st, 'jump', { side: i }); }
  if (air || s.vy < 0) {
    s.vy += SLIME_G * DT;
    if (air && inp.d && s.vy < DIVE) { s.vy = DIVE; s.dive = true; }
  }
  s.x += s.vx * DT; s.y += s.vy * DT;
  if (s.y >= GROUND) {
    if (air) ev(st, 'land', { side: i, hard: s.dive });
    s.y = GROUND; s.vy = 0; s.dive = false;
  }
  const lo = i ? NET_X + NET_HW + SLIME_R : SLIME_R;
  const hi = i ? W - SLIME_R : NET_X - NET_HW - SLIME_R;
  if (s.x < lo) s.x = lo; else if (s.x > hi) s.x = hi;
}

// gravity, walls and net. symmetric about the net, so the ai can run it mirrored.
function ballFree(b, dt) {
  let hit = null;
  b.vy += BALL_G * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.92; hit = 'wall'; }
  else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.92; hit = 'wall'; }
  const dx = b.x - NET_X;
  if (b.y > NET_TOP) {
    if (Math.abs(dx) < NET_HW + BALL_R) {
      const side = dx < 0 ? -1 : 1;
      b.x = NET_X + side * (NET_HW + BALL_R);
      b.vx = side * Math.abs(b.vx) * 0.8;
      hit = 'net';
    }
  } else {
    const dy = b.y - NET_TOP, d = Math.hypot(dx, dy), min = NET_HW + BALL_R;
    if (d < min && d > 0) {
      const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
      b.x = NET_X + nx * min; b.y = NET_TOP + ny * min;
      if (vn < 0) { b.vx -= 1.75 * vn * nx; b.vy -= 1.75 * vn * ny; hit = 'net'; }
    }
  }
  return hit;
}

function bounce(b, s, nx, ny, fire) {
  const rvx = b.vx - s.vx, rvy = b.vy - s.vy, vn = rvx * nx + rvy * ny;
  if (vn >= 0) return false;
  const tx = rvx - vn * nx, ty = rvy - vn * ny;
  let out = Math.max(-vn * REST, MIN_POP);
  if (fire) out *= FIRE;
  b.vx = tx * 0.85 + nx * out + s.vx * CARRY;
  b.vy = ty * 0.85 + ny * out + s.vy * CARRY;
  const sp = Math.hypot(b.vx, b.vy), max = fire ? MAX_FIRE : MAX;
  if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
  return true;
}

export function step(st, inp) {
  st.time += DT;
  moveSlime(st, 0, inp[0]); moveSlime(st, 1, inp[1]);
  if (st.phase === 'over') return;
  if (st.phase === 'serve') {
    if ((st.timer -= DT) <= 0) { st.phase = 'play'; ev(st, 'serve', { side: st.server }); }
    return;
  }
  if (st.phase === 'point') {
    if ((st.timer -= DT) <= 0) {
      const s = st.server;
      if (st.score[s] >= st.win) { st.phase = 'over'; st.winner = s; ev(st, 'over', { winner: s }); }
      else serve(st);
    }
    return;
  }
  const b = st.ball;
  const w = ballFree(b, DT);
  if (w) ev(st, w, { x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
  for (let i = 0; i < 2; i++) {
    const s = st.slimes[i], dx = b.x - s.x, dy = b.y - s.y;
    if (dy >= 8) continue;
    const d = Math.hypot(dx, dy);
    if (d >= RR || d === 0) continue;
    const nx = dx / d, ny = dy / d;
    b.x = s.x + nx * RR; b.y = s.y + ny * RR;
    const fire = st.streak[i] >= 3;
    if (bounce(b, s, nx, ny, fire)) {
      if (st.lastHitter >= 0 && st.lastHitter !== i) st.exchanges++;
      st.lastHitter = i;
      st.rally++; st.seq++; b.fire = fire;
      ev(st, 'hit', { side: i, x: s.x + nx * SLIME_R, y: s.y + ny * SLIME_R, speed: Math.hypot(b.vx, b.vy), fire });
    }
  }
  if (b.y + BALL_R >= GROUND) {
    b.y = GROUND - BALL_R;
    const s = b.x < NET_X ? 1 : 0, o = 1 - s, broke = st.streak[o];
    const ace = s === st.server && st.rally === 1 && st.lastHitter === s;
    const pointKind = broke >= 3 ? 'streak' : st.exchanges >= 6 ? 'rally' : ace ? 'ace' : 'ordinary';
    st.score[s]++; st.streak[s]++; st.streak[o] = 0; st.server = s;
    st.phase = 'point'; st.timer = 1.5;
    ev(st, 'point', { scorer: s, pointKind, x: b.x, speed: Math.hypot(b.vx, b.vy), rally: st.rally, broke, fire: b.fire });
  }
}

// ---------- ai ----------
// every brain thinks in a mirrored frame where it is the right-hand slime.
const Y_GROUND_HIT = GROUND - RR + 8, Y_JUMP_HIT = 325, PDT = 1 / 60;

function predict(b, yStop, maxT = 5) {
  const p = { x: b.x, y: b.y, vx: b.vx, vy: b.vy };
  let t = 0;
  for (; t < maxT; t += PDT) {
    if (p.vy > 0 && p.y >= yStop) break;
    ballFree(p, PDT);
  }
  p.t = t;
  return p;
}

// Roll the ball forward once. Each candidate then rehearses a legal run and
// jump against that same flight, including early contacts and court limits.
function planReturn(b, me, opponentX, c, fire) {
  const flight = [], ball = { ...b };
  while (ball.y < GROUND - BALL_R && flight.length < 400) {
    ballFree(ball, DT);
    flight.push({ ...ball });
  }
  let best = null, bestScore = -Infinity;
  const stride = MOVE * c.speed * DT;
  for (let tick = 0; tick < flight.length; tick += c.sample) {
    const p = flight[tick];
    if (p.x < NET_X + NET_HW || p.y < GROUND - RR - 110) continue;
    for (const offset of c.offsets) {
      const target = Math.max(NET_X + NET_HW + SLIME_R, Math.min(W - SLIME_R, p.x + offset));
      if (Math.abs(target - me.x) > stride * (tick + 1) + 6) continue;
      const lift = GROUND - p.y - Math.sqrt(RR * RR - offset * offset);
      if (lift < -14 || lift > JUMP * JUMP / (2 * SLIME_G)) continue;
      const ascent = (JUMP - Math.sqrt(Math.max(0, JUMP * JUMP - 2 * SLIME_G * lift))) / SLIME_G;
      const jumpTick = lift < 10 ? Infinity : tick - Math.round(ascent / DT);
      if (jumpTick < 0) continue;
      let x = me.x, y = me.y, vy = me.vy;
      for (let k = 0; k < flight.length; k++) {
        const dx = target - x;
        const vx = Math.abs(dx) > 3 ? Math.sign(dx) * MOVE * c.speed : 0;
        x = Math.max(NET_X + NET_HW + SLIME_R, Math.min(W - SLIME_R, x + vx * DT));
        if (k === jumpTick && y === GROUND) vy = -JUMP;
        if (y < GROUND || vy < 0) {
          vy += SLIME_G * DT;
          y = Math.min(GROUND, y + vy * DT);
          if (y === GROUND) vy = 0;
        }
        const q = flight[k], nx = q.x - x, ny = q.y - y;
        if (ny >= 8 || nx * nx + ny * ny >= RR * RR) continue;
        const d = Math.hypot(nx, ny);
        if (!d) break;
        const shot = { ...q, x: x + nx / d * RR, y: y + ny / d * RR };
        if (!bounce(shot, { vx, vy }, nx / d, ny / d, fire)) break;
        const land = predict(shot, GROUND - BALL_R);
        const safe = land.x < NET_X - NET_HW - BALL_R;
        const separation = Math.abs(land.x - opponentX);
        const score = safe ? separation - MOVE * land.t * 0.62 - k * 0.2 : -1600 - land.x;
        if (score > bestScore) { bestScore = score; best = { target, jumpTick }; }
        break;
      }
    }
  }
  return best;
}

const AI = {
  // slow, late, sloppy. never leaves the ground.
  sludge: { speed: 0.68, react: 20, err: 14, home: 700, pick: () => ({ off: 26, jump: false }) },
  // camps deep and pops everything back high. no mistakes, no ambition.
  brick: { speed: 0.86, react: 8, err: 9, home: 800, pick: () => ({ off: 22, jump: false }) },
  // crowds the net and jumps at anything in reach.
  pyro: { speed: 0.96, react: 7, err: 10, home: 590, dive: true, pick: c => ({ off: 32, jump: c.p.x < 770 }) },
  // Jinx samples a few contact angles. Inferno can also glance a ball off the back wall.
  jinx: { speed: 0.95, react: 12, home: 670, sample: 8, offsets: [10, 24, 41], bluff: 105, err: 9 },
  inferno: { speed: 1, react: 2, home: 690, sample: 4, offsets: [-38, -20, 2, 13, 24, 35, 46, 53], bluff: 0, err: 1 },
};

export function makeBrain(kind) {
  return { kind, cfg: AI[kind], seq: -1, tick: 0, err: 0, target: AI[kind].home, shot: null, mine: false };
}

export function think(st, side, br) {
  const c = br.cfg, m = side === 1, me = st.slimes[side], op = st.slimes[1 - side];
  const fx = x => (m ? x : W - x);
  const mx = fx(me.x), ox = fx(op.x), sb = st.ball;
  const b = { x: fx(sb.x), y: sb.y, vx: m ? sb.vx : -sb.vx, vy: sb.vy };
  const out = { l: false, r: false, u: false, d: false };
  if (c.sample) {
    const active = st.phase === 'play';
    if (!active || br.seq !== st.seq) {
      br.seq = st.seq;
      br.tick = c.react;
      br.shot = null;
      br.target = st.phase === 'serve' && st.server === side ? fx(HOME[side]) + 22 : c.home;
    }
    if (active && --br.tick === 0) {
      const feint = (Math.random() * 2 - 1) * c.bluff;
      br.shot = planReturn(b, { ...me, x: mx }, ox + feint, c, st.streak[side] >= 3);
      if (br.shot) {
        const spread = st.rally > 0 ? c.err : 0;
        br.target = br.shot.target + (Math.random() * 2 - 1) * spread;
      }
    }
    const dx = br.target - mx;
    out.l = m ? dx < -3 : dx > 3;
    out.r = m ? dx > 3 : dx < -3;
    if (br.shot) out.u = br.shot.jumpTick-- === 0;
    if (st.phase === 'over' && st.winner === side && me.y >= GROUND) out.u = Math.random() < 0.05;
    return out;
  }
  if (st.seq !== br.seq) {
    br.seq = st.seq; br.err = (Math.random() * 2 - 1) * c.err; br.shot = null; br.tick = c.react;
  }
  if (st.phase !== 'play' && st.phase !== 'serve') { br.mine = false; br.target = c.home; }
  else if (br.kind === 'sludge' && st.server === side && st.rally === 0) {
    // A stationary toss needs a rehearsed contact point, even for a rookie.
    br.target = fx(HOME[side]) + 22;
    br.mine = true;
  }
  else if (--br.tick <= 0) {
    br.tick = 12;
    const p = predict(b, Y_GROUND_HIT);
    if (p.x > NET_X + NET_HW) {
      if (!br.shot) br.shot = c.pick({ p, ox, mx, fire: st.streak[side] >= 3 });
      let tx = p.x;
      if (br.shot.jump) { const p2 = predict(b, Y_JUMP_HIT); if (p2.x > NET_X + NET_HW) tx = p2.x; }
      br.target = tx + br.shot.off + br.err; br.mine = true;
    } else { br.mine = false; br.target = c.home; }
  }
  const lo = NET_X + NET_HW + SLIME_R, hi = W - SLIME_R;
  const dx = Math.min(hi, Math.max(lo, br.target)) - mx;
  if (dx > 5) out.r = true; else if (dx < -5) out.l = true;
  if (st.phase === 'play' && br.mine && br.shot && br.shot.jump && me.y >= GROUND) {
    const f = { ...b };
    for (let i = 0; i < 10; i++) ballFree(f, PDT);
    if (Math.abs(f.x - (mx - br.shot.off)) < 20 && f.y > 285 && f.y < 350 && f.vy > -150) out.u = true;
  }
  if (c.dive && me.y < GROUND - 4 && me.vy > 0 && !br.mine) out.d = true;
  if (st.phase === 'over' && st.winner === side && me.y >= GROUND && Math.random() < 0.05) out.u = true;
  if (!m) { const t = out.l; out.l = out.r; out.r = t; }
  return out;
}
