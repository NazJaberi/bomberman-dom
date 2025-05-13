import { createApp, createElement, store } from '../src/index.js';
import { NicknameForm } from './components/NicknameForm.js';
import { Lobby } from './components/Lobby.js';
import { generateGrid } from './map.js';

// Initial state setup
store.setState({
  gameState: 'init', // init | lobby | playing | gameOver
  nickname: null,
  nicknameDraft: '',

  // Lobby
  lobby: { players: [] },
  lobbyState: {},
  chatMessages: [],
  chatDraft: '',

  // Network
  socket: null,
  socketId: null,
  localPlayerId: null,

  // World
  mapSeed: null,
  map: { size: 15, grid: [] },
  players: {}, // id -> player object
  bombs: [],
  powerups: [],
  explosions: []
});

// WebSocket connection setup
function connectWS() {
  const ws = new WebSocket('ws://localhost:8080');

  ws.addEventListener('open', () => console.log('🔌 WS connected'));

  ws.addEventListener('message', evt => {
    const { type, payload } = JSON.parse(evt.data);

    // lobby list
    if (type === 'lobbyUpdate') {
      store.setState({ lobby: { players: payload } });
      const me = payload.find(p => p.nick === store.getState().nickname);
      if (me && !store.getState().socketId)
        store.setState({ socketId: me.id, localPlayerId: me.id });
    }

    // lobby timers (fill / ready)
    if (type === 'lobbyState')
      store.setState({ lobbyState: payload });

    // chat line
    if (type === 'chat') {
      const { chatMessages } = store.getState();
      store.setState({ chatMessages: [...chatMessages, payload] });
    }

    // game starts
    if (type === 'gameStart') {
      const { seed, players } = payload;

      // enrich every player with defaults the server does not send
      const defaults = {
        bombCount: 1,
        bombRange: 1,
        speed: 1,
        direction: 'front'
      };
      const playersObj = {};
      players.forEach(([id, data]) => {
        playersObj[id] = { id: +id, ...defaults, ...data };
      });

      store.setState({
        gameState: 'playing',
        mapSeed: seed,
        map: { size: 15, grid: generateGrid(15, seed) },
        players: playersObj
      });

      // attach keyboard *once*, now that the map exists
      if (!window.__kbAttached) {
        setupKeyboardControls();
        window.__kbAttached = true;
      }
    }

    // movement from somebody else
    if (type === 'playerMove') {
      const { players } = store.getState();
      players[payload.id] = { ...players[payload.id], ...payload };
      store.setState({ players: { ...players } });
    }
  });

  ws.addEventListener('close', () => {
    console.warn('WS closed – reconnecting in 3 s');
    setTimeout(connectWS, 3000);
  });

  store.setState({ socket: ws });
}
connectWS();

// helpers to talk to server
function sendPlayerMove(x, y, dir) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'move', x, y, dir }));
}
function sendBombPlaced(bomb) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'bomb', bomb }));
}
function sendPlayerHit(lives) {
  const ws = store.getState().socket;
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'hit', lives }));
}

// Root component router
function Root() {
  const { gameState } = store.getState();
  if (gameState === 'init') return NicknameForm();
  if (gameState === 'lobby') return Lobby();
  if (gameState === 'playing') return GameApp();
  return createElement('h1', {}, 'Game Over');
}

// Mount the application
const app = createApp('#app');
store.subscribe(() => app.mount(Root));
app.mount(Root);

// Rendering & input
const CELL = 40;

// fallback map for local preview
function generateFallbackMap() {
  const size = 15, grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      let t = 'empty';
      if (x % 2 === 0 && y % 2 === 0) t = 'wall';
      else if (Math.random() < 0.3 &&
        !((x < 2 && y < 2) || (x < 2 && y > size - 3) || (x > size - 3 && y < 2) || (x > size - 3 && y > size - 3)))
        t = 'block';
      row.push({ x, y, type: t });
    }
    grid.push(row);
  }
  grid[1][1].type = 'empty';
  store.setState({ map: { size, grid } });
}

// create DOM nodes for players
function renderPlayers() {
  return Object.values(store.getState().players).map(p => {
    const el = document.createElement('div');
    el.className = `player player-${p.id}`;
    el.dataset.playerId = p.id;
    const dir = p.direction || 'front';
    el.dataset.direction = dir;
    el.style.left = `${p.x * CELL}px`;
    el.style.top = `${p.y * CELL}px`;
    el.classList.add(`player-direction-${dir}`);
    setTimeout(() => { el.style.backgroundImage = `url('./assets/${dir}.png')`; }, 0);
    return el;
  });
}

