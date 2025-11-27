// Game state: currentPlayer, history, usedPieces, board
const GameState = (function() {
  'use strict';
  
  let board = [];
  let currentPlayer = 0;
  let usedPieces = {};
  let history = [];
  let validMovesCache = {};

  // Initialize game state
  function init(size, players){
    board = Array.from({length: size}, () => Array.from({length: size}, () => null));
    usedPieces = {};
    players.forEach(p => usedPieces[p.id] = new Set());
    currentPlayer = 0;
    history = [];
    validMovesCache = {};
    players.forEach(p => validMovesCache[p.id] = undefined);
  }

  // Get current player
  function getCurrentPlayer(){
    return currentPlayer;
  }

  // Set current player
  function setCurrentPlayer(player){
    currentPlayer = player;
  }

  // Get board
  function getBoard(){
    return board;
  }

  // Get used pieces
  function getUsedPieces(){
    return usedPieces;
  }

  // Get history
  function getHistory(){
    return history;
  }

  // Get valid moves cache
  function getValidMovesCache(){
    return validMovesCache;
  }

  // Invalidate valid moves cache for all players
  function invalidateValidMovesCache(players){
    players.forEach(p => validMovesCache[p.id] = undefined);
  }

  // Place piece on board
  function placePiece(placed, player, pieceId){
    placed.forEach(([px, py]) => board[py][px] = {player: player});
    usedPieces[player].add(pieceId);
    history.push({player: player, placed: placed, pid: pieceId});
  }

  // Undo last move
  function undoMove(){
    const last = history.pop();
    if(!last) return null;
    
    if(last.pass){
      return {type: 'pass', player: last.player};
    }
    
    last.placed.forEach(([x, y]) => board[y][x] = null);
    usedPieces[last.player].delete(last.pid);
    return {type: 'move', player: last.player};
  }

  // Add pass to history
  function addPass(player){
    history.push({player: player, pass: true});
  }

  // Get the last piece played by a player (from history)
  function getLastPiecePlayed(playerId){
    // Find the last non-pass move for this player
    for(let i = history.length - 1; i >= 0; i--){
      const move = history[i];
      if(move.player === playerId && !move.pass && move.pid){
        return move.pid;
      }
    }
    return null;
  }

  // Calculate a player's score according to official Blokus rules
  function calculatePlayerScore(playerId, pieces){
    const unusedPieces = pieces.filter(p => !usedPieces[playerId].has(p.id));
    const unplayedSquares = unusedPieces.reduce((total, piece) => total + piece.cells.length, 0);
    let score = -unplayedSquares; // Base score: -1 per unplayed square
    
    // Check if all 21 pieces were played
    if(usedPieces[playerId].size === 21){
      const lastPiece = getLastPiecePlayed(playerId);
      if(lastPiece === 'I1'){ // Monomino bonus
        score += 20;
      } else {
        score += 15;
      }
    }
    
    return score;
  }

  // Public API
  return {
    init,
    getCurrentPlayer,
    setCurrentPlayer,
    getBoard,
    getUsedPieces,
    getHistory,
    getValidMovesCache,
    invalidateValidMovesCache,
    placePiece,
    undoMove,
    addPass,
    getLastPiecePlayed,
    calculatePlayerScore
  };
})();

