const liveEndpoint = 'https://slime-volleyball-live.bensonperry.workers.dev';
const isPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
const defaultEndpoint = isPreview ? location.protocol + '//' + location.hostname + ':8787' : liveEndpoint;
const roomPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const neutral = { l: 0, r: 0, u: false, d: false };
const seatKey = id => 'slime:friend:' + id;

function newClaim() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // randomUUID is HTTPS-only; getRandomValues also works on a LAN preview.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
}

function readSeat(id) {
  try { return JSON.parse(localStorage.getItem(seatKey(id))); } catch { return null; }
}

function saveSeat(id, record) {
  try {
    if (record) localStorage.setItem(seatKey(id), JSON.stringify(record));
    else localStorage.removeItem(seatKey(id));
  } catch { /* A room still works in memory when browser storage is unavailable. */ }
}

export function roomFromLink() {
  const id = new URLSearchParams(location.hash.slice(1)).get('room');
  return roomPattern.test(id || '') ? id.toLowerCase() : null;
}

export function hasRoomSeat(id) {
  return !!readSeat(id)?.token;
}

export class FriendRoom {
  constructor({ onStatus, onSnapshot, endpoint = defaultEndpoint }) {
    this.endpoint = endpoint;
    this.onStatus = onStatus;
    this.onSnapshot = onSnapshot;
    this.status = 'connecting';
    this.detail = '';
    this.id = null;
    this.side = null;
    this.players = { connected: [false, false], ready: [false, false], rematch: [false, false] };
    this.wantsReady = false;
    this.wantsRematch = false;
    this.closed = false;
    this.attempt = 0;
    this.abort = new AbortController();
    this.visibility = () => document.hidden ? this.suspend() : this.resume();
    this.pageHide = () => this.suspend();
    this.pageShow = () => this.resume();
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.pageHide);
    window.addEventListener('pageshow', this.pageShow);
    window.addEventListener('online', this.pageShow);
  }

  get inviteURL() {
    if (!this.id) return '';
    const url = new URL(location.href);
    url.search = '';
    url.hash = 'room=' + this.id;
    return url.href;
  }

  get canShare() {
    return !!this.id && this.side === 0 && !this.closed;
  }

  setStatus(status, detail, force = false) {
    if (!force && this.status === status && this.detail === detail) return;
    this.status = status;
    this.detail = detail;
    this.onStatus(status, detail);
  }

  async request(path, idempotencyKey) {
    const response = await fetch(this.endpoint + path, {
      method: 'POST', signal: this.abort.signal,
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    });
    if (response.status === 409) throw new Error('Both spots in this match are taken.');
    if (response.status === 404 || response.status === 410) throw new Error('This invite has expired.');
    if (!response.ok) throw new Error('Couldn’t open the match. Try again.');
    return response.json();
  }

  async create() {
    await this.open(null);
  }

  async join(id) {
    if (!roomPattern.test(id || '')) {
      this.finish('error', 'This invite is invalid.');
      return;
    }
    await this.open(id.toLowerCase());
  }

  async open(id) {
    this.setStatus('connecting', 'Connecting…');
    try {
      let seat = id ? readSeat(id) : null;
      if (!seat?.token) {
        // The same claim can be retried if the guest loses their connection during join.
        if (id && !seat?.claim) {
          seat = { claim: newClaim() };
          saveSeat(id, seat);
        }
        const result = await this.request(id ? '/rooms/'+id+'/join' : '/rooms', seat?.claim);
        if (this.closed) return;
        this.id = result.room;
        this.side = id ? 1 : 0;
        seat = { token: result.token, side: this.side, ready: this.wantsReady };
        saveSeat(this.id, seat);
      } else {
        this.id = id;
        this.side = seat.side;
        this.wantsReady = !!seat.ready;
      }
      this.token = seat.token;
      history.replaceState(history.state, '', this.inviteURL);
      this.resume();
    } catch (error) {
      if (!this.closed) this.finish('error', error instanceof TypeError ? 'Couldn’t connect. Check your connection and try again.' : error.message);
    }
  }

  resume() {
    if (this.closed || !this.token || document.hidden || this.socket) return;
    clearTimeout(this.retry);
    const url = new URL('/rooms/'+this.id+'/socket', this.endpoint);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    this.socket = ws;
    this.authenticated = false;
    this.lastInput = null;
    this.lastReceived = performance.now();
    this.heartbeat = setInterval(() => {
      if (performance.now() - this.lastReceived > 18000) {
        this.retryConnection();
      } else if (this.authenticated) {
        this.send({ type: 'ping' });
      }
    }, 5000);
    ws.onopen = () => this.send({ type: 'auth', token: this.token });
    ws.onmessage = event => {
      if (this.socket !== ws) return;
      this.lastReceived = performance.now();
      const msg = JSON.parse(event.data);
      if (msg.type === 'welcome') {
        this.authenticated = true;
        this.side = msg.side;
        this.attempt = 0;
        if (this.wantsReady) this.send({ type: 'ready' });
      } else if (msg.type === 'status') {
        this.receiveStatus(msg);
      } else if (msg.type === 'state') {
        this.receiveState(msg);
      } else if (msg.type === 'ended') {
        saveSeat(this.id, null);
        this.finish('closed', msg.reason === 'expired' ? 'This invite has expired.' : 'Your friend left the match.');
      } else if (msg.type === 'error') {
        if (!this.authenticated && readSeat(this.id)?.token === this.token) saveSeat(this.id, null);
        this.finish('error', msg.message || 'Couldn’t connect to this match.');
      }
    };
    ws.onclose = event => {
      if (this.socket !== ws) return;
      if ([4003,4004,4009].includes(event.code)) {
        if (event.code !== 4009) saveSeat(this.id, null);
        this.finish('closed', event.code === 4009 ? 'This seat is open in another tab.' : 'This invite is no longer available.');
      } else {
        this.retryConnection();
      }
    };
  }

  receiveStatus(msg) {
    const players = { connected: msg.connected, ready: msg.ready, rematch: msg.rematch };
    const changed = JSON.stringify(players) !== JSON.stringify(this.players);
    this.players = players;
    if (msg.phase === 'playing') {
      this.wantsRematch = false;
      this.setStatus('playing', '', changed);
    } else if (msg.phase === 'away') {
      this.setStatus('away', 'Waiting for your friend to reconnect…', changed);
    } else if (msg.phase === 'finished') {
      if (this.wantsRematch && !msg.rematch[this.side]) this.send({ type: 'rematch' });
      this.setStatus('finished', this.players.rematch?.[1-this.side] ? 'Your friend wants a rematch.' : '', changed);
    } else {
      const detail = !msg.connected[1-this.side] ? 'Waiting for your friend…' : 'Waiting for both players to be ready…';
      this.setStatus('waiting', detail, changed);
    }
  }

  receiveState({ state, events }) {
    const previous = this.state;
    this.previous = previous && state.time > previous.time && state.time - previous.time < 0.2 ? previous : null;
    this.state = state;
    this.receivedAt = performance.now();
    this.onSnapshot(state, events || []);
  }

  sample() {
    const state = this.state, prev = this.previous;
    if (!state || !prev || this.status !== 'playing' || state.phase !== prev.phase) return state || null;
    // Interpolate within one server tick; never advance a ball beyond an unconfirmed hit.
    const interval = (state.time - prev.time) * 1000;
    const t = Math.min(1, (performance.now() - this.receivedAt) / interval);
    const blend = (a,b) => ({ ...b, x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t });
    return { ...state, ball: blend(prev.ball,state.ball), slimes: state.slimes.map((s,i)=>blend(prev.slimes[i],s)) };
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  ready() {
    if (this.closed) return;
    this.wantsReady = true;
    if (this.id && this.token) saveSeat(this.id, { token: this.token, side: this.side, ready: true });
    if (this.authenticated) this.send({ type: 'ready' });
  }

  rematch() {
    if (this.status !== 'finished' || !this.authenticated) return;
    this.wantsRematch = true;
    this.send({ type: 'rematch' });
  }

  input({ l, r, u, d }) {
    if (!this.authenticated || this.status !== 'playing') return;
    const axis = value => Math.round(Math.max(0, Math.min(1, Number(value) || 0))*100)/100;
    const next = { l:axis(l), r:axis(r), u:!!u, d:!!d };
    const last = this.lastInput;
    const now = performance.now();
    if (last && next.u === last.u && next.d === last.d) {
      const unchanged = next.l === last.l && next.r === last.r;
      if (unchanged && now-this.lastSent < 500) return;
      if (!unchanged && (next.l || next.r) && now-this.lastSent < 30) return;
    }
    this.send({ type:'input', ...next });
    this.lastSent = now;
    this.lastInput = next;
  }

  disconnect() {
    clearInterval(this.heartbeat);
    clearTimeout(this.retry);
    const ws = this.socket;
    this.socket = null;
    this.authenticated = false;
    this.previous = null;
    if (ws) {
      ws.onmessage = ws.onclose = ws.onopen = null;
      ws.close();
    }
  }

  retryConnection() {
    this.disconnect();
    if (this.closed) return;
    this.setStatus('reconnecting', 'Reconnecting…');
    if (!document.hidden) this.retry = setTimeout(() => this.resume(), Math.min(4000, 300 * 2 ** this.attempt++));
  }

  suspend() {
    if (this.closed || !this.token) return;
    if (this.authenticated) this.send({ type: 'input', ...neutral });
    this.disconnect();
    this.setStatus('reconnecting', 'Reconnecting…');
  }

  leave() {
    if (this.closed) return;
    if (this.authenticated && this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave' });
      saveSeat(this.id, null);
    } else if (this.token) {
      // A share sheet or network handoff can close the socket while Leave is on screen.
      // Preserve the credential if offline so the user can still reclaim that seat.
      const id = this.id, token = this.token;
      fetch(this.endpoint + '/rooms/'+id+'/leave', {
        method: 'POST', headers: { Authorization: 'Bearer '+token }, keepalive: true,
      }).then(response => {
        if ((response.ok || response.status === 404) && readSeat(id)?.token === token) saveSeat(id, null);
      }).catch(() => {});
    }
    this.finish('closed', 'You left the match.');
  }

  finish(status, detail) {
    this.closed = true;
    this.abort.abort();
    this.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.pageHide);
    window.removeEventListener('pageshow', this.pageShow);
    window.removeEventListener('online', this.pageShow);
    this.setStatus(status,detail);
  }
}