// UI components
function GameTitle() {
  return createElement('h1', { class: 'game-title' }, 'Bomberman DOM');
}
function GameGrid() {
  const { map, bombs, powerups, explosions } = store.getState();
  const gridEl = createElement('div', { class: 'game-grid' },
    ...map.grid.flat().map(c =>
      createElement('div', { class: `cell cell-${c.type}`, 'data-x': c.x, 'data-y': c.y, 'data-cell-type': c.type })
    ));
  const container = createElement('div', { class: 'game-container' }, gridEl);

  setTimeout(() => {
    const cont = document.querySelector('.game-container');
    if (!cont) return;
    document.querySelectorAll('.cell').forEach(cell => {
      const t = cell.dataset.cellType;
      cell.style.backgroundImage =
        t === 'wall' ? "url('./assets/wall.png')" :
        t === 'block' ? "url('./assets/block.png')" :
        "url('./assets/floor.png')";
    });
    cont.querySelectorAll('.player,.bomb,.powerup,.explosion').forEach(el => el.remove());
    renderPlayers().forEach(p => cont.appendChild(p));
    bombs.forEach(addBombElementToDOM);
    powerups.forEach(addPowerUpToDOM);
    explosions.forEach(addExplosionToDOM);
  }, 0);
  return container;
}
function PlayerInfo() {
  const { players, localPlayerId } = store.getState();
  const me = players[localPlayerId] || {};
  return createElement('div', { class: 'player-info' },
    createElement('div', {}, `Lives: ${me.lives ?? '-'}`),
    createElement('div', {}, `Bombs: ${me.bombCount ?? '-'}`),
    createElement('div', {}, `Range: ${me.bombRange ?? '-'}`),
    createElement('div', {}, `Speed: ${me.speed ?? '-'}`)
  );
}
function GameApp() {
  const { map } = store.getState();
  if (!map.grid.length) generateFallbackMap(); // only for offline preview
  return createElement('div', { class: 'game-app' },
    GameTitle(),
    PlayerInfo(),
    GameGrid()
  );
}

// Movement
let moving = false;
const MOVE_MS = 150;

function handleKeyDown(e) {
  if (moving || store.getState().gameState !== 'playing') return;

  const { players, localPlayerId } = store.getState();
  const me = players[localPlayerId];
  if (!me) return;

  let nx = me.x, ny = me.y, nd = me.direction || 'front';
  switch (e.key) {
    case 'ArrowUp': ny -= me.speed; nd = 'back'; break;
    case 'ArrowDown': ny += me.speed; nd = 'front'; break;
    case 'ArrowLeft': nx -= me.speed; nd = 'left'; break;
    case 'ArrowRight': nx += me.speed; nd = 'right'; break;
    case ' ': placeBomb(me); return;
    default: return;
  }

  // direction-only change
  if (nd !== me.direction) {
    players[localPlayerId] = { ...me, direction: nd };
    store.setState({ players: { ...players } });
    updatePlayerSprite(me.id, nd);
    sendPlayerMove(me.x, me.y, nd);
  }

  if (!isPassable(nx, ny)) return;

  moving = true;
  players[localPlayerId] = { ...me, x: nx, y: ny, direction: nd };
  store.setState({ players: { ...players } });
  updatePlayerPosition(me.id, nx, ny);
  sendPlayerMove(nx, ny, nd);
  setTimeout(() => moving = false, MOVE_MS);
}

// safe passability check
function isPassable(x, y) {
  const { map, bombs } = store.getState();
  if (!map.grid.length || !map.grid[y] || !map.grid[y][x]) return false;
  if (x < 0 || y < 0 || x >= map.size || y >= map.size) return false;
  if (map.grid[y][x].type !== 'empty') return false;
  if (bombs.some(b => b.x === x && b.y === y)) return false;
  return true;
}

// keyboard listener
function setupKeyboardControls() {
  document.addEventListener('keydown', handleKeyDown, { passive: true });
}

