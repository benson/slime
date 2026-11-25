import { createMatch, step, DT } from '../sim.js';

const ROOM_PATH = /^\/rooms\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(join|socket|leave)$/;
const ROOM_LIFE = 2 * 60 * 60 * 1000;
const EMPTY_LIFE = 10 * 60 * 1000;
const IDLE_SOCKET = 12_000;
const FRAME_MS = 1000 / 30;
const neutral = () => ({ l: 0, r: 0, u: false, d: false });

function json(data, status = 200, origin) {
  const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return Response.json(data, { status, headers });
}

function localHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
    /^192\.168\./.test(host) || /^10\.\d+\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function permitted(origin, url) {
  if (!origin || origin === 'https://bensonperry.com' || origin === 'https://www.bensonperry.com') return true;
  try { return localHost(url.hostname) && localHost(new URL(origin).hostname); }
  catch { return false; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    if (!permitted(origin, url)) return json({ error: 'This origin cannot open a room.' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': origin || 'https://bensonperry.com',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, Authorization',
        'Access-Control-Max-Age': '600', Vary: 'Origin',
      } });
    }
    let room, action, sport;
    if (url.pathname === '/rooms' && request.method === 'POST') {
      sport = url.searchParams.get('sport') || 'volleyball';
      if (sport !== 'volleyball' && sport !== 'soccer') return json({ error: 'Unknown sport.' }, 400, origin);
      room = crypto.randomUUID(); action = 'create';
    } else {
      const parts = ROOM_PATH.exec(url.pathname);
      if (!parts) return json({ error: 'Room unavailable.' }, 404, origin);
      [, room, action] = parts;
      if (action === 'socket' && (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'))
        return json({ error: 'WebSocket required.' }, 426, origin);
      if (action !== 'socket' && request.method !== 'POST') return json({ error: 'POST required.' }, 405, origin);
    }
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    const internal = new URL(request.url);
    internal.pathname = '/' + action;
    internal.search = '';
    internal.searchParams.set('room', room);
    if (sport) internal.searchParams.set('sport', sport);
    return stub.fetch(internal, { method: request.method, headers: request.headers });
  },
};

