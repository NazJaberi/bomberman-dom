import { createApp, createElement, store } from '../src/index.js';

const app = createApp('#app');

store.setState({
  gameState: 'init', 
  map: {
    size: 15, 
    grid: [], 
  },
  players: [], 
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
    )
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
    GameGrid()
  );
}

// Render function
function render() {
  app.mount(GameApp());
}

// Subscribe to state changes
store.subscribe(render);

// Initial render
render();