// DOM helpers for sprite / position
function updatePlayerSprite(id, dir) {
  const el = document.querySelector(`.player[data-player-id="${id}"]`);
  if (el) {
    el.dataset.direction = dir;
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

// Bombs, power-ups & explosions
function placeBomb(player) {
  const { bombs } = store.getState();
  
  console.log("Attempting to place bomb for player:", player);
  
  // Check if player has bombs available
  if (bombs.filter(bomb => bomb.playerId === player.id).length >= player.bombCount) {
    console.log("Player has reached bomb limit");
    return;
  }
  
  // Check if there's already a bomb at this position
  if (bombs.some(bomb => bomb.x === player.x && bomb.y === player.y)) {
    console.log("Bomb already exists at this position");
    return;
  }
  
  // Create a new bomb
  const newBomb = {
    id: Date.now(),
    playerId: player.id,
    x: player.x,
    y: player.y,
    range: player.bombRange,
    timer: 3000,
    countdown: 3,
    stage: 1
  };
  
  console.log("Creating new bomb:", newBomb);
  
  // Add to bombs list locally
  store.setState({
    bombs: [...bombs, newBomb]
  });
  
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
  console.log("Adding bomb element to DOM:", bomb);
  
  const container = document.querySelector('.game-container');
  if (!container) {
    console.error("Game container not found when trying to add bomb!");
    return;
  }
  
  // Check if bomb element already exists to avoid duplicates
  const existingBomb = document.getElementById(`bomb-${bomb.id}`);
  if (existingBomb) {
    console.log(`Bomb ${bomb.id} already exists in DOM, skipping addition`);
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
  
  // Set image path for bomb
  const bombImagePath = `./assets/bomb${bomb.stage}.png`;
  
  console.log("Using bomb image path:", bombImagePath);
  
  // Set image explicitly with relative path
  bombElement.style.backgroundImage = `url('${bombImagePath}')`;
  
  // Add additional content as fallback
  bombElement.textContent = "💣";
  
  container.appendChild(bombElement);
  console.log("Bomb successfully added to DOM with ID:", bombElement.id);
  
  setTimeout(() => {
    const addedBomb = document.getElementById(`bomb-${bomb.id}`);
    if (addedBomb) {
      console.log("Bomb element styles:", {
        backgroundImage: addedBomb.style.backgroundImage,
        width: addedBomb.offsetWidth,
        height: addedBomb.offsetHeight,
        left: addedBomb.style.left,
        top: addedBomb.style.top
      });
    }
  }, 50);
}

function startBombCountdown(bomb) {
  let countdown = bomb.countdown;
  let stage = 1;
  
  console.log("Starting bomb countdown for bomb ID:", bomb.id);
  
  const countdownInterval = setInterval(() => {
    countdown--;
    
    // Update animation stage (cycles through 1-2-3)
    stage = stage % 3 + 1;
    
    // Use ID-based selector for more reliable selection
    const bombElement = document.getElementById(`bomb-${bomb.id}`);
    
    if (bombElement) {
      console.log(`Updating bomb ${bomb.id} to stage ${stage}`);
      bombElement.dataset.stage = stage;
      
      // Use relative path for bomb images
      const bombImagePath = `./assets/bomb${stage}.png`;
      
      // Update background image
      bombElement.style.backgroundImage = `url('${bombImagePath}')`;
      
      // Add text representation of countdown
      bombElement.textContent = `💣${countdown}`;
    } else {
      console.warn(`Bomb element with ID bomb-${bomb.id} not found during countdown update`);
    }
    
    if (countdown <= 0 || !document.getElementById(`bomb-${bomb.id}`)) {
      console.log(`Countdown finished for bomb ${bomb.id}`);
      clearInterval(countdownInterval);
    }
  }, 1000);
}

function explodeBomb(bomb) {
  console.log("Exploding bomb:", bomb.id);
  
  const { bombs, map, explosions, players } = store.getState();
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
        });
        
        // Update the cell visually
        updateCellType(newX, newY, 'empty');
        
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
    console.log("Removed bomb element from DOM");
  } else {
    console.warn(`Bomb element with ID bomb-${bomb.id} not found when trying to remove`);
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
  });
  
  // Spawn power-ups from destroyed blocks (approximately 30% chance)
  destroyedBlocks.forEach(block => {
    if (Math.random() < 0.4) { // Increased chance for testing
      spawnPowerUp(block.x, block.y);
    }
  });
  
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

