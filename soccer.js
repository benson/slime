import {W, GROUND, GOAL_TOP, SLIME_R, BALL_R, DT} from './court.js';

const MID = W / 2, FLOOR = GROUND - BALL_R, GRAVITY = 840;
const CONTACT = SLIME_R + BALL_R;

export function kickoff(st) {
  Object.assign(st.ball, {x: MID, y: FLOOR, vx: 0, vy: 0, fire: false});
  st.slimes.forEach((slime, side) => {
    const direction = side === 0 ? 1 : -1;
    const distance = side === st.server ? 104 : 218;
    Object.assign(slime, {x: MID - direction * distance, y: GROUND, vx: 0, vy: 0, dive: false});
  });
}

function kick(st, side) {
  const ball = st.ball, slime = st.slimes[side];
  const dx = ball.x - slime.x, dy = ball.y - slime.y;
  if (dy > 6) return;
  const distance = Math.hypot(dx, dy);
  if (distance >= CONTACT) return;
  const nx = distance ? dx / distance : (side ? -1 : 1);
  const ny = distance ? dy / distance : 0;
  const incoming = (ball.vx - slime.vx) * nx + (ball.vy - slime.vy) * ny;
  ball.x = slime.x + nx * CONTACT;
  ball.y = Math.min(FLOOR, slime.y + ny * CONTACT);
  if (incoming >= 0) return;
  const fire = st.streak[side] >= 3;
  const impulse = Math.max(240, -incoming * 1.5) * (fire ? 1.15 : 1);
  ball.vx = Math.max(-900, Math.min(900, ball.vx + nx * impulse + slime.vx * 0.28));
  ball.vy = Math.max(-690, Math.min(630, ball.vy + ny * impulse + slime.vy * 0.32));
  // A stationary, perfectly centered header still goes somewhere.
  if (Math.abs(ball.vx) < 32 && Math.abs(nx) < 0.12) ball.vx = side ? -70 : 70;
  ball.fire = fire;
  if (st.lastHitter >= 0 && st.lastHitter !== side) st.exchanges++;
  st.lastHitter = side; st.lastKick = slime.x;
  st.rally++; st.seq++;
  st.events.push({type: 'hit', side, x: slime.x + nx * SLIME_R, y: slime.y + ny * SLIME_R,
    speed: Math.hypot(ball.vx, ball.vy), fire});
}

export function playSoccer(st) {
  const b = st.ball;
  b.vy += GRAVITY * DT;
  b.x += b.vx * DT; b.y += b.vy * DT;
  if (b.y >= FLOOR) {
    b.y = FLOOR;
    b.vy = b.vy < 65 ? 0 : -b.vy * 0.52;
    if (!b.vy) b.vx = Math.sign(b.vx) * Math.max(0, Math.abs(b.vx) - 105 * DT);
  }
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.65; }
  // The whole ball must clear the crossbar to enter the goal mouth.
  if (b.y - BALL_R < GOAL_TOP && (b.x < BALL_R || b.x > W - BALL_R)) {
    const left = b.x < BALL_R;
    b.x = left ? BALL_R : W - BALL_R;
    b.vx = (left ? 1 : -1) * Math.abs(b.vx) * 0.8;
    st.events.push({type: 'wall', x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy)});
  }
  if (b.x <= 0 || b.x >= W) return b.x >= W ? 0 : 1;
  for (let side = 0; side < 2; side++) kick(st, side);
  if (b.y - BALL_R >= GOAL_TOP && (b.x <= 0 || b.x >= W)) return b.x >= W ? 0 : 1;
  return -1;
}

const styles = {
  sludge: {react: 22, lead: 0.03, defend: false},
  brick: {react: 12, lead: 0.1, defend: true},
  pyro: {react: 23, horizon: 61},
  jinx: {react: 17, horizon: 81},
  inferno: {react: 10, horizon: 115},
};

// The attacking opponents try legal moves against the current ball and the opponent's momentum.
function planMove(st, side, horizon, moveSlime) {
  const direction = side ? -1 : 1, me = st.slimes[side], other = st.slimes[1-side];
  const theirInput = {l: other.vx < -10, r: other.vx > 10};
  let best = -Infinity, chosen = {};
  for (const axis of [direction, 0, -direction]) {
    for (const jump of me.y === GROUND ? [false, true] : [false]) {
      const input = {l: axis < 0, r: axis > 0, u: jump, d: false};
      const trial = {...st, ball: {...st.ball}, slimes: st.slimes.map(s => ({...s})), events: []};
      let value = 0;
      for (let k = 0; k < horizon; k++) {
        moveSlime(trial.slimes[side], side, input, null, 'soccer');
        moveSlime(trial.slimes[1-side], 1-side, theirInput, null, 'soccer');
        const goal = playSoccer(trial);
        trial.events.length = 0;
        if (goal >= 0) { value = (goal === side ? 1 : -1) * (4000 - k); break; }
        input.u = false;
      }
      const ball = trial.ball, bot = trial.slimes[side], enemy = trial.slimes[1-side];
      const forward = direction * (ball.x - st.ball.x);
      const ballLead = direction * (ball.x - bot.x);
      const goalDistance = side ? ball.x : W - ball.x;
      value += forward + direction * ball.vx * Math.min(0.24, goalDistance / 900);
      value -= Math.abs(ballLead - 42) * 0.52 + Math.max(0, -ballLead) * 0.45;
      if (direction * (ball.x - enemy.x) > 20) value += 78;
      if (jump) value -= 6;
      if (value > best) { best = value; chosen = {l:axis < 0, r:axis > 0, u:jump, d:false}; }
    }
  }
  return chosen;
}

export function soccerThink(st, side, brain, moveSlime) {
  const out = {l:0, r:0, u:false, d:false};
  if (st.phase !== 'play') { brain.soccerTicks = 0; return out; }
  const style = styles[brain.kind];
  if (style.horizon) {
    if (!brain.soccerTicks || --brain.soccerTicks <= 0 || brain.seq !== st.seq) {
      brain.seq = st.seq;
      brain.soccerTicks = style.react;
      brain.soccerMove = planMove(st, side, style.horizon, moveSlime);
    }
    return brain.soccerMove;
  }
  const direction = side ? -1 : 1;
  const ball = st.ball, me = st.slimes[side];
  const x = side ? W - ball.x : ball.x, myX = side ? W - me.x : me.x;
  const vx = direction * ball.vx, behind = myX <= x + 2;
  if (!brain.soccerTicks || --brain.soccerTicks <= 0) {
    brain.soccerTicks = style.react;
    const ahead = Math.min(W - SLIME_R, Math.max(SLIME_R, x + vx * style.lead));
    // Run through a kick from the attacking side. When caught upfield, get goal-side first.
    let target = behind ? ahead + 32 : ahead - CONTACT - 16;
    if (style.defend && vx < -190 && x - myX > 200 && x > MID) target = Math.max(70, myX - 65);
    brain.soccerTarget = target;
  }
  const delta = direction * (brain.soccerTarget - myX);
  out.l = delta < -3 ? 1 : 0; out.r = delta > 3 ? 1 : 0;
  return out;
}
