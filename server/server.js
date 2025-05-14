import http   from 'http';
import crypto from 'crypto';

const PORT = 8080;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAP_SIZE = 15;

const sockets = new Map();                // socket -> { id, nick }
const players = new Map();                // id     -> { x,y,dir,lives }
let nextId = 1;

// Store game state
const gameState = {
  powerups: new Map(),  // id -> {id, x, y, type}
};

/* lobby timers (unchanged from milestone 2)  */
let phase = 'waiting'; // waiting | fill | ready | playing
let fillR = 0, readyR = 0, fillI = null, readyI = null;

/* current game  */
let mapSeed = null;                       // number | null

/* helpers  */
const enc = s => {
  const b = Buffer.from(s);
  return b.length < 126
    ? Buffer.concat([Buffer.from([0x81, b.length]), b])
    : Buffer.concat([Buffer.from([0x81,126,b.length>>8,b.length&255]), b]);
};
const sendAll = (type,payload)=> {
  const f = enc(JSON.stringify({type,payload}));
  for(const s of sockets.keys()) s.write(f);
};
const sendExcept = (socket, type, payload) => {
  const f = enc(JSON.stringify({type,payload}));
  for(const s of sockets.keys()) {
    if (s !== socket) s.write(f);
  }
};
const lobbyUpdate = () =>
  sendAll('lobbyUpdate',[...sockets.values()]);

const lobbyState  = ()=> sendAll('lobbyState',{phase,fillR,readyR});

/* deterministic map helper  */
function rng(seed){
  let s = seed >>> 0;
  return ()=> (s = (s*1664525+1013904223)>>>0) / 2**32;
}
function generateSpawnPos(id){
  const last = MAP_SIZE-2;
  return [
    {x:1 , y:1 },           // id 1  top-left
    {x:1 , y:last},         // id 2  bottom-left
    {x:last, y:1 },         // id 3  top-right
    {x:last, y:last}        // id 4  bottom-right
  ][(id-1)%4];
}

function startFill(){
  phase='fill'; fillR=20; lobbyState();
  fillI=setInterval(()=>{
    fillR--;
    if(fillR<=0||sockets.size>=4){ clearInterval(fillI); startReady(); }
    lobbyState();
  },1000);
}
function startReady(){
  phase='ready'; readyR=10; lobbyState();
  readyI=setInterval(()=>{
    readyR--;
    if(sockets.size<2){clearInterval(readyI);phase='waiting';lobbyState();return;}
    if(readyR<=0){ clearInterval(readyI); beginGame(); return;}
    lobbyState();
  },1000);
}
function beginGame(){
  phase='playing';
  mapSeed = Date.now() & 0xffffffff;
  players.clear();
  gameState.powerups.clear();
  
  for(const {id, nick} of sockets.values()){
    const p = generateSpawnPos(id);
    players.set(id,{...p, dir:'front', lives:3, nickname: nick});
  }
  
  // First, send the game start payload with players including nicknames
  sendAll('gameStart',{seed:mapSeed,players:[...players.entries()]});
  
  // Then broadcast each player's nickname individually to ensure it's received
  for(const {id, nick} of sockets.values()){
    if (nick) {
      sendAll('nicknameUpdate', { id, nickname: nick });
    }
  }
  
  lobbyState();
}

function parseText(frame){
  const op = frame[0]&0x0f; if(op!==1) return null;
  let len=frame[1]&0x7f,off=2;
  if(len===126){len=(frame[2]<<8)+frame[3];off=4;}
  const mask=frame.slice(off,off+4); off+=4;
  const data=frame.slice(off,off+len);
  for(let i=0;i<data.length;i++) data[i]^=mask[i%4];
  return data.toString();
}

