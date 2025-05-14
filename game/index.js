import { createApp, createElement, store } from '../src/index.js';
import { NicknameForm } from './components/NicknameForm.js';
import { Lobby } from './components/Lobby.js';
import { generateGrid } from './map.js';

// Initial state setup
store.setState({
  gameState: 'init', // Possible states: init, lobby, playing, gameOver
  nickname: null,
  nicknameDraft: '',

  // Lobby-related state
  lobby: { players: [] },
  lobbyState: {},
  chatMessages: [],
  chatDraft: '',

  // Network-related state
  socket: null,
  socketId: null, // Numeric ID from server
  localPlayerId: null,

  // Game world state
  mapSeed: null,
  map: { size: 15, grid: [] },
  players: {}, // id -> {x, y, dir, lives}
  bombs: [],
  powerups: [],
  explosions: [],
  
  // Flag to prevent excessive re-renders
  lastRender: 0,
  localPlayerDead: false,
  
  // Cache rendering components
  renderCache: {
    gameElement: null,
    lastGameState: null
  }
});

// Store player nicknames for reference
const playerNicknames = {};

// WebSocket connection setup
function connectWS() {
  const ws = new WebSocket('ws://localhost:8080');

  ws.addEventListener('open', () => console.log('🔌 WS connected'));

  ws.addEventListener('message', evt => {
    const { type, payload } = JSON.parse(evt.data);

    // Handle lobby updates
    if (type === 'lobbyUpdate') {
      store.setState({ lobby: { players: payload } });
      
      // Store player nicknames
      payload.forEach(player => {
        if (player.nick) {
          playerNicknames[player.id] = player.nick;
        }
      });
      
      const me = payload.find(p => p.nick === store.getState().nickname);
      if (me && !store.getState().socketId) {
        store.setState({ socketId: me.id, localPlayerId: me.id });
      }
    }
    
    if (type === 'lobbyState') {
      store.setState({ lobbyState: payload });
    }

    if (type === 'chat') {
      const { chatMessages } = store.getState();
      store.setState({ chatMessages: [...chatMessages, payload] });
      
      // Update chat UI directly
      setTimeout(() => {
        updateChatMessages();
      }, 0);
    }

    // Handle game start
    if (type === 'gameStart') {
      const { seed, players } = payload;
      const obj = {};
      
      players.forEach(([id, data]) => {
        // Get the player's nickname
        const playerNickname = playerNicknames[id] || data.nickname || `Player ${id}`;
        
        obj[id] = { 
          ...data, 
          id: +id,
          x: +data.x,
          y: +data.y,
          lives: +data.lives || 3,
          bombCount: 1,
          bombRange: 1,
          speed: 1,
          nickname: playerNickname,
          nick: playerNickname
        };
      });
      
      // Force re-render on game state change by clearing cache
      store.setState({
        gameState: 'playing',
        mapSeed: seed,
        map: { size: 15, grid: generateGrid(15, seed) },
        players: obj,
        localPlayerDead: false, 
        renderCache: { gameElement: null, lastGameState: null }
      });
      
      // Initialize game immediately
      setTimeout(initializeGameElements, 50);
    }

    // Handle player movement
    if (type === 'playerMove') {
      const { players } = store.getState();
      const { id, x, y, dir } = payload;
      
      // Make sure player exists
      if (!players[id]) return;
      
      // Skip if it's the local player - prevents teleporting
      if (id == store.getState().localPlayerId) return;
      
      // Update player state with proper numeric values
      players[id] = { 
        ...players[id], 
        x: +x, 
        y: +y, 
        dir: dir || players[id].dir,
        direction: dir || players[id].direction 
      };
      
      // Update DOM directly 
      updatePlayerPosition(id, +x, +y);
      if (dir) updatePlayerSprite(id, dir);
      
      // Update state without re-render
      store.setState({ players: { ...players } }, false);
    }
    
    // Handle bomb placed
    if (type === 'bombPlaced') {
      const { bombs } = store.getState();
      
      // Skip if we already have this bomb
      if (bombs.some(b => b.id === payload.id)) return;
      
      const newBomb = {
        id: payload.id,
        playerId: +payload.playerId,
        x: +payload.x,
        y: +payload.y,
        range: +payload.range || 1,
        timer: +payload.timer || 3000,
        countdown: +payload.countdown || 3,
        stage: +payload.stage || 1
      };
      
      // Add bomb to state
      store.setState({ bombs: [...bombs, newBomb] }, false);
      
      // Add to DOM
      addBombElementToDOM(newBomb);
      
      // Start countdown
      startBombCountdown(newBomb);
      
      // Schedule explosion
      setTimeout(() => explodeBomb(newBomb), newBomb.timer);
    }
    
    // Handle block destroyed
    if (type === 'blockDestroyed') {
      const { x, y } = payload;
      const { map } = store.getState();
      
      // Make sure block exists and is a block
      if (map.grid[y] && map.grid[y][x] && map.grid[y][x].type === 'block') {
        // Update the grid
        const updatedGrid = [...map.grid];
        updatedGrid[y][x] = { ...updatedGrid[y][x], type: 'empty' };
        
        // Update state without re-render
        store.setState({ 
          map: { ...map, grid: updatedGrid } 
        }, false);
        
        // Update cell visually
        updateCellType(x, y, 'empty');
      }
    }
    
    // Handle powerup spawned
    if (type === 'powerupSpawned') {
      const { powerups } = store.getState();
      
      // Skip if we already have this powerup
      if (powerups.some(p => p.id === payload.id)) return;
      
      const newPowerUp = {
        id: payload.id,
        x: +payload.x,
        y: +payload.y,
        type: payload.type
      };
      
      // Add to state without re-render
      store.setState({ powerups: [...powerups, newPowerUp] }, false);
      
      // Add to DOM
      addPowerUpToDOM(newPowerUp);
    }
    
    // Handle powerup collected
    if (type === 'powerupCollected') {
      const { powerups, players } = store.getState();
      const { powerupId, playerId, newStats } = payload;
      
      // Find and remove powerup
      const updatedPowerups = powerups.filter(p => p.id !== powerupId);
      
      // Update player stats if this player exists
      if (players[playerId]) {
        players[playerId] = {
          ...players[playerId],
          bombCount: +newStats.bombCount || players[playerId].bombCount,
          bombRange: +newStats.bombRange || players[playerId].bombRange,
          speed: +newStats.speed || players[playerId].speed
        };
      }
      
      // Update state
      store.setState({
        powerups: updatedPowerups,
        players: { ...players }
      }, false);
      
      // Remove powerup from DOM
      const powerupElement = document.querySelector(`.powerup[data-powerup-id="${powerupId}"]`);
      if (powerupElement) powerupElement.remove();
      
      // Update UI if it's the local player
      if (playerId == store.getState().localPlayerId) {
        updatePlayerInfoUI();
      }
    }
    
    // Handle player hit
    if (type === 'playerHit') {
      const { players } = store.getState();
      const { id, lives } = payload;
      
      if (players[id]) {
        const newLives = +lives;
        
        // Update player lives
        players[id] = { 
          ...players[id], 
          lives: newLives
        };
        
        // If player is dead
        if (newLives <= 0) {
          // If it's the local player, show death message and prevent movement
          if (id == store.getState().localPlayerId) {
            store.setState({ localPlayerDead: true }, false);
            
            // Alert the player
            setTimeout(() => {
              alert('You were killed!');
            }, 100);
          }
          
          // Remove player from DOM
          const playerEl = document.querySelector(`.player[data-player-id="${id}"]`);
          if (playerEl) playerEl.remove();
          
          // Mark as dead in state
          players[id].dead = true;
        }
        
        // Update state without re-render
        store.setState({ players: { ...players } }, false);
        
        // Update UI if it's local player
        if (id == store.getState().localPlayerId) {
          updatePlayerInfoUI();
        }
      }
    }
    
    // Handle game over
    if (type === 'gameOver') {
      setTimeout(() => {
        alert(`Game Over! ${payload.winner} wins!`);
        store.setState({ 
          gameState: 'init',
          renderCache: { gameElement: null, lastGameState: null }
        });
      }, 200);
    }
    
    // Handle player left
    if (type === 'playerLeft') {
      const { players } = store.getState();
      const { id } = payload;
      
      if (players[id]) {
        // Mark player as left
        players[id].left = true;
        
        // Remove from DOM
        const playerEl = document.querySelector(`.player[data-player-id="${id}"]`);
        if (playerEl) playerEl.remove();
        
        // Update state without re-render
        store.setState({ players: { ...players } }, false);
      }
    }
    
    // Handle nickname updates
    if (type === 'nicknameUpdate') {
      const { players } = store.getState();
      const { id, nickname } = payload;
      
      // Store nickname for reference
      playerNicknames[id] = nickname;
      
      if (players[id]) {
        players[id].nickname = nickname;
        players[id].nick = nickname;
        
        // Update state without re-render
        store.setState({ players: { ...players } }, false);
        
        // Update player label in DOM
        updatePlayerLabel(id, nickname);
      }
    }
  });

  ws.addEventListener('close', () => {
    console.warn('WS closed -- reconnecting in 3 seconds');
    setTimeout(connectWS, 3000);
  });

  store.setState({ socket: ws });
}
connectWS();

