import { createApp, createElement, store } from '../src/index.js';
import { NicknameForm } from './components/NicknameForm.js';
import { Lobby }        from './components/Lobby.js';

store.setState({
  gameState : 'init',   // init | lobby | playing | gameOver
  nickname  : null,
  lobby     : { players: [] },
  socket    : null,
  chatDraft : '' 
});

/*  connect to our raw WebSocket server  */
function connectWS() {
  const ws = new WebSocket('ws://localhost:8080');

  ws.addEventListener('open', () => console.log('🔌 WS connected'));
  ws.addEventListener('message', evt => {
    const { type, payload } = JSON.parse(evt.data);
  
    if (type === 'lobbyUpdate')
      store.setState({ lobby: { players: payload }});
  
    if (type === 'lobbyState')
      store.setState({ lobbyState: payload });
  
    if (type === 'chat') {
      const { chatMessages = [] } = store.getState();
      store.setState({ chatMessages: [...chatMessages, payload] });
    }
  
    if (type === 'gameStart') {
      store.setState({ gameState: 'playing' });
    }
  });
  ws.addEventListener('close', () => {
    console.warn('WS closed – retrying in 3 s');
    setTimeout(connectWS, 3000);
  });

  store.setState({ socket: ws });
}
connectWS();

/* ---------- root component --------------------------------------------- */
function Root() {
  const { gameState } = store.getState();

  if (gameState === 'init')    return NicknameForm();
  if (gameState === 'lobby')   return Lobby();
  if (gameState === 'playing') return GameApp();   // your existing game
  if (gameState === 'gameOver')return createElement('h1', {}, 'Game Over');
}

/* ---------- mount via mini-framework ----------------------------------- */
const app = createApp('#app');
store.subscribe(() => app.mount(Root));
app.mount(Root);

const CELL_SIZE = 40;
const GRID_SIZE = 15;

// Debugging helper
function logAssetLoad(type, path) {
  console.log(`Loading ${type} asset: ${path}`);
}

// Initial game state
store.setState({
    gameState: 'init', 
    map: {
      size: GRID_SIZE, 
      grid: [], 
    },
    players: [
      {
        id: 1,
        x: 1,
        y: 1,
        lives: 3,
        speed: 1,
        bombCount: 1,
        bombRange: 1,
        direction: 'front' 
      }
    ],
    bombs: [],
    powerups: [],
    explosions: []
  });

// Generate initial map
function generateMap() {
  const { map } = store.getState();
  const { size } = map;
  const grid = [];
  
  // Create the grid
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      let cellType = 'empty';
      
      // Create walls in a pattern (every other row and column)
      if (x % 2 === 0 && y % 2 === 0) {
        cellType = 'wall';
      } 
      // Add some random blocks (except at player spawn points)
      else if (Math.random() < 0.3 && 
              !((x < 2 && y < 2) || // top-left spawn
                (x < 2 && y > size - 3) || // bottom-left spawn
                (x > size - 3 && y < 2) || // top-right spawn
                (x > size - 3 && y > size - 3))) { // bottom-right spawn
        cellType = 'block';
      }
      
      row.push({
        x,
        y,
        type: cellType
      });
    }
    grid.push(row);
  }
  
  // Ensure player spawn point is clear
  if (grid[1] && grid[1][1]) {
    grid[1][1].type = 'empty';
  }
  
  // Update the store
  store.setState({
    map: {
      ...map,
      grid
    }
  });
}

// Player Component - Create DOM elements for players
function renderPlayers() {
    const { players } = store.getState();
    const playerElements = [];
    
    players.forEach(player => {
      const playerElement = document.createElement('div');
      playerElement.className = `player player-${player.id}`;
      playerElement.style.left = `${player.x * CELL_SIZE}px`;
      playerElement.style.top = `${player.y * CELL_SIZE}px`;
      playerElement.dataset.playerId = player.id;
      
      // Set the default direction to 'front'
      const direction = player.direction || 'front';
      playerElement.dataset.direction = direction;
      
      // Add class for the direction instead of setting style directly
      playerElement.classList.add(`player-direction-${direction}`);
      
      // Set the background image after the element is added to the DOM
      setTimeout(() => {
        playerElement.style.backgroundImage = `url('./assets/${direction}.png')`;
      }, 0);
      
      playerElements.push(playerElement);
    });
    
    return playerElements;
}

// Components
function GameTitle() {
  return createElement('h1', { class: 'game-title' }, 'Bomberman DOM');
}

