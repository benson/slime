// Decode just the court geometry from the compact authoritative clip.
import {DT, REPLAY_RATE, REPLAY_LEAD, replayDuration} from './sim.js?v=6';

export function replayPose(frames, remaining) {
  const elapsed = replayDuration(frames) - remaining - REPLAY_LEAD;
  if (elapsed < 0) return null;
  const tick = frames[0][0] + elapsed * REPLAY_RATE / DT;
  const last = frames.at(-1);
  let i = frames.length - 2;
  while (i > 0 && frames[i][0] > tick) i--;
  const a = frames[i], b = frames[i + 1];
  const t = Math.min(1, (tick - a[0]) / (b[0] - a[0]));
  const between = k => a[k] + (b[k] - a[k]) * t;
  const slime = k => ({x: between(k), y: between(k+1), vy: (b[k+1]-a[k+1]) / ((b[0]-a[0])*DT)});
  const impactAge = Math.max(0, (tick - last[0]) * DT / REPLAY_RATE);
  return {phase: tick < last[0] ? 'play' : 'point', ball: {x: between(1), y: between(2), fire: !!(t < 1 ? a[3] : b[3])},
    slimes: [slime(4), slime(6)], impactAge, spin: between(1) * 0.03};
}
