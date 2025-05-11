import { createApp, createElement, store } from '../src/index.js';

const app = createApp('#app');

// Cell size from CSS
const CELL_SIZE = 40;
const GRID_SIZE = 15;

// Initial game state
store.setState({
  gameState: 'init', 
  map: {
    size: GRID_SIZE, 
    grid: [], 
  },
  players: [
    // Add a single player at a valid spawn point inside the grid
    {
      id: 1,
      x: 1, // Start at a position that's definitely inside and clear
      y: 1,
      lives: 3,
      speed: 1,
      bombCount: 1,
      bombRange: 1
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
    
    playerElements.push(playerElement);
  });
  
  return playerElements;
}

// Components
function GameTitle() {
  return createElement('h1', { class: 'game-title' }, 'Bomberman DOM');
}

function GameGrid() {
  const { map } = store.getState();
  const { grid } = map;
  
  // Create the grid cells
  const gridElement = createElement('div', { class: 'game-grid' },
    ...grid.flat().map(cell => 
      createElement('div', { 
        class: `cell cell-${cell.type}`,
        'data-x': cell.x,
        'data-y': cell.y
      })
    )
  );
  
  // Create the game container
  const gameContainer = createElement('div', { class: 'game-container' }, gridElement);
  
  // After the component is mounted, add the player elements
  setTimeout(() => {
    const container = document.querySelector('.game-container');
    if (container) {
      // Remove any existing players
      const existingPlayers = container.querySelectorAll('.player');
      existingPlayers.forEach(p => p.remove());
      
      // Add new player elements
      renderPlayers().forEach(player => {
        container.appendChild(player);
      });
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
  const { gameState, map } = store.getState();
  
  if (!map.grid.length) {
    generateMap();
    return GameApp(); // Re-render with the generated map
  }
  
  return createElement('div', { class: 'game-app' },
    GameTitle(),
    PlayerInfo(),
    GameGrid()
  );
}

// Movement handling with delay to prevent janky movement
let isMoving = false;
const moveDelay = 150; // ms between moves

function handleKeyDown(e) {
  if (isMoving) return;
  
  const { players } = store.getState();
  const player = players[0]; // First player
  
  let newX = player.x;
  let newY = player.y;
  
  switch (e.key) {
    case 'ArrowUp':
      newY -= player.speed;
      break;
    case 'ArrowDown':
      newY += player.speed;
      break;
    case 'ArrowLeft':
      newX -= player.speed;
      break;
    case 'ArrowRight':
      newX += player.speed;
      break;
    case ' ': // Space bar to place bombs
      placeBomb(player);
      return;
    default:
      return; // Don't handle other keys
  }
  
  // Simple collision detection
  if (isValidMove(newX, newY)) {
    isMoving = true;
    
    store.setState({
      players: players.map(p => 
        p.id === player.id ? { ...p, x: newX, y: newY } : p
      )
    });
    
    // Update player position visually without re-rendering the whole app
    updatePlayerPosition(player.id, newX, newY);
    
    // Reset moving flag after delay
    setTimeout(() => {
      isMoving = false;
    }, moveDelay);
  }
}

// Update player position directly in the DOM
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

// Place a bomb
function placeBomb(player) {
  const { bombs } = store.getState();
  
  // Check if player has bombs available
  if (bombs.filter(bomb => bomb.playerId === player.id).length >= player.bombCount) {
    return; // Can't place more bombs
  }
  
  // Check if there's already a bomb at this position
  if (bombs.some(bomb => bomb.x === player.x && bomb.y === player.y)) {
    return; // Can't place bomb here
  }
  
  // Create a new bomb
  const newBomb = {
    id: Date.now(),
    playerId: player.id,
    x: player.x,
    y: player.y,
    range: player.bombRange,
    timer: 3000, // 3 seconds until explosion
    countdown: 3 // Visual countdown
  };
  
  // Add to bombs list
  store.setState({
    bombs: [...bombs, newBomb]
  });
  
  // Add bomb to the DOM
  addBombToDOM(newBomb);
  
  // Start bomb countdown animation
  startBombCountdown(newBomb);
  
  // Start bomb timer
  setTimeout(() => {
    explodeBomb(newBomb);
  }, newBomb.timer);
}

// Add bomb to DOM without re-rendering
function addBombToDOM(bomb) {
  const container = document.querySelector('.game-container');
  if (container) {
    const bombElement = document.createElement('div');
    bombElement.className = 'bomb';
    bombElement.style.left = `${(bomb.x + 0.5) * CELL_SIZE}px`;
    bombElement.style.top = `${(bomb.y + 0.5) * CELL_SIZE}px`;
    bombElement.dataset.bombId = bomb.id;
    
    // Add countdown text element
    const countdownElement = document.createElement('div');
    countdownElement.className = 'countdown';
    countdownElement.textContent = bomb.countdown;
    bombElement.appendChild(countdownElement);
    
    container.appendChild(bombElement);
  }
}

// Start bomb countdown animation
function startBombCountdown(bomb) {
  let countdown = bomb.countdown;
  const countdownInterval = setInterval(() => {
    countdown--;
    
    // Update countdown display
    const countdownElement = document.querySelector(`.bomb[data-bomb-id="${bomb.id}"] .countdown`);
    if (countdownElement) {
      countdownElement.textContent = countdown;
    }
    
    if (countdown <= 0 || !document.querySelector(`.bomb[data-bomb-id="${bomb.id}"]`)) {
      clearInterval(countdownInterval);
    }
  }, 1000);
}

// Remove bomb from DOM without re-rendering
function removeBombFromDOM(bombId) {
  const bombElement = document.querySelector(`.bomb[data-bomb-id="${bombId}"]`);
  if (bombElement) {
    bombElement.remove();
  }
}

// Bomb explosion
function explodeBomb(bomb) {
  const { bombs, map, explosions, players } = store.getState();
  const { grid } = map;
  
  // Remove this bomb from the bombs array
  const updatedBombs = bombs.filter(b => b.id !== bomb.id);
  
  // Create explosions array
  const newExplosions = [];
  
  // Add center explosion
  newExplosions.push({ x: bomb.x, y: bomb.y, type: 'center' });
  
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
        
        // Update the store with the new grid
        store.setState({
          map: {
            ...map,
            grid: updatedGrid
          }
        });
        
        // Update the cell visually
        updateCellType(newX, newY, 'empty');
        
        // Potentially spawn a power-up (30% chance)
        if (Math.random() < 0.3) {
          spawnPowerUp(newX, newY);
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
  removeBombFromDOM(bomb.id);
  
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
  
  // Clean up explosions after animation
  setTimeout(() => {
    removeExplosions(newExplosions);
  }, 1000);
}

// Update cell type in the DOM
function updateCellType(x, y, newType) {
  const cellElement = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (cellElement) {
    cellElement.className = `cell cell-${newType}`;
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
  
  // Add to DOM
  addPowerUpToDOM(newPowerUp);
}

// Add power-up to DOM
function addPowerUpToDOM(powerUp) {
  const container = document.querySelector('.game-container');
  if (container) {
    const powerUpElement = document.createElement('div');
    powerUpElement.className = `powerup powerup-${powerUp.type}`;
    powerUpElement.style.left = `${(powerUp.x + 0.5) * CELL_SIZE}px`;
    powerUpElement.style.top = `${(powerUp.y + 0.5) * CELL_SIZE}px`;
    powerUpElement.dataset.powerupId = powerUp.id;
    
    container.appendChild(powerUpElement);
  }
}

// Add explosion to DOM
function addExplosionToDOM(explosion) {
  const container = document.querySelector('.game-container');
  if (container) {
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
  const { players } = store.getState();
  
  // Check if any player is hit by the explosions
  let playersHit = false;
  
  const updatedPlayers = players.map(player => {
    // Check if this player is in any explosion area
    const isHit = explosions.some(explosion => 
      explosion.x === player.x && explosion.y === player.y
    );
    
    if (isHit) {
      playersHit = true;
      // Reduce player lives
      return {
        ...player,
        lives: player.lives - 1
      };
    }
    
    return player;
  });
  
  if (playersHit) {
    // Apply damage to players
    store.setState({ players: updatedPlayers });
    
    // Check for game over
    if (updatedPlayers[0].lives <= 0) {
      gameOver();
    }
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

// Game loop
function gameLoop() {
  // Check for power-up collections
  checkPowerUpCollection();
  
  // Continue game loop
  requestAnimationFrame(gameLoop);
}

// Initialize
function init() {
  // Subscribe to state changes
  store.subscribe(render);
  
  // Setup keyboard controls
  setupKeyboardControls();
  
  // Start game loop
  requestAnimationFrame(gameLoop);
  
  // Initial render
  render();
}

// Render function
function render() {
  app.mount(GameApp());
}

// Start the game
init();