function GameGrid() {
  const { map, bombs, powerups, explosions } = store.getState();
  const { grid } = map;
  
  console.log("Creating game grid with cells:", grid.length * grid[0].length);
  
  // Create the grid cells
  const gridElement = createElement('div', { class: 'game-grid' },
    ...grid.flat().map(cell => {
      const cellElement = createElement('div', { 
        class: `cell cell-${cell.type}`,
        'data-x': cell.x,
        'data-y': cell.y,
        'data-cell-type': cell.type 
      });
      
      return cellElement;
    })
  );
  
  // Create the game container
  const gameContainer = createElement('div', { class: 'game-container' }, gridElement);
  
  // After the component is mounted, add the player and dynamic elements
  setTimeout(() => {
    const container = document.querySelector('.game-container');
    if (container) {
      console.log('Game container found, updating cells and adding entities');
      
      // Update cell background images after mounting
      document.querySelectorAll('.cell').forEach(cell => {
        const cellType = cell.dataset.cellType;
        if (cellType === 'wall') {
          cell.style.backgroundImage = "url('./assets/wall.png')";
        } else if (cellType === 'block') {
          cell.style.backgroundImage = "url('./assets/block.png')";
        } else if (cellType === 'empty') {
          cell.style.backgroundImage = "url('./assets/floor.png')";
        }
      });
      
      // Remove existing dynamic elements to avoid duplicates
      container.querySelectorAll('.player, .bomb, .powerup, .explosion').forEach(el => el.remove());
      
      // Add players
      renderPlayers().forEach(player => {
        container.appendChild(player);
      });
      
      // Add bombs
      bombs.forEach(bomb => {
        addBombElementToDOM(bomb);
      });
      
      // Add power-ups
      powerups.forEach(powerup => {
        addPowerUpToDOM(powerup);
      });
      
      // Add explosions
      explosions.forEach(explosion => {
        addExplosionToDOM(explosion);
      });
    } else {
      console.error('Game container not found!');
    }
  }, 0);
  
  return gameContainer;
}
  

function PlayerInfo() {
  const { players } = store.getState();
  const player = players[0]; // Get first player
  
  return createElement('div', { class: 'player-info' },
    createElement('div', { class: 'player-lives' }, `Lives: ${player.lives}`),
    createElement('div', { class: 'player-bombs' }, `Bombs: ${player.bombCount}`),
    createElement('div', { class: 'player-range' }, `Range: ${player.bombRange}`),
    createElement('div', { class: 'player-speed' }, `Speed: ${player.speed}`)
  );
}

function GameApp() {
  const { map } = store.getState();

  // Create grid once
  if (!map.grid.length) generateMap();

  return createElement(
    'div',
    { class: 'game-app' },
    GameTitle(),
    PlayerInfo(),
    GameGrid()
  );
}
// Movement handling with delay to prevent janky movement
let isMoving = false;
const moveDelay = 150; // ms between moves

// Update the handleKeyDown function to change player direction
function handleKeyDown(e) {
  if (isMoving || store.getState().gameState !== 'playing') return;
  
  const { players, localPlayerId } = store.getState();
  if (!localPlayerId || !players || !players[localPlayerId]) return;
  
  const player = players[localPlayerId];
  
  let newX = player.x;
  let newY = player.y;
  let newDirection = player.direction;
  
  switch (e.key) {
    case 'ArrowUp':
      newY -= player.speed;
      newDirection = 'back';
      break;
    case 'ArrowDown':
      newY += player.speed;
      newDirection = 'front';
      break;
    case 'ArrowLeft':
      newX -= player.speed;
      newDirection = 'left';
      break;
    case 'ArrowRight':
      newX += player.speed;
      newDirection = 'right';
      break;
    case ' ': // Space bar to place bombs
      placeBomb(player);
      return;
    default:
      return; // Don't handle other keys
  }
  
  // Update direction even if we can't move
  if (newDirection !== player.direction) {
    const updatedPlayers = { ...players };
    updatedPlayers[localPlayerId] = {
      ...player,
      direction: newDirection
    };
    
    store.setState({ players: updatedPlayers });
    
    // Update player sprite without full re-render
    updatePlayerSprite(player.id, newDirection);
    
    // Send direction update to server
    sendPlayerMove(player.x, player.y, newDirection);
  }
  
  // Simple collision detection for movement
  if (isValidMove(newX, newY)) {
    isMoving = true;
    
    const updatedPlayers = { ...players };
    updatedPlayers[localPlayerId] = {
      ...player,
      x: newX,
      y: newY,
      direction: newDirection
    };
    
    store.setState({ players: updatedPlayers });
    
    updatePlayerPosition(player.id, newX, newY);
    
    // Send movement to server
    sendPlayerMove(newX, newY, newDirection);
    
    // Reset moving flag after delay
    setTimeout(() => {
      isMoving = false;
    }, moveDelay);
  }
}
  
  function updatePlayerSprite(playerId, direction) {
    const playerElement = document.querySelector(`.player[data-player-id="${playerId}"]`);
    if (playerElement) {
      playerElement.dataset.direction = direction;
      const assetPath = `./assets/${direction}.png`;
      logAssetLoad('player update', assetPath);
      playerElement.style.backgroundImage = `url('${assetPath}')`;
    }
  }
  
  function updatePlayerPosition(playerId, x, y) {
    const playerElement = document.querySelector(`.player[data-player-id="${playerId}"]`);
    if (playerElement) {
      playerElement.style.left = `${x * CELL_SIZE}px`;
      playerElement.style.top = `${y * CELL_SIZE}px`;
    }
  }

