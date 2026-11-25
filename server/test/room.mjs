// Start local Wrangler on port 8787, then run: node server/test/room.mjs [soccer] (Node 22+).
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base = 'http://127.0.0.1:8787/rooms';
const sport = process.argv[2] || 'volleyball';
const hostResponse = await fetch(process.argv[2] ? base+'?sport='+sport : base, { method: 'POST' });
assert.equal(hostResponse.status, 201);
const host = await hostResponse.json();
const url = base + '/' + host.room;
const sockets = [];

async function connect(token) {
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/socket');
  sockets.push(socket);
  const messages = [];
  socket.onmessage = event => messages.push(JSON.parse(event.data));
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Could not open local room socket'));
  });
  const send = (type, fields = {}) => socket.send(JSON.stringify({ type, ...fields }));
  send('auth', { token });
  async function wait(description, predicate) {
    const end = Date.now() + 3500;
    while (Date.now() < end) {
      const found = messages.find(predicate);
      if (found) return found;
      await delay(10);
    }
    throw new Error('Timed out waiting for ' + description);
  }
  return { socket, send, wait };
}

try {
  const claim = { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } };
  const joined = await fetch(url + '/join', claim);
  assert.equal(joined.status, 201);
  const guest = await joined.json();
  assert.deepEqual(await (await fetch(url + '/join', claim)).json(), guest);
  assert.equal((await fetch(url + '/join', { method: 'POST' })).status, 409);

  const a = await connect(host.token), b = await connect(guest.token);
  assert.equal((await a.wait('host seat', m => m.type === 'welcome')).side, 0);
  const welcome = await b.wait('guest seat', m => m.type === 'welcome');
  assert.equal(welcome.side, 1);
  assert.equal(welcome.sport, sport);
  a.send('ready');
  await a.wait('waiting for guest', m => m.phase === 'waiting' && m.ready[0] && !m.ready[1]);
  b.send('ready');
  await b.wait('playing', m => m.phase === 'playing');
  a.send('input', { l: 0.25 }); // Older clients omit prediction sequence numbers.
  b.send('input', { r: 0.5, u: true, seq: 12 });
  const moving = await a.wait('guest half-speed jump on host', m =>
    m.type === 'state' && m.state.slimes[1].vx === 170 && m.state.slimes[1].y < 460);

  assert.equal(moving.state.sport || 'volleyball', sport);
  assert.equal(moving.inputAck[1].seq,12);
  assert.ok(moving.inputAck[1].at < moving.state.time);
  await b.wait('legacy input applied', m => m.type === 'state' && m.state.slimes[0].vx === -85);

  b.socket.close(1000);
  await a.wait('paused room', m => m.phase === 'away' && !m.connected[1]);
  const resumed = await connect(guest.token);
  assert.equal((await resumed.wait('same guest seat', m => m.type === 'welcome')).side, 1);
  resumed.send('ready');
  await resumed.wait('resumed play', m => m.phase === 'playing');
  await resumed.wait('input cleared and time advanced', m => m.type === 'state' &&
    m.state.time > moving.state.time && m.state.slimes[1].vx === 0);

  a.send('leave');
  await resumed.wait('opponent departure', m => m.type === 'ended' && m.reason === 'left');
  assert.equal((await fetch(url + '/join', claim)).status, 404);
  console.log('Local two-player '+sport+' room smoke test passed.');
} finally {
  for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
  await fetch(url + '/leave', { method: 'POST', headers: { Authorization: 'Bearer ' + host.token } });
}
