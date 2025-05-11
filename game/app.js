import { createApp, createElement, store } from '../src/index.js';

const app = createApp('#app');

// Initial game state
store.setState({
  gameState: 'init', 
  map: {
    size: 15, 
    grid: [], 
  },
  players: [
    // Add a single player for testing
    {
      id: 1,
      x: 1,
      y: 1,
      lives: 3,
      speed: 1,
      bombCount: 1,
      bombRange: 1
    }
  ], 
  bombs: [], 
  powerups: [] 
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
  
  // Update the store
  store.setState({
    map: {
      ...map,
      grid
    }
  });
}

// Player Component
function PlayerElements() {
  const { players } = store.getState();
  const cellSize = 40; // Should match CSS --cell-size
  
  return players.map(player => 
    createElement('div', {
      class: `player player-${player.id}`,
      style: `transform: translate(${player.x * cellSize}px, ${player.y * cellSize}px);`,
      'data-player-id': player.id
    })
  );
}

// Components
function GameTitle() {
  return createElement('h1', { class: 'game-title' }, 'Bomberman DOM');
}

function GameGrid() {
  const { map } = store.getState();
  const { grid } = map;
  
  return createElement('div', { class: 'game-container' },
    createElement('div', { class: 'game-grid' },
      ...grid.flat().map(cell => 
        createElement('div', { 
          class: `cell cell-${cell.type}`,
          'data-x': cell.x,
          'data-y': cell.y
        })
      )
    ),
    PlayerElements() // Add players to the grid
  );
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

// Basic keyboard controls
function setupKeyboardControls() {
  document.addEventListener('keydown', (e) => {
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
      store.setState({
        players: players.map(p => 
          p.id === player.id ? { ...p, x: newX, y: newY } : p
        )
      });
    }
  });
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
  const cell = grid[y][x];
  if (cell.type !== 'empty') {
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
    timer: 3000 // 3 seconds until explosion
  };
  
  // Add to bombs list
  store.setState({
    bombs: [...bombs, newBomb]
  });
  
  // Start bomb timer
  setTimeout(() => {
    explodeBomb(newBomb);
  }, newBomb.timer);
}

// Bomb explosion
function explodeBomb(bomb) {
  const { bombs, map } = store.getState();
  const { grid } = map;
  
  // Remove this bomb from the bombs array
  const updatedBombs = bombs.filter(b => b.id !== bomb.id);
  
  // Create explosions array
  const explosions = [];
  explosions.push({ x: bomb.x, y: bomb.y }); // Center
  
  // Check in all four directions
  const directions = [
    { dx: 0, dy: -1 }, // Up
    { dx: 0, dy: 1 },  // Down
    { dx: -1, dy: 0 }, // Left
    { dx: 1, dy: 0 }   // Right
  ];
  
  // Update state with explosions
  store.setState({ bombs: updatedBombs });
  
  // For a full implementation, we would:
  // 1. Check for blocks to destroy
  // 2. Check for players hit
  // 3. Animate explosions
  // 4. Generate power-ups
}

// Game loop
function gameLoop() {
  // This will be used for animations and time-based updates
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