// Setup keyboard controls
function setupKeyboardControls() {
  document.addEventListener('keydown', handleKeyDown);
}

// Check if the move is valid
function isValidMove(x, y) {
  const { map, bombs } = store.getState();
  const { size, grid } = map;
  
  // Check boundaries
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return false;
  }
  
  // Check for walls and blocks
  if (grid[y] && grid[y][x]) {
    const cell = grid[y][x];
    if (cell.type !== 'empty') {
      return false;
    }
  } else {
    return false;
  }
  
  // Check for bombs
  const bombAtPosition = bombs.some(bomb => bomb.x === x && bomb.y === y);
  if (bombAtPosition) {
    return false;
  }
  
  return true;
}

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
  bombElement.style.left = `${bomb.x * CELL_SIZE}px`;
  bombElement.style.top = `${bomb.y * CELL_SIZE}px`;
  bombElement.dataset.bombId = bomb.id;
  bombElement.dataset.stage = bomb.stage;
  
  // Fix the path to use relative path consistently
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

// Explosion logic
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
    { dx: 0, dy: 1, name: 'down' },  // Down
    { dx: -1, dy: 0, name: 'left' }, // Left
    { dx: 1, dy: 0, name: 'right' }   // Right
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

// Update cell type in the DOM
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

// Spawn a power-up at the given position
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
  powerUpElement.style.left = `${powerUp.x * CELL_SIZE + CELL_SIZE/2}px`;
  powerUpElement.style.top = `${powerUp.y * CELL_SIZE + CELL_SIZE/2}px`;
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

// Add explosion to DOM
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
    explosionElement.style.left = `${explosion.x * CELL_SIZE}px`;
    explosionElement.style.top = `${explosion.y * CELL_SIZE}px`;
    explosionElement.dataset.x = explosion.x;
    explosionElement.dataset.y = explosion.y;
    
    container.appendChild(explosionElement);
  }
}

// Remove explosions from DOM and state
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

// Check for players in explosion area
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



// Game over function
function gameOver() {
  store.setState({ gameState: 'gameOver' });
  alert('Game Over! You lost all your lives.');
  // In a full implementation, we'd show a game over screen
  // and allow the player to restart
}

// Check for power-up collection
function checkPowerUpCollection() {
  const { players, powerups } = store.getState();
  
  players.forEach(player => {
    // Find any power-up at the player's position
    const powerUpIndex = powerups.findIndex(
      powerUp => powerUp.x === player.x && powerUp.y === player.y
    );
    
    if (powerUpIndex !== -1) {
      const powerUp = powerups[powerUpIndex];
      
      // Apply power-up effect
      applyPowerUp(player, powerUp);
      
      // Remove power-up from game
      const updatedPowerUps = [...powerups];
      updatedPowerUps.splice(powerUpIndex, 1);
      
      // Remove from DOM
      const powerUpElement = document.querySelector(`.powerup[data-powerup-id="${powerUp.id}"]`);
      if (powerUpElement) {
        powerUpElement.remove();
      }
      
      // Update state
      store.setState({ powerups: updatedPowerUps });
    }
  });
}

// Apply power-up effect to player
function applyPowerUp(player, powerUp) {
  const { players } = store.getState();
  let updatedPlayer = { ...player };
  
  switch (powerUp.type) {
    case 'bomb':
      // Increase bomb count
      updatedPlayer.bombCount += 1;
      break;
    case 'flame':
      // Increase explosion range
      updatedPlayer.bombRange += 1;
      break;
    case 'speed':
      // Increase speed
      updatedPlayer.speed += 0.5;
      break;
  }
  
  // Update player in state
  const updatedPlayers = players.map(p => 
    p.id === player.id ? updatedPlayer : p
  );
  
  store.setState({ players: updatedPlayers });
}

// Check assets
function checkAssets() {
    const assetPaths = [
      './assets/front.png',
      './assets/back.png',
      './assets/left.png',
      './assets/right.png',
      './assets/wall.png',
      './assets/block.png',
      './assets/floor.png',
      './assets/bomb1.png',
      './assets/bomb2.png',
      './assets/bomb3.png',
      './assets/pubomb.png',
      './assets/pubigbomb.png',
      './assets/puspeed.png'
    ];
    
    console.log('Checking asset availability...');
    assetPaths.forEach(path => {
      const img = new Image();
      img.onload = () => console.log(`✅ Asset loaded: ${path}`);
      img.onerror = () => console.error(`❌ Asset failed to load: ${path}`);
      img.src = path;
    });
  }
// Game loop
function gameLoop() {
  // Check for power-up collections
  checkPowerUpCollection();
  
  // Continue game loop
  requestAnimationFrame(gameLoop);
}

function init() {
  // subscribe once and mount
  store.subscribe(() => app.mount(Root));
  setupKeyboardControls();
  requestAnimationFrame(gameLoop);
  app.mount(Root);
}

// Render function
function render() {
  console.log("Rendering game...");
  app.mount(GameApp());
}

// Start the game
init();