export function generateGrid(size, seed) {
    const rand = (function rng(s) {
      let n = s >>> 0;
      return () => (n = (n * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    })(seed);
  
    const grid = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        let type = 'empty';
        if (x % 2 === 0 && y % 2 === 0) type = 'wall';
        else if (rand() < 0.3) type = 'block';
        row.push({ x, y, type });
      }
      grid.push(row);
    }
    /* clear the four spawn zones */
    [[1,1],[1,size-2],[size-2,1],[size-2,size-2]].forEach(([cx,cy])=>{
      grid[cy][cx].type='empty';
      grid[cy][cx+1].type='empty';
      grid[cy+1][cx].type='empty';
    });
    return grid;
  }