function spawnPowerUp(x, y) {
  const { powerups } = store.getState();
  
  // Determine which power-up to spawn
  const powerUpTypes = ['bomb', 'flame', 'speed'];
  const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
  
  const newPowerUp = {
    id: Date.now(),
    x,
    y,
    type
  };
  
  // Add to state
  store.setState({
    powerups: [...powerups, newPowerUp]
  });
  
  addPowerUpToDOM(newPowerUp);
}

function addPowerUpToDOM(powerUp) {
  const container = document.querySelector('.game-container');
  if (!container) {
    console.error('Game container not found when adding power-up!');
    return;
  }
  
  // Check if power-up already exists
  const existingPowerUp = document.querySelector(`.powerup[data-powerup-id="${powerUp.id}"]`);
  if (existingPowerUp) {
    console.log(`Power-up ${powerUp.id} already exists in DOM, skipping addition`);
    return;
  }
  
  const powerUpElement = document.createElement('div');
  powerUpElement.className = `powerup powerup-${powerUp.type}`;
  
  // Center the power-up in the cell
  powerUpElement.style.left = `${powerUp.x * CELL + CELL / 2}px`;
  powerUpElement.style.top = `${powerUp.y * CELL + CELL / 2}px`;
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
  
  console.log("Setting power-up image:", powerupImageUrl);
  powerUpElement.style.backgroundImage = `url('${powerupImageUrl}')`;
  
  container.appendChild(powerUpElement);
  console.log("Power-up added to DOM:", powerUp.type);
}

function addExplosionToDOM(explosion) {
  const container = document.querySelector('.game-container');
  if (container) {
    // Check if explosion already exists at this position
    const existingExplosion = container.querySelector(`.explosion[data-x="${explosion.x}"][data-y="${explosion.y}"]`);
    if (existingExplosion) {
      console.log(`Explosion at (${explosion.x}, ${explosion.y}) already exists, skipping`);
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
  
  store.setState({ explosions: updatedExplosions });
}

function checkPlayersInExplosion(explosions) {
  const { players, localPlayerId } = store.getState();
  if (!players) return;
  
  // Check if any player is hit by the explosions
  let playersHit = false;
  
  const updatedPlayers = { ...players };
  
  Object.keys(players).forEach(playerId => {
    const player = players[playerId];
    
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
      
      // If player is completely dead, remove them
      if (updatedPlayers[playerId].lives <= 0) {
        // Remove player from DOM
        const playerElement = document.querySelector(`.player[data-player-id="${playerId}"]`);
        if (playerElement) {
          playerElement.remove();
        }
        
        // If it's the local player, show game over
        if (playerId === localPlayerId) {
          alert('You were killed!');
        }
        
        // Remove from local state
        delete updatedPlayers[playerId];
      }
    }
  });
  
  if (playersHit) {
    // Apply damage to players
    store.setState({ players: updatedPlayers });
  }
}

function checkPowerUpCollection() {
  const { players, powerups, localPlayerId } = store.getState();
  if (!players || !powerups.length) return;
  
  // Make a copy of powerups to track which ones to remove
  let updatedPowerups = [...powerups];
  let powerupsRemoved = false;
  
  // Check each player against each powerup
  Object.values(players).forEach(player => {
    const collectedPowerups = powerups.filter(
      powerup => Math.floor(player.x) === powerup.x && Math.floor(player.y) === powerup.y
    );
    
    if (collectedPowerups.length) {
      // Apply the powerup effects to this player
      let updatedPlayer = { ...player };
      
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
        
        // Remove from DOM
        const powerupElement = document.querySelector(`.powerup[data-powerup-id="${powerup.id}"]`);
        if (powerupElement) {
          powerupElement.remove();
        }
        
        // Track that we need to update state
        powerupsRemoved = true;
      });
      
      // Update this player in the state
      const updatedPlayers = { ...players };
      updatedPlayers[player.id] = updatedPlayer;
      store.setState({ players: updatedPlayers });
      
      // Filter out collected powerups
      updatedPowerups = updatedPowerups.filter(
        powerup => !collectedPowerups.some(collected => collected.id === powerup.id)
      );
    }
  });
  
  // Update powerups state if any were collected
  if (powerupsRemoved) {
    store.setState({ powerups: updatedPowerups });
  }
}

// Game loop
function gameLoop() {
  checkPowerUpCollection();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);