// Helper functions for API communication
function sendPlayerMove(x, y, dir) {
  if (store.getState().localPlayerDead) return; // Prevent movement if dead
  
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'move', x, y, dir }));
}

function sendBombPlaced(bomb) {
  if (store.getState().localPlayerDead) return; // Prevent bomb placement if dead
  
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'bomb', bomb }));
}

function sendPlayerHit(lives) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'hit', lives }));
}

function sendBlockDestroyed(x, y) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'blockDestroyed', x, y }));
}

function sendPowerupSpawned(powerup) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ 
      type: 'powerupSpawned', 
      id: powerup.id,
      x: powerup.x,
      y: powerup.y,
      type: powerup.type
    }));
}

function sendPowerupCollected(powerupId, newStats) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({
      type: 'powerupCollected',
      powerupId,
      newStats
    }));
}

function sendChatMessage(text) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'chat', text }));
}

// Mount the application
const app = createApp('#app');

// Improved render function to prevent flickering
store.subscribe(() => {
  const { gameState, renderCache } = store.getState();
  
  // Only create new components if game state changed
  if (gameState !== renderCache.lastGameState) {
    renderCache.lastGameState = gameState;
    
    if (gameState === 'init') {
      renderCache.gameElement = NicknameForm();
    } else if (gameState === 'lobby') {
      renderCache.gameElement = Lobby();
    } else if (gameState === 'playing') {
      renderCache.gameElement = GameApp();
      // Schedule initialization
      setTimeout(initializeGameElements, 50);
    } else {
      renderCache.gameElement = createElement('h1', {}, 'Game Over');
    }
    
    // Important: Update state with new cache without triggering another render
    store.setState({ renderCache }, false);
    
    // Perform the actual render
    app.mount(renderCache.gameElement);
  }
});

