import http   from 'http';
import crypto from 'crypto';

const PORT = 8080;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Map();                
let nextId = 1;

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

function decodeTextFrame(buf) {           
  const op = buf[0] & 0x0f;
  if (op !== 0x1) return null;            
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    len = (buf[2] << 8) + buf[3];
    off = 4;
  }
  const mask = buf.slice(off, off + 4);   off += 4;
  const data = buf.slice(off, off + len);
  for (let i = 0; i < data.length; i++)
    data[i] ^= mask[i % 4];
  return data.toString();
}

function broadcast(type, payload) {
  const frame = encodeFrame(JSON.stringify({ type, payload }));
  for (const sock of clients.keys())
    sock.write(frame);
}

const server = http.createServer();
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto
    .createHash('sha1')
    .update(key + GUID)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  const id = nextId++;
  clients.set(socket, { id, nick: null });

  socket.on('data', buf => {
    /* A single TCP packet can hold several WS frames. Parse sequentially. */
    let pos = 0;
    while (pos < buf.length) {
      const op = buf[pos] & 0x0f;
      const lenByte = buf[pos + 1] & 0x7f;
      let frameLen = lenByte;
      let hdrLen = 2;

      if (lenByte === 126) {
        frameLen = (buf[pos + 2] << 8) + buf[pos + 3];
        hdrLen = 4;
      }
      hdrLen += 4;              
      const fullLen = hdrLen + frameLen;
      const frameBuf = buf.slice(pos, pos + fullLen);
      pos += fullLen;

      if (op === 0x8) {         
        socket.end();
        return;
      }
      if (op === 0x9) {               // PING -> PONG
        socket.write(Buffer.from([0x8a, 0x00]));
        continue;
      }
      if (op === 0xA) continue;       // ignore PONG

      const txt = decodeTextFrame(frameBuf);
      if (!txt) continue;
      let msg;
      try { msg = JSON.parse(txt); } catch { continue; }

      if (msg.type === 'join') {
        clients.get(socket).nick = String(msg.nick).slice(0, 20);
        broadcast('lobbyUpdate', [...clients.values()]);
      }
      // (chat & game actions will be handled later)
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    broadcast('lobbyUpdate', [...clients.values()]);
  });

  socket.on('error', () => socket.destroy());
});

server.listen(PORT, () =>
  console.log(`WebSocket lobby ready  ws://localhost:${PORT}`)
);