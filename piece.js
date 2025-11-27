// Piece utilities: rotations, orientations, normalization
const PieceUtils = (function() {
  'use strict';
  
  // Note: Config.SIZE must be available when initializePieces is called
  
  // Piece definitions
  const PIECES = [
    {id:'I1',cells:[[0,0]],name:'I1'},
    {id:'I2',cells:[[0,0],[1,0]],name:'I2'},
    {id:'I3',cells:[[0,0],[1,0],[2,0]],name:'I3'},
    {id:'L3',cells:[[0,0],[0,1],[1,0]],name:'L3'},
    {id:'I4',cells:[[0,0],[1,0],[2,0],[3,0]],name:'I4'},
    {id:'L4',cells:[[1,1],[0,1],[0,2],[0,3]],name:'L4'},
    {id:'O4',cells:[[0,0],[1,0],[0,1],[1,1]],name:'O4'},
    {id:'T4',cells:[[0,0],[1,1],[1,0],[2,0]],name:'T4'},
    {id:'S4',cells:[[1,0],[2,0],[0,1],[1,1]],name:'S4'},
    {id:'I5',cells:[[0,0],[1,0],[2,0],[3,0],[4,0]],name:'I5'},
    {id:'P5',cells:[[1,0],[0,1],[1,1],[2,1],[1,2]],name:'P5'},
    {id:'L5',cells:[[1,1],[0,1],[0,2],[0,3],[0,4]],name:'L5'},
    {id:'L5b',cells:[[2,1],[1,1],[0,1],[0,2],[0,3]],name:'L5b'},
    {id:'L5c',cells:[[2,1],[1,1],[1,2],[1,3],[0,2]],name:'L5c'},
    {id:'S5',cells:[[1,0],[2,0],[0,1],[1,1],[3,0]],name:'S5'},
    {id:'S5b',cells:[[1,0],[2,0],[1,1],[1,2],[0,2]],name:'S5b'},
    {id:'C5',cells:[[1,0],[2,0],[3,0],[1,1],[3,1]],name:'C5'},
    {id:'M5',cells:[[1,0],[2,0],[0,1],[1,1],[0,2]],name:'M5'},
    {id:'O5',cells:[[0,0],[1,0],[0,1],[1,1],[2,1]],name:'O5'},
    {id:'T5',cells:[[0,0],[1,1],[1,0],[2,0],[3,0]],name:'T5'},
    {id:'T5b',cells:[[0,0],[1,1],[1,0],[2,0],[1,2]],name:'T5b'},
  ];

  // Precompute all unique orientations for each piece (performance optimization)
  const PIECE_ORIENTATIONS = new Map();
  // Precomputed placement cache: placementCache[pieceId][orientationKey][y][x] = adjustedCells[]
  const placementCache = {};
  // Precomputed bounding boxes: boundingBoxCache[pieceId][orientationKey] = {minX, minY, maxX, maxY}
  const boundingBoxCache = {};

  // Normalize orientation by translating to origin and sorting
  function normalizeOrientation(cells){
    const minX = Math.min(...cells.map(c => c[0]));
    const minY = Math.min(...cells.map(c => c[1]));
    return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => {
      if(a[1] !== b[1]) return a[1] - b[1];
      return a[0] - b[0];
    });
  }

  // Convert normalized cells array to string key for fast comparison
  function orientationToKey(cells){
    return cells.map(c => c.join(',')).join(';');
  }

  // Compute adjusted placement for a given orientation and board position
  function isInsideBoardInline(cells, size){
    return cells.every(([x,y]) => x >= 0 && x < size && y >= 0 && y < size);
  }

  function computeAdjustedPlacement(orientation, boardX, boardY, size){
    const minX = Math.min(...orientation.map(c => c[0]));
    const minY = Math.min(...orientation.map(c => c[1]));
    const maxX = Math.max(...orientation.map(c => c[0]));
    const maxY = Math.max(...orientation.map(c => c[1]));
    
    // Calculate initial placement
    let placed = orientation.map(([cx, cy]) => [boardX + (cx - minX), boardY + (cy - minY)]);
    
    // Adjust placement if it would go out of bounds
    let adjustedX = boardX, adjustedY = boardY;
    if(!isInsideBoardInline(placed, size)){
      if(boardX + maxX >= size) adjustedX = size - 1 - maxX;
      if(boardY + maxY >= size) adjustedY = size - 1 - maxY;
      if(adjustedX < 0) adjustedX = 0;
      if(adjustedY < 0) adjustedY = 0;
      placed = orientation.map(([cx, cy]) => [adjustedX + (cx - minX), adjustedY + (cy - minY)]);
    }
    
    return placed;
  }

  // Initialize orientations and caches for all pieces
  function initializePieces(size){
    PIECES.forEach(piece => {
      const orientations = [];
      const seen = new Set(); // Use Set for O(1) lookup instead of O(n) array search
      let cells = piece.cells.map(c => [c[0], c[1]]); // Start with fresh copy
      
      // Initialize caches for this piece
      placementCache[piece.id] = {};
      boundingBoxCache[piece.id] = {};
      
      // Generate all 4 rotations (0°, 90°, 180°, 270°)
      for(let rot = 0; rot < 4; rot++){
        const normalized = normalizeOrientation(cells);
        const key = orientationToKey(normalized);
        
        // Check if we've seen this orientation before (deduplicate symmetric pieces)
        if(!seen.has(key)){
          orientations.push(normalized);
          seen.add(key);
          
          // Precompute bounding box for this orientation
          boundingBoxCache[piece.id][key] = {
            minX: Math.min(...normalized.map(c => c[0])),
            minY: Math.min(...normalized.map(c => c[1])),
            maxX: Math.max(...normalized.map(c => c[0])),
            maxY: Math.max(...normalized.map(c => c[1]))
          };
          
          // Precompute all adjusted placements for this orientation
          placementCache[piece.id][key] = Array.from({length: size}, () => []);
          for(let y = 0; y < size; y++){
            placementCache[piece.id][key][y] = Array.from({length: size}, () => null);
            for(let x = 0; x < size; x++){
              const adjusted = computeAdjustedPlacement(normalized, x, y, size);
              // Only store if placement is valid (inside board)
              if(isInsideBoardInline(adjusted, size)){
                placementCache[piece.id][key][y][x] = adjusted;
              }
            }
          }
          
          // Also generate flipped version of this rotation (for flipPiece to find)
          const flipped = normalized.map(([x, y]) => [-x, y]);
          const flippedNormalized = normalizeOrientation(flipped);
          const flippedKey = orientationToKey(flippedNormalized);
          
          // If flipped version is different, add it to orientations
          if(!seen.has(flippedKey)){
            orientations.push(flippedNormalized);
            seen.add(flippedKey);
            
            // Precompute bounding box for flipped orientation
            boundingBoxCache[piece.id][flippedKey] = {
              minX: Math.min(...flippedNormalized.map(c => c[0])),
              minY: Math.min(...flippedNormalized.map(c => c[1])),
              maxX: Math.max(...flippedNormalized.map(c => c[0])),
              maxY: Math.max(...flippedNormalized.map(c => c[1]))
            };
            
            // Precompute placements for flipped orientation
            placementCache[piece.id][flippedKey] = Array.from({length: size}, () => []);
            for(let y = 0; y < size; y++){
              placementCache[piece.id][flippedKey][y] = Array.from({length: size}, () => null);
              for(let x = 0; x < size; x++){
                const adjusted = computeAdjustedPlacement(flippedNormalized, x, y, size);
                if(isInsideBoardInline(adjusted, size)){
                  placementCache[piece.id][flippedKey][y][x] = adjusted;
                }
              }
            }
          }
        }
        
        // Rotate for next iteration: (x, y) -> (y, -x)
        // Always create new array, don't mutate
        cells = cells.map(([x, y]) => [y, -x]);
      }
      
      PIECE_ORIENTATIONS.set(piece.id, orientations);
    });
  }

  // Get current orientation cells from precomputed orientations
  function getCurrentOrientation(pieceId, orientationIndex){
    if(!pieceId) return [];
    const orientations = PIECE_ORIENTATIONS.get(pieceId);
    if(!orientations || orientations.length === 0) return [];
    const index = orientationIndex % orientations.length;
    return orientations[index];
  }

  // Rotate piece to next orientation
  function rotatePiece(pieceId, orientationIndex){
    const orientations = PIECE_ORIENTATIONS.get(pieceId);
    if(!orientations || orientations.length === 0) return orientationIndex;
    return (orientationIndex + 1) % orientations.length;
  }

  // Flip piece to find matching flipped orientation
  function flipPiece(pieceId, orientationIndex){
    const orientations = PIECE_ORIENTATIONS.get(pieceId);
    if(!orientations || orientations.length === 0) return orientationIndex;
    
    const currentCells = getCurrentOrientation(pieceId, orientationIndex);
    const currentKey = orientationToKey(currentCells);
    
    // Generate what the flipped version would be
    const flipped = currentCells.map(([x, y]) => [-x, y]);
    const flippedNormalized = normalizeOrientation(flipped);
    const flippedKey = orientationToKey(flippedNormalized);
    
    // Find matching orientation in precomputed list
    const flippedIndex = orientations.findIndex(orient => orientationToKey(orient) === flippedKey);
    if(flippedIndex !== -1){
      return flippedIndex;
    }
    
    return orientationIndex; // Return current if no match found
  }

  // Convert piece cells to 5x5 grid positions (normalized and centered)
  function pieceToGrid(piece){
    const cells = normalizeOrientation(piece.cells);
    const width = Math.max(...cells.map(c => c[0])) + 1;
    const height = Math.max(...cells.map(c => c[1])) + 1;

    // Fit into 5×5 simply by centering
    const offsetX = Math.floor((5 - width) / 2);
    const offsetY = Math.floor((5 - height) / 2);

    return cells.map(([x, y]) => [x + offsetX, y + offsetY]);
  }

  // Public API
  return {
    PIECES,
    PIECE_ORIENTATIONS,
    placementCache,
    boundingBoxCache,
    normalizeOrientation,
    orientationToKey,
    initializePieces,
    getCurrentOrientation,
    rotatePiece,
    flipPiece,
    pieceToGrid
  };
})();

