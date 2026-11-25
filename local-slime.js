import { DT, GROUND, NET_HW, NET_X, SLIME_R, W, moveSlime } from './sim.js?v=6';

const tickMs = DT * 1000;
const still = { l: 0, r: 0, u: false, d: false };

// A snapshot reports the last input the server actually simulated and the game
// time it started applying it. Its matching local timestamp gives us a clock
// for replaying movement without trusting either device's wall clock.
export class LocalSlime {
  constructor() { this.reset(); }

  reset() {
    this.base = null;
    this.history = [];
    this.baseInput = still;
    this.biasX = this.biasY = 0;
  }

  input(seq, input, now) {
    this.history.push({ seq, input, at: now });
    if (this.history.length > 128) this.history.shift();
  }

  reconcile(state, side, ack, now) {
    const last = this.sample(now);
    const index = ack ? this.history.findIndex(item => item.seq === ack.seq) : -1;
    this.side = side;
    this.sport = state.sport || 'volleyball';
    this.base = state.slimes[side];
    this.receivedAt = now;
    this.ackSeq = ack?.seq || 0;
    if (index >= 0) {
      this.history.splice(0, index);
      const acknowledged = this.history[0];
      this.baseInput = acknowledged.input;
      this.baseAt = acknowledged.at + (state.time - ack.at) * 1000;
    } else {
      // At startup the first held control may already be in flight.
      this.baseInput = still;
      this.baseAt = this.history.find(item => item.seq > this.ackSeq)?.at ?? now;
    }
    this.baseAt = Math.max(now - 600, Math.min(now, this.baseAt));
    this.biasX = this.biasY = 0;
    if (last) {
      const next = this.sample(now);
      const dx = last.x - next.x, dy = last.y - next.y;
      // Ease small corrections. Large divergences need the authoritative pose immediately.
      if (Math.hypot(dx, dy) < SLIME_R) { this.biasX = dx; this.biasY = dy; }
    }
  }

  sample(now) {
    if (!this.base) return null;
    const slime = { ...this.base };
    const until = Math.min(now, this.receivedAt + 200);
    const ticks = Math.floor((until - this.baseAt) / tickMs + 1e-8);
    let held = this.baseInput, i = 0;
    while (i < this.history.length && this.history[i].seq <= this.ackSeq) i++;
    for (let n = 1; n <= ticks; n++) {
      const end = this.baseAt + n * tickMs;
      let jump = false, dive = false;
      while (i < this.history.length && this.history[i].at < end) {
        const next = this.history[i++].input;
        jump ||= next.u && !held.u;
        dive ||= next.d && !held.d;
        held = next;
      }
      moveSlime(slime, this.side, jump || dive ? { ...held, u: held.u || jump, d: held.d || dive } : held, undefined, this.sport);
    }
    const weight = Math.exp(-Math.max(0, now-this.receivedAt) / 32);
    const lo = this.sport !== 'soccer' && this.side ? NET_X + NET_HW + SLIME_R : SLIME_R;
    const hi = this.sport === 'soccer' || this.side ? W - SLIME_R : NET_X - NET_HW - SLIME_R;
    slime.x = Math.max(lo, Math.min(hi, slime.x + this.biasX * weight));
    slime.y = Math.min(GROUND, slime.y + this.biasY * weight);
    return slime;
  }
}
