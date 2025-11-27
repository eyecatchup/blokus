// Main: initialization and event binding
(function() {
  'use strict';
  
  // Initialize piece orientations
  PieceUtils.initializePieces(Config.SIZE);
  
  // Create empty drag image
  const emptyDragImage = document.createElement('div');
  emptyDragImage.style.width = '1px';
  emptyDragImage.style.height = '1px';
  emptyDragImage.style.opacity = '0';
  emptyDragImage.style.position = 'absolute';
  emptyDragImage.style.top = '-1000px';
  document.body.appendChild(emptyDragImage);
  
  // Get DOM elements
  const boardEl = document.getElementById('board');
  const paletteEl = document.getElementById('palette');
  const scoresEl = document.getElementById('scores');
  const toastContainer = document.getElementById('toast-container');
  const flipBtn = document.getElementById('flipBtn');
  const rotateBtn = document.getElementById('rotateBtn');
  const passBtn = document.getElementById('passBtn');
  const undoBtn = document.getElementById('undoBtn');
  const restartBtn = document.getElementById('restartBtn');
  const endGameBtn = document.getElementById('endGameBtn');
  
  // Initialize UI
  UI.init({
    boardEl,
    paletteEl,
    scoresEl,
    toastContainer
  });
  
  // Initialize game state
  GameState.init(Config.SIZE, Config.PLAYERS);
  
  // Create shared app namespace
  const BlokusApp = {
    size: Config.SIZE,
    players: Config.PLAYERS,
    piece: PieceUtils,
    board: BoardRules,
    state: GameState,
    ui: UI,
    interaction: Interaction,
    selectedPiece: null,
    selectedPieceElement: null,
    interactionState: Interaction.InteractionState.NONE,
    dragStart: {x: 0, y: 0},
    hoveringCell: null,
    previewCell: null,
    lastHoveredCell: null,
    isPlacing: false,
    emptyDragImage: emptyDragImage,
    get currentPlayer() { return GameState.getCurrentPlayer(); },
    set currentPlayer(val) { GameState.setCurrentPlayer(val); }
  };
  
  // Initialize game
  function init() {
    GameState.init(Config.SIZE, Config.PLAYERS);
    BlokusApp.selectedPiece = null;
    BlokusApp.selectedPieceElement = null;
    BlokusApp.interactionState = Interaction.InteractionState.NONE;
    BlokusApp.dragStart = {x: 0, y: 0};
    BlokusApp.hoveringCell = null;
    BlokusApp.previewCell = null;
    BlokusApp.isPlacing = false;
    
    UI.updateBoardBorder(BlokusApp.currentPlayer, BlokusApp.players);
    UI.renderBoard(GameState.getBoard(), BlokusApp.size, BlokusApp.players, Interaction.createBoardHandlers(BlokusApp));
    UI.renderPalette(BlokusApp.piece.PIECES, BlokusApp.currentPlayer, BlokusApp.players, GameState.getUsedPieces(), Interaction.createPaletteHandlers(BlokusApp), BlokusApp);
    UI.renderScores(BlokusApp.currentPlayer, BlokusApp.players, (playerId) => {
      return GameState.calculatePlayerScore(playerId, BlokusApp.piece.PIECES);
    });
    UI.resizeBoard(BlokusApp.size);
    UI.updateBoardDimensionsCache();
    
    GameState.invalidateValidMovesCache(BlokusApp.players);
    
    document.removeEventListener('touchmove', (e) => Interaction.handleDocumentTouchMove(e, BlokusApp));
    document.addEventListener('touchmove', (e) => Interaction.handleDocumentTouchMove(e, BlokusApp), {passive: false});
  }
  
  // Undo function
  function undo() {
    const result = GameState.undoMove();
    if(!result){
      alert('No moves');
      return;
    }
    
    if(result.type === 'pass'){
      BlokusApp.currentPlayer = result.player;
      UI.updateBoardBorder(BlokusApp.currentPlayer, BlokusApp.players);
      UI.renderPalette(BlokusApp.piece.PIECES, BlokusApp.currentPlayer, BlokusApp.players, GameState.getUsedPieces(), Interaction.createPaletteHandlers(BlokusApp), BlokusApp);
      UI.renderScores(BlokusApp.currentPlayer, BlokusApp.players, (playerId) => {
        return GameState.calculatePlayerScore(playerId, BlokusApp.piece.PIECES);
      });
      return;
    }
    
    BlokusApp.currentPlayer = result.player;
    UI.updateBoardBorder(BlokusApp.currentPlayer, BlokusApp.players);
    UI.renderBoard(GameState.getBoard(), BlokusApp.size, BlokusApp.players, Interaction.createBoardHandlers(BlokusApp));
    UI.renderPalette(BlokusApp.piece.PIECES, BlokusApp.currentPlayer, BlokusApp.players, GameState.getUsedPieces(), Interaction.createPaletteHandlers(BlokusApp), BlokusApp);
    UI.renderScores(BlokusApp.currentPlayer, BlokusApp.players, (playerId) => {
      return GameState.calculatePlayerScore(playerId, BlokusApp.piece.PIECES);
    });
  }
  
  // Rotate piece
  function rotatePiece() {
    if(BlokusApp.selectedPiece && PieceUtils.getCurrentOrientation(BlokusApp.selectedPiece.id, BlokusApp.selectedPiece.orientationIndex).length > 0){
      const newIndex = PieceUtils.rotatePiece(BlokusApp.selectedPiece.id, BlokusApp.selectedPiece.orientationIndex);
      BlokusApp.selectedPiece.orientationIndex = newIndex;
      UI.updateSelectedPieceVisual(BlokusApp);
      
      if(Interaction.isPreviewing(BlokusApp.interactionState) && BlokusApp.previewCell){
        const x = parseInt(BlokusApp.previewCell.dataset.x, 10);
        const y = parseInt(BlokusApp.previewCell.dataset.y, 10);
        UI.updateGhostPreview(BlokusApp.previewCell, x, y, BlokusApp);
      } else if(BlokusApp.lastHoveredCell){
        const x = parseInt(BlokusApp.lastHoveredCell.dataset.x, 10);
        const y = parseInt(BlokusApp.lastHoveredCell.dataset.y, 10);
        UI.updateGhostPreview(BlokusApp.lastHoveredCell, x, y, BlokusApp);
      }
    }
  }
  
  // Flip piece
  function flipPiece() {
    if(BlokusApp.selectedPiece && PieceUtils.getCurrentOrientation(BlokusApp.selectedPiece.id, BlokusApp.selectedPiece.orientationIndex).length > 0){
      const newIndex = PieceUtils.flipPiece(BlokusApp.selectedPiece.id, BlokusApp.selectedPiece.orientationIndex);
      BlokusApp.selectedPiece.orientationIndex = newIndex;
      UI.updateSelectedPieceVisual(BlokusApp);
      
      if(Interaction.isPreviewing(BlokusApp.interactionState) && BlokusApp.previewCell){
        const x = parseInt(BlokusApp.previewCell.dataset.x, 10);
        const y = parseInt(BlokusApp.previewCell.dataset.y, 10);
        UI.updateGhostPreview(BlokusApp.previewCell, x, y, BlokusApp);
      } else if(BlokusApp.lastHoveredCell){
        const x = parseInt(BlokusApp.lastHoveredCell.dataset.x, 10);
        const y = parseInt(BlokusApp.lastHoveredCell.dataset.y, 10);
        UI.updateGhostPreview(BlokusApp.lastHoveredCell, x, y, BlokusApp);
      }
    }
  }
  
  // Pass turn
  function pass() {
    GameState.addPass(BlokusApp.currentPlayer);
    Interaction.nextTurn(BlokusApp);
    UI.renderPalette(BlokusApp.piece.PIECES, BlokusApp.currentPlayer, BlokusApp.players, GameState.getUsedPieces(), Interaction.createPaletteHandlers(BlokusApp), BlokusApp);
  }
  
  // End game
  function endGame() {
    Interaction.endGame(BlokusApp);
  }
  
  // Event listeners
  window.addEventListener('keydown', e => {
    if(e.key === 'u' || e.key === 'U') undo();
  });
  
  flipBtn.addEventListener('click', flipPiece);
  rotateBtn.addEventListener('click', rotatePiece);
  passBtn.addEventListener('click', pass);
  undoBtn.addEventListener('click', undo);
  restartBtn.addEventListener('click', () => {
    if(confirm('Restart?')) init();
  });
  endGameBtn.addEventListener('click', () => {
    if(confirm('End game and calculate scores?')) endGame();
  });
  
  // Resize handler
  let resizeTimeout;
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      UI.resizeBoard(BlokusApp.size);
      UI.updateBoardDimensionsCache();
    }, 100);
  }
  
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      UI.resizeBoard(BlokusApp.size);
    }, 100);
  });
  
  // Initialize game
  init();
  
  // Ensure board scaling runs after DOM is fully loaded
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => {
      requestAnimationFrame(() => {
        UI.resizeBoard(BlokusApp.size);
      });
    });
  } else {
    requestAnimationFrame(() => {
      UI.resizeBoard(BlokusApp.size);
      setTimeout(() => UI.resizeBoard(BlokusApp.size), 100);
    });
  }
})();

