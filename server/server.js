import http   from 'http';
import crypto from 'crypto';

const PORT = 8080;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const clients = new Map();         // socket -> { id, nick }
let nextId = 1;


function encodeFrame(str) {          // server client (no mask)
  const json = Buffer.from(str);
  const len  = json.length;
  const head = len < 126
    ? Buffer.from([0x81, len])                     // FIN + text
    : Buffer.from([0x81, 126, len >> 8, len & 255]);
  return Buffer.concat([head, json]);
}

function decodeFrame(buf) {          // client → server (masked)
  const len     = buf[1] & 0x7F;
  const maskPos = 2 + (len === 126 ? 2 : 0);
  const dataPos = maskPos + 4;
  const mask    = buf.slice(maskPos, maskPos + 4);
  const payload = buf.slice(dataPos, dataPos + len);
  for (let i = 0; i < payload.length; i++)
    payload[i] ^= mask[i % 4];
  return payload.toString();
}

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  const frame = encodeFrame(msg);
  for (const socket of clients.keys()) socket.write(frame);
}

const server = http.createServer();
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto
    .createHash('sha1')
    .update(key + GUID)
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n');

  socket.write(headers);

  const id = nextId++;
  clients.set(socket, { id, nick: null });

  socket.on('data', buf => {
    const msg = JSON.parse(decodeFrame(buf));

    // first message expected: {type:"join", nick:"foo"}
    if (msg.type === 'join') {
      clients.get(socket).nick = String(msg.nick).slice(0, 20);
      broadcast('lobbyUpdate', [...clients.values()]);
    }
    // other message types will be handled in later milestones
  });

  socket.on('close', () => {
    clients.delete(socket);
    broadcast('lobbyUpdate', [...clients.values()]);
  });

  socket.on('error', () => socket.destroy());
});

server.listen(PORT, () =>
  console.log(`Zero-dep WebSocket lobby listening ws://localhost:${PORT}`)
);