export class VolleyballRoom {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.room = null;
    this.sockets = [null, null];
    this.ready = [false, false];
    this.rematch = [false, false];
    this.inputs = [neutral(), neutral()];
    this.inputSequence = [0, 0];
    this.appliedInput = [null, null];
    this.pulses = [neutral(), neutral()];
    this.frame = null;
    this.monitor = null;
    this.pending = new Set();
    this.seenAt = [0, 0];
    ctx.blockConcurrencyWhile(async () => { this.room = (await this.storage.get('room')) || null; });
  }

  async fetch(request) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    const room = url.searchParams.get('room');
    if (url.pathname === '/create' && !this.room) {
      const token = crypto.randomUUID(), now = Date.now();
      this.room = { sport: url.searchParams.get('sport') || 'volleyball', tokens: [token, null], joinKey: null, match: null, expires: now + ROOM_LIFE, emptyUntil: now + EMPTY_LIFE };
      await this.persist();
      await this.scheduleExpiry();
      return json({ room, token }, 201, origin);
    }
    if (!this.room || Date.now() >= this.deadline()) {
      if (url.pathname === '/socket') {
        // Browser WebSocket clients cannot inspect a failed HTTP handshake.
        const [client, socket] = Object.values(new WebSocketPair());
        socket.accept(); socket.close(4004, 'This match has expired');
        return new Response(null, { status: 101, webSocket: client });
      }
      return json({ error: 'This match has expired.' }, 404, origin);
    }
    if (url.pathname === '/leave') {
      const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      if (!token || !this.room.tokens.includes(token)) return json({ error: 'Invalid player seat.' }, 403, origin);
      await this.end('left');
      return json({ ended: true }, 200, origin);
    }
    if (url.pathname === '/join') {
      const supplied = request.headers.get('Idempotency-Key');
      const key = supplied && /^[a-zA-Z0-9-]{20,80}$/.test(supplied) ? supplied : null;
      if (this.room.tokens[1]) {
        if (key && key === this.room.joinKey) return json({ room, token: this.room.tokens[1] }, 200, origin);
        return json({ error: 'Both places in this match are taken.' }, 409, origin);
      }
      this.room.tokens[1] = crypto.randomUUID();
      this.room.joinKey = key;
      await this.persist();
      return json({ room, token: this.room.tokens[1] }, 201, origin);
    }
    if (url.pathname !== '/socket') return json({ error: 'Room unavailable.' }, 404, origin);
    if (this.pending.size >= 8) return json({ error: 'Try connecting again shortly.' }, 429, origin);
    const [client, socket] = Object.values(new WebSocketPair());
    socket.accept();
    this.pending.add(socket);
    const authTimer = setTimeout(() => { if (this.pending.delete(socket)) socket.close(4008, 'Authentication timed out'); }, 6000);
    let side = -1;
    let windowStart = Date.now(), messages = 0;
    socket.addEventListener('message', e => {
      if (typeof e.data !== 'string' || e.data.length > 512) { socket.close(1008, 'Invalid message'); return; }
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messages = 0; }
      if (++messages > 180) { socket.close(1008, 'Too many messages'); return; }
      let msg;
      try { msg = JSON.parse(e.data); } catch { socket.close(1008, 'Invalid message'); return; }
      if (!msg || typeof msg !== 'object' || !this.room) return;
      if (side < 0) {
        this.pending.delete(socket);
        clearTimeout(authTimer);
        side = typeof msg.token === 'string' && msg.type === 'auth' ? this.room.tokens.indexOf(msg.token) : -1;
        if (side < 0) {
          this.send(socket, { type: 'error', message: 'Invalid player seat.' });
          socket.close(4003, 'Invalid player seat'); return;
        }
        this.connect(side, socket);
        return;
      }
      if (this.sockets[side] !== socket) return;
      this.seenAt[side] = Date.now();
      this.message(side, msg);
    });
    const closed = () => {
      if (socket.readyState === 2) socket.close(1000);
      clearTimeout(authTimer); this.pending.delete(socket);
      if (side >= 0 && this.sockets[side] === socket) this.disconnect(side);
    };
    socket.addEventListener('close', closed);
    socket.addEventListener('error', closed);
    return new Response(null, { status: 101, webSocket: client });
  }

  persist() { return this.storage.put('room', this.room); }
  deadline() { return Math.min(this.room.expires, this.room.emptyUntil || Infinity); }
  scheduleExpiry() { return this.storage.setAlarm(this.deadline()); }
  async alarm() {
    if (!this.room) return;
    if (Date.now() >= this.deadline()) await this.end('expired');
    else await this.scheduleExpiry();
  }

  connect(side, socket) {
    const old = this.sockets[side];
    this.sockets[side] = socket;
    if (old) old.close(4009, 'Seat opened in another tab');
    this.clearInput(side);
    this.ready[side] = false;
    this.seenAt[side] = Date.now();
    if (this.room.emptyUntil) {
      this.room.emptyUntil = 0;
      this.persist(); this.scheduleExpiry();
    }
    if (!this.monitor) this.monitor = setInterval(() => {
      for (const [i, peer] of this.sockets.entries()) {
        if (peer && Date.now() - this.seenAt[i] > IDLE_SOCKET) {
          peer.close(4000, 'Connection timed out'); this.disconnect(i);
        }
      }
    }, 5000);
    this.send(socket, { type: 'welcome', side, sport: this.room.sport || 'volleyball' });
    this.reconcile();
    if (this.room.match) this.send(socket, this.snapshot());
  }

  disconnect(side) {
    this.sockets[side] = null;
    this.ready[side] = false;
    this.clearInput(side);
    if (!this.room) return;
    if (!this.sockets.some(Boolean)) {
      clearInterval(this.monitor); this.monitor = null;
      this.room.emptyUntil = Date.now() + EMPTY_LIFE;
      this.scheduleExpiry();
    }
    this.persist();
    this.reconcile();
  }

  clearInput(side) {
    this.inputs[side] = neutral();
    this.inputSequence[side] = 0;
    this.appliedInput[side] = null;
    this.pulses[side] = neutral();
  }

  send(socket, data) {
    if (socket?.readyState === 1) socket.send(JSON.stringify(data));
  }
  broadcast(data) {
    const wire = JSON.stringify(data);
    for (const socket of this.sockets) if (socket?.readyState === 1) socket.send(wire);
  }
  snapshot(events = []) { return { type: 'state', state: this.room.match, events, inputAck: this.appliedInput }; }
  phase() {
    if (this.room.match?.phase === 'over') return 'finished';
    if (this.sockets.every(Boolean) && this.ready.every(Boolean)) return 'playing';
    return this.room.match ? 'away' : 'waiting';
  }

  message(side, msg) {
    if (msg.type === 'ping') { this.send(this.sockets[side], { type: 'pong' }); return; }
    if (msg.type === 'leave') { this.end('left'); return; }
    if (msg.type === 'ready' && !this.ready[side]) {
      this.ready[side] = true; this.reconcile(); return;
    }
    if (msg.type === 'rematch' && this.phase() === 'finished') {
      this.rematch[side] = true;
      this.reconcile(); return;
    }
    if (msg.type !== 'input' || !this.frame) return;
    const amount = value => value === true ? 1 : Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const next = { l: amount(msg.l), r: amount(msg.r), u: msg.u === true, d: msg.d === true };
    for (const key of ['u','d']) if (next[key] && !this.inputs[side][key]) this.pulses[side][key] = true;
    this.inputs[side] = next;
    if (Number.isSafeInteger(msg.seq) && msg.seq > 0) this.inputSequence[side] = msg.seq;
  }

  reconcile() {
    if (this.rematch.every(Boolean) && this.sockets.every(Boolean)) {
      this.room.match = null;
      this.ready = [true, true];
      this.rematch = [false, false];
    }
    const phase = this.phase();
    this.broadcast({ type: 'status', phase, connected: this.sockets.map(Boolean), ready: this.ready, rematch: this.rematch });
    if (phase !== 'playing') {
      clearInterval(this.frame); this.frame = null;
      this.clearInput(0); this.clearInput(1);
      return;
    }
    if (this.frame) return;
    if (!this.room.match) { this.room.match = createMatch({ sport: this.room.sport || 'volleyball' }); this.persist(); }
    this.lastTick = Date.now();
    this.remainder = 0;
    this.checkpoint = this.lastTick;
    this.broadcast(this.snapshot());
    this.frame = setInterval(() => this.tick(), FRAME_MS);
  }

  tick() {
    const now = Date.now();
    this.remainder += Math.min(0.15, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const match = this.room.match;
    while (this.remainder >= DT && match.phase !== 'over') {
      const inputs = this.inputs.map((input,i) => {
        const seq = this.inputSequence[i];
        if (seq && seq !== this.appliedInput[i]?.seq) this.appliedInput[i] = { seq, at: match.time };
        const pulse = this.pulses[i];
        const result = { ...input, u: input.u || pulse.u, d: input.d || pulse.d };
        pulse.u = pulse.d = false;
        return result;
      });
      step(match, inputs);
      this.remainder -= DT;
    }
    const events = match.events.splice(0);
    this.broadcast(this.snapshot(events));
    if (now - this.checkpoint >= 10000 || events.some(e => e.type === 'point' || e.type === 'over')) {
      this.checkpoint = now; this.persist();
    }
    if (match.phase === 'over') this.reconcile();
  }

  async end(reason) {
    this.room = null;
    clearInterval(this.frame); clearInterval(this.monitor);
    this.frame = this.monitor = null;
    this.broadcast({ type: 'ended', reason });
    for (const socket of [...this.sockets, ...this.pending]) {
      if (socket?.readyState === 1) socket.close(1000, reason);
    }
    this.sockets = [null, null];
    this.pending.clear();
    await this.storage.deleteAlarm();
    await this.storage.deleteAll();
  }
}