const server=http.createServer();
server.on('upgrade',(req,s)=>{
  /* handshake */
  const key=req.headers['sec-websocket-key'];
  const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
  s.write(`HTTP/1.1 101 Switching Protocols\r
Upgrade: websocket\r
Connection: Upgrade\r
Sec-WebSocket-Accept: ${accept}\r
\r\n`);

  /* register socket */
  const id=nextId++;
  sockets.set(s,{id,nick:null});
  lobbyUpdate(); lobbyState();

  s.on('data',buf=>{
    let p=0;
    while(p<buf.length){
      let len=buf[p+1]&0x7f, hdr=2;
      if(len===126){len=(buf[p+2]<<8)+buf[p+3];hdr=4;}
      hdr+=4; const frame=buf.slice(p,p+hdr+len); p+=hdr+len;
      const op=frame[0]&0x0f;
      if(op===8){s.end();return;}
      if(op===9){s.write(Buffer.from([0x8a,0x00]));continue;}
      const txt=parseText(frame); if(!txt) continue;
      let msg; try{msg=JSON.parse(txt);}catch{continue;}

      /*  messages  */
      if(msg.type==='join'){
        const nickname = String(msg.nick).slice(0,20);
        sockets.get(s).nick = nickname;
        
        // When a player joins, broadcast their nickname to everyone
        sendAll('nicknameUpdate', { id, nickname });
        
        lobbyUpdate();
        if(sockets.size>=2 && phase==='waiting') startFill();
      }

      if(msg.type==='chat'){
        const nick = sockets.get(s).nick;
        if (nick) {
          const chatPayload = {id, nick, text: String(msg.text || "").slice(0, 200)};
          sendAll('chat', chatPayload);
        }
      }

      if(phase==='playing' && msg.type==='move'){
        const pData = players.get(id); if(!pData) continue;
        const {x,y,dir}=msg;
        
        // Check if player is still alive
        if (pData.lives <= 0) continue; // Dead players can't move
        
        /* very naïve validation: within map bounds */
        if(x<0||y<0||x>=MAP_SIZE||y>=MAP_SIZE) continue;
        players.set(id,{...pData, x, y, dir});
        sendAll('playerMove',{id,x,y,dir});
      }
      
      if(phase==='playing' && msg.type==='bomb'){
        // Check if player is still alive
        const pData = players.get(id);
        if (!pData || pData.lives <= 0) continue; // Dead players can't place bombs
        
        // Fix for the TypeError: Guard against undefined bomb object
        if (!msg.bomb) {
          console.error(`Received invalid bomb data from player ${id}`);
          continue;
        }
        
        // Relay bomb placement to all clients except sender
        sendExcept(s, 'bombPlaced', {
          id: msg.bomb.id || Date.now(), // Fallback if id is missing
          playerId: id,
          x: msg.bomb.x || 0,
          y: msg.bomb.y || 0,
          range: msg.bomb.range || 1,
          timer: msg.bomb.timer || 3000,
          countdown: msg.bomb.countdown || 3,
          stage: msg.bomb.stage || 1
        });
      }
      
      if(phase==='playing' && msg.type==='blockDestroyed'){
        // Relay block destruction to everyone except sender
        sendExcept(s, 'blockDestroyed', {
          x: msg.x,
          y: msg.y
        });
      }
      
      if(phase==='playing' && msg.type==='powerupSpawned'){
        // Store powerup in game state
        const powerupId = msg.id || `pu-${Date.now()}`;
        gameState.powerups.set(powerupId, {
          id: powerupId,
          x: msg.x || 0,
          y: msg.y || 0,
          type: msg.type || 'bomb'
        });
        
        // Relay powerup to everyone including sender (for consistency)
        sendAll('powerupSpawned', {
          id: powerupId,
          x: msg.x || 0,
          y: msg.y || 0,
          type: msg.type || 'bomb'
        });
      }
      
      if(phase==='playing' && msg.type==='powerupCollected'){
        const playerData = players.get(id);
        if (!playerData || playerData.lives <= 0) continue; // Dead players can't collect powerups
        
        // Check if powerup exists
        if (gameState.powerups.has(msg.powerupId)) {
          const powerup = gameState.powerups.get(msg.powerupId);
          
          // Apply powerup effect to player
          switch (powerup.type) {
            case 'bomb':
              playerData.bombCount = (playerData.bombCount || 1) + 1;
              break;
            case 'flame':
              playerData.bombRange = (playerData.bombRange || 1) + 1;
              break;
            case 'speed':
              playerData.speed = (playerData.speed || 1) + 0.5;
              break;
          }
          
          // Update player data
          players.set(id, playerData);
          
          // Remove powerup from game state
          gameState.powerups.delete(msg.powerupId);
          
          // Broadcast to all players
          sendAll('powerupCollected', {
            powerupId: msg.powerupId,
            playerId: id,
            newStats: {
              bombCount: playerData.bombCount || 1,
              bombRange: playerData.bombRange || 1,
              speed: playerData.speed || 1
            }
          });
        }
      }
      
      if(phase==='playing' && msg.type==='hit'){
        // Update player lives
        const pData = players.get(id);
        if (pData) {
          // Update lives
          pData.lives = msg.lives;
          players.set(id, pData);
          
          // Broadcast hit to everyone
          sendAll('playerHit', {
            id: id,
            lives: msg.lives
          });
          
          // Check if player is dead
          if (msg.lives <= 0) {
            // Check if only one player remains alive
            const alivePlayers = [...players.entries()].filter(([_, p]) => p.lives > 0);
            
            if (alivePlayers.length === 1) {
              const winnerId = alivePlayers[0][0];
              const winnerNick = [...sockets.values()].find(p => p.id === winnerId)?.nick || 'Unknown';
              
              // Declare winner
              sendAll('gameOver', {
                winner: winnerNick
              });
              
              // Reset game state
              phase = 'waiting';
              mapSeed = null;
            }
          }
        }
      }
    }
  });

  s.on('close', () => {
    const playerData = sockets.get(s);
    sockets.delete(s);
    players.delete(id);
    
    // Notify all remaining clients that a player has left
    if (playerData) {
      sendAll('playerLeft', { id: playerData.id });
    }
    
    lobbyUpdate();
    
    // Check if game is in progress and only one player remains
    if (phase === 'playing') {
      const alivePlayers = [...players.entries()].filter(([_, p]) => p.lives > 0);
      
      if (alivePlayers.length === 1) {
        // Game over - we have a winner
        const winnerId = alivePlayers[0][0];
        const winnerNick = [...sockets.values()].find(p => p.id === winnerId)?.nick || 'Unknown';
        
        sendAll('gameOver', { winner: winnerNick });
        
        // Reset game state
        phase = 'waiting';
        mapSeed = null;
      }
    }
    
    if (sockets.size < 2) {
      fillI && clearInterval(fillI);
      readyI && clearInterval(readyI);
      phase = 'waiting';
      lobbyState();
    }
  });
  
  s.on('error',()=>s.destroy());
});

server.listen(PORT,()=>console.log('🟢 WS server on ws://localhost:'+PORT));