// Initial mount
const { gameState } = store.getState();
let initialComponent;
if (gameState === 'init') {
  initialComponent = NicknameForm();
} else if (gameState === 'lobby') {
  initialComponent = Lobby();
} else if (gameState === 'playing') {
  initialComponent = GameApp();
} else {
  initialComponent = createElement('h1', {}, 'Game Over');
}
app.mount(initialComponent);

// Game rendering and input handling
const CELL = 40;

// Initialize game elements after DOM is ready
function initializeGameElements() {
  // Set cell backgrounds
  document.querySelectorAll('.cell').forEach(cell => {
    const t = cell.dataset.cellType;
    if (t === 'wall') {
      cell.style.backgroundImage = "url('./assets/wall.png')";
    } else if (t === 'block') {
      cell.style.backgroundImage = "url('./assets/block.png')";
    } else {
      cell.style.backgroundImage = "url('./assets/floor.png')";
    }
  });
  
  // Add players and other game elements
  const container = document.querySelector('.game-container');
  if (container) {
    const { bombs, powerups, explosions } = store.getState();
    
    // Clear existing dynamic elements
    container.querySelectorAll('.player, .bomb, .powerup, .explosion').forEach(el => el.remove());
    
    // Add players
    renderPlayers().forEach(p => container.appendChild(p));
    
    // Add other game elements
    bombs.forEach(addBombElementToDOM);
    powerups.forEach(addPowerUpToDOM);
    explosions.forEach(addExplosionToDOM);
  }
  
  // Setup chat form
  setupChatForm();
  
  // Update chat messages
  updateChatMessages();
}

// Fallback map generation for local preview
function generateFallbackMap() {
  const size = 15, grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      let t = 'empty';
      if (x % 2 === 0 && y % 2 === 0) t = 'wall';
      else if (Math.random() < 0.3 &&
        !((x < 2 && y < 2) ||
          (x < 2 && y > size - 3) ||
          (x > size - 3 && y < 2) ||
          (x > size - 3 && y > size - 3)))
        t = 'block';
      row.push({ x, y, type: t });
    }
    grid.push(row);
  }
  grid[1][1].type = 'empty';
  store.setState({ map: { size, grid } });
}

