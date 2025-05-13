import http   from 'http';
import crypto from 'crypto';

const PORT = 8080;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const clients = new Map();          // socket -> { id, nick }
let nextId = 1;

let phase = 'waiting';             // waiting | fill | ready | playing
let fillRemaining  = 0;
let readyRemaining = 0;
let fillInterval   = null;
let readyInterval  = null;

function encodeFrame(str) {
  const msg = Buffer.from(str);
  const len = msg.length;
  if (len < 126)  return Buffer.concat([Buffer.from([0x81, len]), msg]);
  if (len < 65536)
    return Buffer.concat([
      Buffer.from([0x81, 126, len >> 8, len & 255]), msg
    ]);
  throw new Error('Frame too large');
}
function broadcast(type, payload) {
  const frame = encodeFrame(JSON.stringify({ type, payload }));
  for (const sock of clients.keys()) sock.write(frame);
}
function updateLobby() {
  broadcast('lobbyUpdate', [...clients.values()]);
}
function sendPhase() {
  broadcast('lobbyState', { phase, fillRemaining, readyRemaining });
}

/* timer logic ------------- */
function startFillTimer() {
  phase = 'fill'; fillRemaining = 20; sendPhase();
  fillInterval = setInterval(() => {
    fillRemaining--;
    if (fillRemaining <= 0 || clients.size >= 4) {
      clearInterval(fillInterval); fillInterval = null;
      startReadyTimer();
    }
    sendPhase();
  }, 1000);
}

function startReadyTimer() {
  phase = 'ready'; readyRemaining = 10; sendPhase();
  readyInterval = setInterval(() => {
    readyRemaining--;
    if (readyRemaining <= 0) {
      clearInterval(readyInterval); readyInterval = null;
      beginGame();
      return;
    }
    /* if players drop below 2, abort */
    if (clients.size < 2) {
      clearInterval(readyInterval); readyInterval = null;
      phase = 'waiting'; sendPhase();
      return;
    }
    sendPhase();
  }, 1000);
}

function beginGame() {
  phase = 'playing'; sendPhase();
  broadcast('gameStart', null);
}

/* clean up if players leave  */
function abortTimers() {
  if (fillInterval)  { clearInterval(fillInterval);  fillInterval  = null; }
  if (readyInterval) { clearInterval(readyInterval); readyInterval = null; }
  phase = 'waiting'; fillRemaining = readyRemaining = 0; sendPhase();
}

/* websocket frame parsing  */
function decodeText(frameBuf) {
  const op = frameBuf[0] & 0x0f;
  if (op !== 0x1) return null; // not text
  let len = frameBuf[1] & 0x7f;
  let off = 2;
  if (len === 126) { len = (frameBuf[2] << 8) + frameBuf[3]; off = 4; }
  off += 4;                       // skip mask
  const mask = frameBuf.slice(off - 4, off);
  const data = frameBuf.slice(off, off + len);
  for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
  return data.toString();
}

/* create server  */
const server = http.createServer();

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  const id = nextId++;
  clients.set(socket, { id, nick: null });
  updateLobby(); sendPhase();

  socket.on('data', buf => {
    /* iterate through possibly multiple frames in the TCP chunk */
    let pos = 0;
    while (pos < buf.length) {
      const lenByte = buf[pos + 1] & 0x7f;
      let hdr = 2, len = lenByte;
      if (lenByte === 126) { len = (buf[pos + 2] << 8) + buf[pos + 3]; hdr = 4; }
      hdr += 4; // mask
      const frame = buf.slice(pos, pos + hdr + len);
      pos += hdr + len;

      const opcode = frame[0] & 0x0f;
      if (opcode === 0x8) { socket.end(); return; }     // close
      if (opcode === 0x9) { socket.write(Buffer.from([0x8a, 0x00])); continue; } // ping/pong
      if (opcode !== 0x1) continue;                     // ignore non-text

      const txt = decodeText(frame);
      if (!txt) continue;
      let msg; try { msg = JSON.parse(txt); } catch { continue; }

      /* --- handle messages  */
      if (msg.type === 'join') {
        clients.get(socket).nick = String(msg.nick).slice(0, 20);
        updateLobby();

        /* start fill timer if needed */
        if (clients.size >= 2 && phase === 'waiting') startFillTimer();
      }
      if (msg.type === 'chat') {
        broadcast('chat', { id, nick: clients.get(socket).nick, text: msg.text });
      }
    }
  });

  socket.on('close', () => {
    clients.delete(socket); updateLobby();
    if (clients.size < 2) abortTimers();
  });

  socket.on('error', () => socket.destroy());
});

server.listen(PORT, () =>
  console.log(`🟢 WebSocket lobby running at ws://localhost:${PORT}`)
);