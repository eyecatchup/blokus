// Board rules: isInsideBoard, isEmpty, validBlokusContact, placement validation
// Note: This module provides pure functions that take board/state as parameters
const BoardRules = (function() {
  'use strict';
  
  // Check if all cells are inside board bounds
  function isInsideBoard(cells, size){
    return cells.every(([x,y]) => x >= 0 && x < size && y >= 0 && y < size);
  }

  // Check if all cells are empty
  function isEmpty(cells, board){
    return cells.every(([x,y]) => board[y][x] === null);
  }

  // Validate Blokus placement rules
  function validBlokusContact(cells, player, board, size, usedPieces){
    // For first move, must be placed in any corner
    if(usedPieces[player].size === 0){
      const corners = [
        [0, 0],                    // top-left
        [0, size-1],              // bottom-left
        [size-1, 0],              // top-right
        [size-1, size-1]          // bottom-right
      ];
      if(!cells.some(([x,y]) => corners.some(([cx,cy]) => x === cx && y === cy))) return false;
    }
    
    let hasCorner = false;
    for(const [x,y] of cells){
      const sides = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
      for(const [nx,ny] of sides){
        if(nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx] && board[ny][nx].player === player) return false;
      }
      const corners = [[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]];
      for(const [cx,cy] of corners){
        if(cx >= 0 && cx < size && cy >= 0 && cy < size && board[cy][cx] && board[cy][cx].player === player) hasCorner = true;
      }
    }
    if(usedPieces[player].size === 0) return true;
    return hasCorner;
  }

  // Check if a player has any valid moves (with caching)
  function hasValidMoves(player, board, size, usedPieces, pieces, pieceOrientations, placementCache, boundingBoxCache, orientationToKey, isEmpty, validBlokusContact, validMovesCache){
    // Check cache first
    if(validMovesCache[player] !== undefined){
      return validMovesCache[player];
    }
    
    // Get all unused pieces for this player
    const unusedPieces = pieces.filter(p => !usedPieces[player].has(p.id));
    if(unusedPieces.length === 0) {
      validMovesCache[player] = false;
      return false;
    }
    
    // For each unused piece, try all precomputed orientations at all positions
    for(const piece of unusedPieces){
      const orientations = pieceOrientations.get(piece.id);
      if(!orientations) continue;
      
      // Try each orientation at every position on the board
      for(const orientation of orientations){
        const orientationKey = orientationToKey(orientation);
        const bbox = boundingBoxCache[piece.id]?.[orientationKey];
        if(!bbox) continue; // Skip if no bounding box cached
        
        // Try placing at every position using placement cache
        for(let y = 0; y < size; y++){
          for(let x = 0; x < size; x++){
            // Use precomputed placement from cache
            const placed = placementCache[piece.id]?.[orientationKey]?.[y]?.[x];
            if(!placed) continue; // Skip invalid placements
            
            // Check if valid (placement already adjusted and inside board)
            if(isEmpty(placed, board) && validBlokusContact(placed, player, board, size, usedPieces)){
              validMovesCache[player] = true;
              return true; // Found at least one valid move
            }
          }
        }
      }
    }
    
    validMovesCache[player] = false;
    return false; // No valid moves found
  }

  // Get the number of unplayed squares for a player
  function getUnplayedSquares(playerId, usedPieces, pieces){
    const unusedPieces = pieces.filter(p => !usedPieces[playerId].has(p.id));
    return unusedPieces.reduce((total, piece) => total + piece.cells.length, 0);
  }

  // Public API
  return {
    isInsideBoard,
    isEmpty,
    validBlokusContact,
    hasValidMoves,
    getUnplayedSquares
  };
})();