// DOM helper to render players
function renderPlayers() {
  return Object.values(store.getState().players)
    .filter(p => !p.dead && !p.left) // Skip dead or left players
    .map(p => {
      const el = document.createElement('div');
      el.className = `player player-${p.id}`;
      el.dataset.playerId = p.id;
      const dir = p.direction || p.dir || 'front';
      el.dataset.direction = dir;
      el.style.left = `${p.x * CELL}px`;
      el.style.top = `${p.y * CELL}px`;
      el.classList.add(`player-direction-${dir}`);
      
      // Add a label with player name
      const nameLabel = document.createElement('div');
      nameLabel.className = 'player-name-label';
      nameLabel.textContent = p.nickname || p.nick || playerNicknames[p.id] || `Player ${p.id}`;
      
      // Mark local player
      if (p.id == store.getState().localPlayerId) {
        el.classList.add('local-player');
      }
      
      el.appendChild(nameLabel);
      
      // Set the background image directly
      el.style.backgroundImage = `url('./assets/${dir}.png')`;
      
      return el;
    });
}

// Update player label in DOM
function updatePlayerLabel(id, nickname) {
  const playerEl = document.querySelector(`.player[data-player-id="${id}"] .player-name-label`);
  if (playerEl) {
    playerEl.textContent = nickname;
  }
}

// Game UI components
function GameTitle() {
  return createElement('h1', { class: 'game-title' }, 'Bomberman DOM');
}

function GameGrid() {
  const { map } = store.getState();
  const gridEl = createElement('div', { class: 'game-grid' },
    ...map.grid.flat().map(c =>
      createElement('div', {
        class: `cell cell-${c.type}`,
        'data-x': c.x,
        'data-y': c.y,
        'data-cell-type': c.type
      })
    ));
  
  return createElement('div', { class: 'game-container' }, gridEl);
}

function PlayerInfo() {
  const { players, localPlayerId } = store.getState();
  const me = players[localPlayerId] || {};
  
  // Simple stats for the local player only
  return createElement('div', { class: 'player-info' },
    createElement('div', {}, `You: ${me.nickname || me.nick || playerNicknames[localPlayerId] || 'Player ' + localPlayerId}`),
    createElement('div', {}, `Lives: ${me.lives ?? '3'}`),
    createElement('div', {}, `Bombs: ${me.bombCount ?? '1'}`),
    createElement('div', {}, `Range: ${me.bombRange ?? '1'}`),
    createElement('div', {}, `Speed: ${me.speed ?? '1'}`)
  );
}

// In-game chat component
function GameChat() {
  return createElement('div', { class: 'game-chat-container' },
    createElement('div', { 
      class: 'game-chat-toggle',
      onclick: () => toggleChat()
    }, 'Chat'),
    createElement('div', { 
      class: 'game-chat-panel',
      style: { display: 'none' }
    },
      createElement('div', { class: 'game-chat-messages', id: 'chat-messages' }),
      createElement('form', { 
        class: 'game-chat-form',
        id: 'chat-form',
        onsubmit: (e) => {
          e.preventDefault();
          const input = document.getElementById('game-chat-input');
          if (!input) return;
          
          const text = input.value.trim();
          if (!text) return;
          
          // Send message to server
          sendChatMessage(text);
          
          // Clear input
          input.value = '';
        }
      },
        createElement('input', { 
          type: 'text', 
          id: 'game-chat-input',
          placeholder: 'Type message...'
        }),
        createElement('button', { type: 'submit' }, 'Send')
      )
    )
  );
}

// Toggle chat visibility
function toggleChat() {
  const panel = document.querySelector('.game-chat-panel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    
    // Focus input when opened
    if (panel.style.display === 'block') {
      const input = document.getElementById('game-chat-input');
      if (input) input.focus();
    }
  }
}

// Set up chat form (attach submit handler)
function setupChatForm() {
  const form = document.getElementById('chat-form');
  if (!form) return;
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const input = document.getElementById('game-chat-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    // Send message to server
    sendChatMessage(text);
    
    // Clear input
    input.value = '';
  });
}

// Update chat messages without triggering re-render
function updateChatMessages() {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;
  
  const { chatMessages } = store.getState();
  
  // Clear existing messages
  messagesContainer.innerHTML = '';
  
  // Add recent messages
  chatMessages.slice(-5).forEach(msg => {
    const messageEl = document.createElement('div');
    messageEl.className = 'game-chat-message';
    
    const authorEl = document.createElement('span');
    authorEl.className = 'game-chat-author';
    authorEl.textContent = `${msg.nick}: `;
    
    const textEl = document.createElement('span');
    textEl.className = 'game-chat-text';
    textEl.textContent = msg.text;
    
    messageEl.appendChild(authorEl);
    messageEl.appendChild(textEl);
    
    messagesContainer.appendChild(messageEl);
  });
  
  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function GameApp() {
  const { map } = store.getState();
  if (!map.grid.length) generateFallbackMap();
  
  return createElement('div', { class: 'game-app' },
    GameTitle(),
    PlayerInfo(),
    GameChat(),
    GameGrid()
  );
}

// Movement and input handling
let moving = false;
const MOVE_MS = 150;

function handleKeyDown(e) {
  // Don't handle movement if player is dead
  if (store.getState().localPlayerDead) return;
  
  // Don't handle movement if we're typing in chat
  if (document.activeElement && document.activeElement.tagName === 'INPUT') {
    return;
  }
  
  if (moving || store.getState().gameState !== 'playing') return;
  
  const { players, localPlayerId } = store.getState();
  const me = players[localPlayerId];
  if (!me || me.dead) return;

  let nx = me.x, ny = me.y, nd = me.direction || me.dir || 'front';
  switch (e.key) {
    case 'ArrowUp': ny -= me.speed || 1; nd = 'back'; break;
    case 'ArrowDown': ny += me.speed || 1; nd = 'front'; break;
    case 'ArrowLeft': nx -= me.speed || 1; nd = 'left'; break;
    case 'ArrowRight': nx += me.speed || 1; nd = 'right'; break;
    case ' ': placeBomb(me); return;
    case 'Escape': toggleChat(); return;
    default: return;
  }

  // Update direction if changed
  if (nd !== me.direction && nd !== me.dir) {
    players[localPlayerId] = { 
      ...me, 
      direction: nd,
      dir: nd
    };
    store.setState({ players: { ...players } }, false); // Don't trigger re-render
    updatePlayerSprite(me.id, nd);
    sendPlayerMove(me.x, me.y, nd);
  }

  if (!isPassable(nx, ny)) return;

  moving = true;
  players[localPlayerId] = { 
    ...me, 
    x: nx, 
    y: ny, 
    direction: nd,
    dir: nd
  };
  store.setState({ players: { ...players } }, false); // Don't trigger re-render
  updatePlayerPosition(me.id, nx, ny);
  sendPlayerMove(nx, ny, nd);
  setTimeout(() => moving = false, MOVE_MS);
}

function isPassable(x, y) {
  const { map, bombs } = store.getState();
  if (x < 0 || y < 0 || x >= map.size || y >= map.size) return false;
  if (map.grid[y][x].type !== 'empty') return false;
  if (bombs.some(b => b.x === x && b.y === y)) return false;
  return true;
}

// DOM update helpers for player movement
function updatePlayerSprite(id, dir) {
  const el = document.querySelector(`.player[data-player-id="${id}"]`);
  if (el) {
    el.dataset.direction = dir;
    el.classList.remove('player-direction-front', 'player-direction-back', 'player-direction-left', 'player-direction-right');
    el.classList.add(`player-direction-${dir}`);
    el.style.backgroundImage = `url('./assets/${dir}.png')`;
  }
}

function updatePlayerPosition(id, x, y) {
  const el = document.querySelector(`.player[data-player-id="${id}"]`);
  if (el) {
    el.style.left = `${x * CELL}px`;
    el.style.top = `${y * CELL}px`;
  }
}

// Bomb, power-up, and explosion logic
function placeBomb(player) {
  // Don't place bombs if player is dead
  if (store.getState().localPlayerDead) return;
  
  const { bombs } = store.getState();
  
  // Check if player has bombs available
  if (bombs.filter(bomb => bomb.playerId === player.id).length >= player.bombCount) {
    return;
  }
  
  // Check if there's already a bomb at this position
  if (bombs.some(bomb => bomb.x === Math.floor(player.x) && bomb.y === Math.floor(player.y))) {
    return;
  }
  
  // Create a new bomb
  const newBomb = {
    id: Date.now(),
    playerId: player.id,
    x: Math.floor(player.x),
    y: Math.floor(player.y),
    range: player.bombRange || 1,
    timer: 3000,
    countdown: 3,
    stage: 1
  };
  
  // Add to bombs list locally
  store.setState({
    bombs: [...bombs, newBomb]
  }, false); // Don't trigger re-render
  
  // Send to server
  sendBombPlaced(newBomb);
  
  // Create and add the bomb element directly
  addBombElementToDOM(newBomb);
  
  // Start bomb countdown animation
  startBombCountdown(newBomb);
  
  // Start bomb timer
  setTimeout(() => {
    explodeBomb(newBomb);
  }, newBomb.timer);
}

function addBombElementToDOM(bomb) {
  const container = document.querySelector('.game-container');
  if (!container) {
    return;
  }
  
  // Check if bomb element already exists to avoid duplicates
  const existingBomb = document.getElementById(`bomb-${bomb.id}`);
  if (existingBomb) {
    return;
  }
  
  // Create the bomb element
  const bombElement = document.createElement('div');
  bombElement.className = 'bomb';
  bombElement.id = `bomb-${bomb.id}`;
  bombElement.style.left = `${bomb.x * CELL}px`;
  bombElement.style.top = `${bomb.y * CELL}px`;
  bombElement.dataset.bombId = bomb.id;
  bombElement.dataset.stage = bomb.stage;
  
  // Set image directly - this is cleaner than using a background
  bombElement.style.backgroundImage = `url('./assets/bomb${bomb.stage}.png')`;
  
  // Add text representation of countdown as fallback
  bombElement.textContent = "💣";
  
  container.appendChild(bombElement);
}

function startBombCountdown(bomb) {
  let countdown = bomb.countdown;
  let stage = 1;
  
  const countdownInterval = setInterval(() => {
    countdown--;
    
    // Update animation stage (cycles through 1-2-3)
    stage = stage % 3 + 1;
    
    // Use ID-based selector for more reliable selection
    const bombElement = document.getElementById(`bomb-${bomb.id}`);
    
    if (bombElement) {
      bombElement.dataset.stage = stage;
      
      // Use direct path for bomb images
      bombElement.style.backgroundImage = `url('./assets/bomb${stage}.png')`;
      
      // Add text representation of countdown
      bombElement.textContent = `💣${countdown}`;
    } else {
      clearInterval(countdownInterval);
    }
    
    if (countdown <= 0 || !document.getElementById(`bomb-${bomb.id}`)) {
      clearInterval(countdownInterval);
    }
  }, 1000);
}

function explodeBomb(bomb) {
  const { bombs, map, explosions, players } = store.getState();
  
  // Skip if the bomb is no longer in state (already exploded)
  if (!bombs.some(b => b.id === bomb.id)) return;
  
  const { grid } = map;
  
  // Remove this bomb from the bombs array
  const updatedBombs = bombs.filter(b => b.id !== bomb.id);
  
  // Create explosions array
  const newExplosions = [];
  
  // Add center explosion
  newExplosions.push({ x: bomb.x, y: bomb.y, type: 'center' });
  
  // Track destroyed blocks for potential power-up spawning
  const destroyedBlocks = [];
  
  // Check in all four directions
  const directions = [
    { dx: 0, dy: -1, name: 'up' }, // Up
    { dx: 0, dy: 1, name: 'down' }, // Down
    { dx: -1, dy: 0, name: 'left' }, // Left
    { dx: 1, dy: 0, name: 'right' } // Right
  ];
  
  // Process each direction
  directions.forEach(dir => {
    for (let i = 1; i <= bomb.range; i++) {
      const newX = bomb.x + (dir.dx * i);
      const newY = bomb.y + (dir.dy * i);
      
      // Check if position is within bounds
      if (newX < 0 || newY < 0 || newX >= map.size || newY >= map.size) {
        break; // Out of bounds, stop in this direction
      }
      
      const cell = grid[newY][newX];
      
      if (cell.type === 'wall') {
        break; // Can't go through walls
      }
      
      // Add explosion at this position
      const isEnd = i === bomb.range; // Is this the end of the explosion range?
      const explosionType = isEnd ? `end-${dir.name}` : dir.name;
      newExplosions.push({ x: newX, y: newY, type: explosionType });
      
      // Check if there's a block to destroy
      if (cell.type === 'block') {
        // Destroy the block
        const updatedGrid = [...grid];
        updatedGrid[newY][newX] = { ...cell, type: 'empty' };
        
        // Track this block for power-up spawning
        destroyedBlocks.push({ x: newX, y: newY });
        
        // Update the store with the new grid
        store.setState({
          map: {
            ...map,
            grid: updatedGrid
          }
        }, false); // Don't trigger re-render
        
        // Update the cell visually
        updateCellType(newX, newY, 'empty');
        
        // Synchronize block destruction with other players
        // Only the bomb owner should send the broadcast
        if (bomb.playerId === store.getState().localPlayerId) {
          sendBlockDestroyed(newX, newY);
        }
        
        break; // Stop in this direction after hitting a block
      }
      
      // Check if there's another bomb to chain-explode
      const bombAtPosition = bombs.find(b => b.x === newX && b.y === newY && b.id !== bomb.id);
      if (bombAtPosition) {
        // Schedule this bomb to explode immediately
        setTimeout(() => {
          explodeBomb(bombAtPosition);
        }, 100); // Slight delay for chain reaction effect
        
        break; // Stop in this direction after hitting another bomb
      }
    }
  });
  
  // Add all new explosions
  const allExplosions = [...explosions, ...newExplosions];
  
  // Remove this bomb from DOM
  const bombElement = document.getElementById(`bomb-${bomb.id}`);
  if (bombElement) {
    bombElement.remove();
  }
  
  // Add explosion effects to DOM
  newExplosions.forEach(explosion => {
    addExplosionToDOM(explosion);
  });
  
  // Check for players hit by explosions
  checkPlayersInExplosion(newExplosions);
  
  // Update the state
  store.setState({
    bombs: updatedBombs,
    explosions: allExplosions
  }, false); // Don't trigger re-render
  
  // Spawn power-ups from destroyed blocks - but only if this is the bomb owner
  if (bomb.playerId === store.getState().localPlayerId) {
    destroyedBlocks.forEach(block => {
      if (Math.random() < 0.4) {
        // Generate a deterministic powerup ID based on block position and time
        const powerupId = `pu-${block.x}-${block.y}-${Date.now()}`;
        const powerUpTypes = ['bomb', 'flame', 'speed'];
        const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
        
        const newPowerUp = {
          id: powerupId,
          x: block.x,
          y: block.y,
          type
        };
        
        // Send to server first - let server handle synchronizing
        sendPowerupSpawned(newPowerUp);
      }
    });
  }
  
  // Clean up explosions after animation
  setTimeout(() => {
    removeExplosions(newExplosions);
  }, 1000);
}

function updateCellType(x, y, newType) {
  const cellElement = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (cellElement) {
    // Update the class and data attribute
    cellElement.className = `cell cell-${newType}`;
    cellElement.dataset.cellType = newType;
    
    // Update image based on new type
    if (newType === 'wall') {
      cellElement.style.backgroundImage = "url('./assets/wall.png')";
    } else if (newType === 'block') {
      cellElement.style.backgroundImage = "url('./assets/block.png')";
    } else if (newType === 'empty') {
      cellElement.style.backgroundImage = "url('./assets/floor.png')";
    } else {
      cellElement.style.backgroundImage = "";
    }
  }
}

function addPowerUpToDOM(powerUp) {
  const container = document.querySelector('.game-container');
  if (!container) {
    return;
  }
  
  // Check if power-up already exists
  const existingPowerUp = document.querySelector(`.powerup[data-powerup-id="${powerUp.id}"]`);
  if (existingPowerUp) {
    return;
  }
  
  const powerUpElement = document.createElement('div');
  powerUpElement.className = `powerup powerup-${powerUp.type}`;
  
  // Center the power-up in the cell
  powerUpElement.style.left = `${powerUp.x * CELL}px`;
  powerUpElement.style.top = `${powerUp.y * CELL}px`;
  powerUpElement.dataset.powerupId = powerUp.id;
  
  let powerupImageUrl = '';
  switch (powerUp.type) {
    case 'bomb':
      powerupImageUrl = './assets/pubomb.png';
      break;
    case 'flame':
      powerupImageUrl = './assets/pubigbomb.png';
      break;
    case 'speed':
      powerupImageUrl = './assets/puspeed.png';
      break;
  }
  
  // Set image directly
  powerUpElement.style.backgroundImage = `url('${powerupImageUrl}')`;
  
  container.appendChild(powerUpElement);
}

function addExplosionToDOM(explosion) {
  const container = document.querySelector('.game-container');
  if (container) {
    // Check if explosion already exists at this position
    const existingExplosion = container.querySelector(`.explosion[data-x="${explosion.x}"][data-y="${explosion.y}"]`);
    if (existingExplosion) {
      return;
    }
    
    const explosionElement = document.createElement('div');
    explosionElement.className = `explosion explosion-${explosion.type}`;
    explosionElement.style.left = `${explosion.x * CELL}px`;
    explosionElement.style.top = `${explosion.y * CELL}px`;
    explosionElement.dataset.x = explosion.x;
    explosionElement.dataset.y = explosion.y;
    
    container.appendChild(explosionElement);
  }
}

function removeExplosions(explosionsToRemove) {
  const { explosions } = store.getState();
  
  // Remove from DOM
  explosionsToRemove.forEach(explosion => {
    const explosionElements = document.querySelectorAll(`.explosion[data-x="${explosion.x}"][data-y="${explosion.y}"]`);
    explosionElements.forEach(el => el.remove());
  });
  
  // Remove from state
  const updatedExplosions = explosions.filter(e =>
    !explosionsToRemove.some(toRemove =>
      toRemove.x === e.x && toRemove.y === e.y
    )
  );
  
  store.setState({ explosions: updatedExplosions }, false); // Don't trigger re-render
}

function checkPlayersInExplosion(explosions) {
  const { players, localPlayerId } = store.getState();
  if (!players) return;
  
  // Check if any player is hit by the explosions
  let playersHit = false;
  
  const updatedPlayers = { ...players };
  
  Object.keys(players).forEach(playerId => {
    const player = players[playerId];
    
    // Skip dead players
    if (player.dead) return;
    
    // Check if this player is in any explosion area
    const isHit = explosions.some(explosion =>
      Math.floor(player.x) === explosion.x && Math.floor(player.y) === explosion.y
    );
    
    if (isHit) {
      playersHit = true;
      // Reduce player lives
      updatedPlayers[playerId] = {
        ...player,
        lives: player.lives - 1
      };
      
      // If local player was hit
      if (playerId === localPlayerId) {
        // Send updated life count to server
        sendPlayerHit(updatedPlayers[playerId].lives);
      }
      
      // If player is completely dead, mark as dead
      if (updatedPlayers[playerId].lives <= 0) {
        // Mark as dead
        updatedPlayers[playerId].dead = true;
        
        // If it's the local player, show death message and prevent movement
        if (playerId === localPlayerId) {
          store.setState({ localPlayerDead: true }, false);
          
          setTimeout(() => {
            alert('You were killed!');
          }, 100);
        }
        
        // Remove player from DOM
        const playerElement = document.querySelector(`.player[data-player-id="${playerId}"]`);
        if (playerElement) {
          playerElement.remove();
        }
      }
    }
  });
  
  if (playersHit) {
    // Apply damage to players
    store.setState({ players: updatedPlayers }, false); // Don't trigger re-render
    
    // Update UI to reflect changes
    updatePlayerInfoUI();
  }
}

// Update player info UI without re-rendering
function updatePlayerInfoUI() {
  const { players, localPlayerId } = store.getState();
  const me = players[localPlayerId];
  
  if (!me) return;
  
  // Update lives display
  const livesEl = document.querySelector('.player-info div:nth-child(2)');
  if (livesEl) livesEl.textContent = `Lives: ${me.lives}`;
  
  // Update bombs display
  const bombsEl = document.querySelector('.player-info div:nth-child(3)');
  if (bombsEl) bombsEl.textContent = `Bombs: ${me.bombCount || 1}`;
  
  // Update range display
  const rangeEl = document.querySelector('.player-info div:nth-child(4)');
  if (rangeEl) rangeEl.textContent = `Range: ${me.bombRange || 1}`;
  
  // Update speed display
  const speedEl = document.querySelector('.player-info div:nth-child(5)');
  if (speedEl) speedEl.textContent = `Speed: ${me.speed || 1}`;
}

function checkPowerUpCollection() {
  const { players, powerups, localPlayerId } = store.getState();
  if (!players || !powerups.length || store.getState().localPlayerDead) return;
  
  // Only check for the local player to avoid sync issues
  const me = players[localPlayerId];
  if (!me || me.dead) return;
  
  // Find powerups the local player is touching
  const collectedPowerups = powerups.filter(
    powerup => Math.floor(me.x) === powerup.x && Math.floor(me.y) === powerup.y
  );
  
  if (collectedPowerups.length) {
    // Apply effects to local player
    let updatedPlayer = { ...me };
    
    collectedPowerups.forEach(powerup => {
      // Apply effect based on powerup type
      switch (powerup.type) {
        case 'bomb':
          updatedPlayer.bombCount = (updatedPlayer.bombCount || 1) + 1;
          break;
        case 'flame':
          updatedPlayer.bombRange = (updatedPlayer.bombRange || 1) + 1;
          break;
        case 'speed':
          updatedPlayer.speed = (updatedPlayer.speed || 1) + 0.5;
          break;
      }
      
      // Notify server about collection
      sendPowerupCollected(powerup.id, {
        bombCount: updatedPlayer.bombCount,
        bombRange: updatedPlayer.bombRange,
        speed: updatedPlayer.speed
      });
      
      // No need to remove from DOM or state - server will broadcast
    });
  }
}

// Game loop for continuous updates
function gameLoop() {
  if (store.getState().gameState === 'playing') {
    checkPowerUpCollection();
  }
  requestAnimationFrame(gameLoop);
}

// Setup keyboard controls for player input
function setupKeyboardControls() {
  document.addEventListener('keydown', handleKeyDown);
}

// Initialize the game
setupKeyboardControls();
requestAnimationFrame(gameLoop);

// Override the original setState function to prevent excessive re-renders
if (typeof store.setState !== 'function' || store.setState.length === 1) {
  const originalSetState = store.setState;
  store.setState = function(newState, shouldNotify = true) {
    // Call original setState but don't notify yet
    originalSetState.call(this, newState);
    
    // Only notify if shouldNotify is true
    if (shouldNotify) {
      this.notify();
    }
    
    return this.state;
  };
}