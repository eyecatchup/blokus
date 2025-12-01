// --- CONFIG ---
const SIZE = 20;
const PLAYERS = [
  {id:0,name:'Blue',color:'#3b82f6'},
  {id:1,name:'Yellow',color:'#f59e0b'},
  {id:2,name:'Red',color:'#ef4444'},
  {id:3,name:'Green',color:'#10b981'}
];
// piece names as per https://web.archive.org/web/20150720234834/http://blokusstrategy.com/piece-names/
const PIECES = [
  // Monomino
  {id:'1',cells:[[0,0]],name:'1'}, 
  // Domino
  {id:'2',cells:[[0,0],[0,1]],name:'2'},
  // Trominoes
  {id:'I3',cells:[[0,0],[0,1],[0,2]],name:'I3'},
  {id:'V3',cells:[[0,0],[0,1],[1,0]],name:'V3'},
  // Tetrominoes
  {id:'I4',cells:[[0,0],[0,1],[0,2],[0,3]],name:'I4'},
  {id:'L4',cells:[[0,0],[0,1],[1,0],[2,0]],name:'L4'},
  {id:'O',cells:[[0,0],[1,0],[0,1],[1,1]],name:'O'},
  {id:'T4',cells:[[0,0],[1,1],[1,0],[2,0]],name:'T4'},
  {id:'Z4',cells:[[1,0],[2,0],[0,1],[1,1]],name:'Z4'},
  // Pentominoes
  {id:'I5',cells:[[0,0],[0,1],[0,2],[0,3],[0,4]],name:'I5'},
  {id:'X',cells:[[1,0],[0,1],[1,1],[2,1],[1,2]],name:'X'},
  {id:'L5',cells:[[0,0],[0,1],[1,0],[2,0],[3,0]],name:'L5'},
  {id:'V5',cells:[[2,1],[1,1],[0,1],[0,2],[0,3]],name:'V5'},
  {id:'F',cells:[[2,1],[1,1],[1,2],[1,3],[0,2]],name:'F'},
  {id:'N',cells:[[1,0],[2,0],[0,1],[1,1],[3,0]],name:'N'},
  {id:'Z5',cells:[[1,0],[2,0],[1,1],[1,2],[0,2]],name:'Z5'},
  {id:'U',cells:[[1,0],[2,1],[3,0],[1,1],[3,1]],name:'U'},
  {id:'W',cells:[[1,0],[2,0],[0,1],[1,1],[0,2]],name:'W'},
  {id:'P',cells:[[0,0],[1,0],[0,1],[1,1],[2,1]],name:'P'},
  {id:'Y',cells:[[0,0],[1,1],[1,0],[2,0],[3,0]],name:'Y'},
  {id:'T5',cells:[[0,0],[1,1],[1,0],[2,0],[1,2]],name:'T5'},
];

// Precompute all unique orientations for each piece (performance optimization)
const PIECE_ORIENTATIONS = new Map();
// Precomputed placement cache: placementCache[pieceId][orientationKey][y][x] = adjustedCells[]
const placementCache = {};
// Precomputed bounding boxes: boundingBoxCache[pieceId][orientationKey] = {minX, minY, maxX, maxY}
const boundingBoxCache = {};
// Cache for valid moves per player: validMovesCache[playerId] = boolean (invalidated on placement)
const validMovesCache = {};

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
// Inline isInsideBoard check since it's defined later
function isInsideBoardInline(cells){
  return cells.every(([x,y]) => x >= 0 && x < SIZE && y >= 0 && y < SIZE);
}

function computeAdjustedPlacement(orientation, boardX, boardY){
  const minX = Math.min(...orientation.map(c => c[0]));
  const minY = Math.min(...orientation.map(c => c[1]));
  const maxX = Math.max(...orientation.map(c => c[0]));
  const maxY = Math.max(...orientation.map(c => c[1]));
  
  // Calculate initial placement
  let placed = orientation.map(([cx, cy]) => [boardX + (cx - minX), boardY + (cy - minY)]);
  
  // Adjust placement if it would go out of bounds
  let adjustedX = boardX, adjustedY = boardY;
  if(!isInsideBoardInline(placed)){
    if(boardX + maxX >= SIZE) adjustedX = SIZE - 1 - maxX;
    if(boardY + maxY >= SIZE) adjustedY = SIZE - 1 - maxY;
    if(adjustedX < 0) adjustedX = 0;
    if(adjustedY < 0) adjustedY = 0;
    placed = orientation.map(([cx, cy]) => [adjustedX + (cx - minX), adjustedY + (cy - minY)]);
  }
  
  return placed;
}

// Precompute orientations and placement cache for all pieces at startup
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
      placementCache[piece.id][key] = Array.from({length: SIZE}, () => []);
      for(let y = 0; y < SIZE; y++){
        placementCache[piece.id][key][y] = Array.from({length: SIZE}, () => null);
        for(let x = 0; x < SIZE; x++){
          const adjusted = computeAdjustedPlacement(normalized, x, y);
          // Only store if placement is valid (inside board)
          if(isInsideBoardInline(adjusted)){
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
        placementCache[piece.id][flippedKey] = Array.from({length: SIZE}, () => []);
        for(let y = 0; y < SIZE; y++){
          placementCache[piece.id][flippedKey][y] = Array.from({length: SIZE}, () => null);
          for(let x = 0; x < SIZE; x++){
            const adjusted = computeAdjustedPlacement(flippedNormalized, x, y);
            if(isInsideBoardInline(adjusted)){
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

// --- INTERACTION STATE MACHINE ---
const InteractionState = {
  NONE: 0,
  SELECTING: 1,
  DRAGGING: 2,
  PREVIEWING: 3
};

let interactionState = InteractionState.NONE;
let selectedPiece = null; // Piece data object
let selectedOrientation = {index: 0}; // Index into PIECE_ORIENTATIONS[piece.id]
let selectedPieceElement = null; // Reference to the selected piece's DOM element

// Get current orientation cells from precomputed orientations (never recalculate)
function getCurrentOrientation(){
  if(!selectedPiece) return [];
  const orientations = PIECE_ORIENTATIONS.get(selectedPiece.id);
  if(!orientations || orientations.length === 0) return [];
  const index = selectedOrientation.index % orientations.length;
  return orientations[index];
}
let dragStart = {x: 0, y: 0};
let hoveringCell = null; // {x, y} or null
let previewCell = null; // DOM element reference for preview mode
let isPlacing = false; // Guard to prevent duplicate placement calls

// Cached DOM grid for fast ghost rendering
let cellEls = null;

// --- STATE ---
let board = [];
let currentPlayer = 0;
let usedPieces = {};
let history = [];
// Game mode state
let gameMode = null; // 'vsComputer' | 'localMultiplayer'
let numberOfPlayers = null; // 2, 3, or 4
let playerAssignments = {}; // Maps colorId (0-3) to playerNumber (1-4) or 'computer'
let sharedColor = null; // For 3-player mode: which color is shared (0-3), null otherwise
let sharedColorTurn = 1; // For 3-player mode: which player's turn it is for shared color (1-3)
// Create a transparent drag image element to avoid overlaying the ghost preview
const emptyDragImage = document.createElement('div');
emptyDragImage.style.width = '1px';
emptyDragImage.style.height = '1px';
emptyDragImage.style.opacity = '0';
emptyDragImage.style.position = 'absolute';
emptyDragImage.style.top = '-1000px';
document.body.appendChild(emptyDragImage);

const boardEl = document.getElementById('board');
const paletteEl = document.getElementById('palette');
const scoresEl = document.getElementById('scores');
const toastContainer = document.getElementById('toast-container');
const flipBtn = document.getElementById('flipBtn');
const rotateBtn = document.getElementById('rotateBtn');
const passBtn = document.getElementById('passBtn');
const undoBtn = document.getElementById('undoBtn');
const restartBtn = document.getElementById('restartBtn');
const restartBtnWin = document.getElementById('restartBtnWin');
const endGameBtn = document.getElementById('endGameBtn');
const showHintBtn = document.getElementById('showHintBtn');
const autoMoveBtn = document.getElementById('autoMoveBtn');
const winMessageEl = document.getElementById('win-message');
const winMessagePlayerEl = document.getElementById('win-message-player');
const noValidMovesEl = document.getElementById('no-valid-moves');
const finalScoresEl = document.getElementById('final-scores');
const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalMessage = document.getElementById('confirm-modal-message');
const confirmModalOk = document.getElementById('confirm-modal-ok');
const confirmModalCancel = document.getElementById('confirm-modal-cancel');
const modeSelectionOverlay = document.getElementById('mode-selection-overlay');
const modeSelectionStep1 = document.getElementById('mode-selection-step1');
const modeSelectionStep2 = document.getElementById('mode-selection-step2');
const modeVsComputerBtn = document.getElementById('mode-vs-computer');
const modeLocalMultiplayerBtn = document.getElementById('mode-local-multiplayer');
const playerCountButtons = document.getElementById('player-count-buttons');
const modeSelectionBackBtn = document.getElementById('mode-selection-back');
const turnIndicatorEl = document.getElementById('turn-indicator');

// --- TOAST NOTIFICATIONS ---
function showToast(message){
  if(!toastContainer) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  // Remove toast after animation completes (3 seconds total)
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// --- CUSTOM CONFIRM MODAL ---
function customConfirm(message, title = 'Confirm'){
  return new Promise((resolve) => {
    if(!confirmModalOverlay || !confirmModalMessage || !confirmModalTitle) {
      // Fallback to native confirm if modal elements don't exist
      resolve(window.confirm(message));
      return;
    }
    
    // Set modal content
    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    
    // Show modal
    confirmModalOverlay.classList.add('show');
    
    // Clean up previous listeners
    const okHandler = () => {
      confirmModalOverlay.classList.remove('show');
      confirmModalOk.removeEventListener('click', okHandler);
      confirmModalCancel.removeEventListener('click', cancelHandler);
      confirmModalOverlay.removeEventListener('click', overlayHandler);
      resolve(true);
    };
    
    const cancelHandler = () => {
      confirmModalOverlay.classList.remove('show');
      confirmModalOk.removeEventListener('click', okHandler);
      confirmModalCancel.removeEventListener('click', cancelHandler);
      confirmModalOverlay.removeEventListener('click', overlayHandler);
      resolve(false);
    };
    
    const overlayHandler = (e) => {
      // Only close if clicking the overlay itself, not the modal
      if(e.target === confirmModalOverlay){
        cancelHandler();
      }
    };
    
    // Add event listeners
    confirmModalOk.addEventListener('click', okHandler);
    confirmModalCancel.addEventListener('click', cancelHandler);
    confirmModalOverlay.addEventListener('click', overlayHandler);
  });
}

// --- GAME MODE HELPERS ---
function isComputerTurn(colorId){
  return playerAssignments[colorId] === 'computer';
}

function getPlayerForColor(colorId){
  // Handle shared color for 3-player mode
  if(sharedColor !== null && colorId === sharedColor){
    return sharedColorTurn;
  }
  return playerAssignments[colorId] || null;
}

function getColorsForPlayer(playerNumber){
  const colors = [];
  for(let colorId = 0; colorId < 4; colorId++){
    // Exclude shared colors (they don't count toward player score)
    if(sharedColor !== null && colorId === sharedColor){
      continue;
    }
    if(playerAssignments[colorId] === playerNumber){
      colors.push(colorId);
    }
  }
  return colors;
}

function isCurrentPlayerTurn(){
  // Check if current color is controlled by a human player (not computer)
  if(isComputerTurn(currentPlayer)){
    return false;
  }
  
  // For shared colors in 3-player mode, check if it's the right player's turn
  if(sharedColor !== null && currentPlayer === sharedColor){
    // In 3-player mode, the shared color alternates between players
    // We need to check if any human player can make a move (this is handled by the UI)
    // For now, allow any human interaction when it's the shared color's turn
    // The actual player assignment is handled in getPlayerForColor
    return true;
  }
  
  return true;
}

function getTurnIndicatorText(){
  if(!gameMode) return '';
  
  const colorName = PLAYERS[currentPlayer].name;
  const playerForColor = getPlayerForColor(currentPlayer);
  
  if(playerForColor === 'computer'){
    return `Computer's turn (${colorName})`;
  } else {
    return `Player ${playerForColor}'s turn (${colorName})`;
  }
}

function initializeGameMode(mode, numPlayers){
  gameMode = mode;
  numberOfPlayers = numPlayers;
  playerAssignments = {};
  sharedColor = null;
  sharedColorTurn = 1;
  
  if(mode === 'vsComputer'){
    if(numPlayers === 2){
      // Player 1: Blue (0) + Red (2)
      // Computer: Yellow (1) + Green (3)
      playerAssignments[0] = 1; // Blue
      playerAssignments[1] = 'computer'; // Yellow
      playerAssignments[2] = 1; // Red
      playerAssignments[3] = 'computer'; // Green
    } else if(numPlayers === 4){
      // Player 1: Blue (0)
      // Computer: Yellow (1), Red (2), Green (3)
      playerAssignments[0] = 1; // Blue
      playerAssignments[1] = 'computer'; // Yellow
      playerAssignments[2] = 'computer'; // Red
      playerAssignments[3] = 'computer'; // Green
    }
  } else if(mode === 'localMultiplayer'){
    if(numPlayers === 2){
      // Player 1: Blue (0) + Red (2)
      // Player 2: Yellow (1) + Green (3)
      playerAssignments[0] = 1; // Blue
      playerAssignments[1] = 2; // Yellow
      playerAssignments[2] = 1; // Red
      playerAssignments[3] = 2; // Green
    } else if(numPlayers === 3){
      // Player 1: Blue (0)
      // Player 2: Yellow (1)
      // Player 3: Red (2)
      // Shared: Green (3)
      playerAssignments[0] = 1; // Blue
      playerAssignments[1] = 2; // Yellow
      playerAssignments[2] = 3; // Red
      sharedColor = 3; // Green is shared
      playerAssignments[3] = 'shared'; // Mark as shared
    } else if(numPlayers === 4){
      // Player 1: Blue (0)
      // Player 2: Yellow (1)
      // Player 3: Red (2)
      // Player 4: Green (3)
      playerAssignments[0] = 1; // Blue
      playerAssignments[1] = 2; // Yellow
      playerAssignments[2] = 3; // Red
      playerAssignments[3] = 4; // Green
    }
  }
}

// --- MODE SELECTION UI ---
function showModeSelection(){
  if(!modeSelectionOverlay) return;
  modeSelectionOverlay.style.display = 'flex';
  modeSelectionStep1.style.display = 'block';
  modeSelectionStep2.style.display = 'none';
}

function hideModeSelection(){
  if(!modeSelectionOverlay) return;
  modeSelectionOverlay.style.display = 'none';
}

function showPlayerCountSelection(mode){
  if(!modeSelectionStep2 || !playerCountButtons) return;
  
  modeSelectionStep1.style.display = 'none';
  modeSelectionStep2.style.display = 'block';
  playerCountButtons.innerHTML = '';
  
  const title = document.getElementById('player-count-title');
  if(title){
    title.textContent = mode === 'vsComputer' ? 'Select Number of Players' : 'Select Number of Players';
  }
  
  // Descriptions for each mode and player count
  const descriptions = {
    vsComputer: {
      2: 'You play blue and red, computer plays yellow and green.',
      4: 'You play blue, computer plays red, yellow and green.'
    },
    localMultiplayer: {
      2: 'Player 1 plays blue and red. Player 2 plays yellow and green.',
      3: 'Player 1 plays blue. Player 2 plays red. Player 3 plays yellow. All play green.',
      4: 'Player 1 plays blue. Player 2 plays red. Player 3 plays yellow. Player 4 plays green.'
    }
  };
  
  let options = [];
  if(mode === 'vsComputer'){
    options = [2, 4];
  } else {
    options = [2, 3, 4];
  }
  
  options.forEach(num => {
    // Create wrapper for button and description
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '8px';
    wrapper.style.width = '100%';
    
    // Create button
    const btn = document.createElement('button');
    btn.className = 'mode-button';
    btn.textContent = `${num} Player${num > 1 ? 's' : ''}`;
    btn.addEventListener('click', () => {
      initializeGameMode(mode, num);
      hideModeSelection();
      init();
    });
    
    // Create description
    const desc = document.createElement('div');
    desc.style.fontSize = '13px';
    desc.style.color = '#666';
    desc.style.textAlign = 'center';
    desc.style.lineHeight = '1.4';
    desc.textContent = descriptions[mode][num];
    
    wrapper.appendChild(btn);
    wrapper.appendChild(desc);
    playerCountButtons.appendChild(wrapper);
  });
}

// Setup mode selection event listeners
if(modeVsComputerBtn){
  modeVsComputerBtn.addEventListener('click', () => {
    showPlayerCountSelection('vsComputer');
  });
}

if(modeLocalMultiplayerBtn){
  modeLocalMultiplayerBtn.addEventListener('click', () => {
    showPlayerCountSelection('localMultiplayer');
  });
}

if(modeSelectionBackBtn){
  modeSelectionBackBtn.addEventListener('click', () => {
    modeSelectionStep1.style.display = 'block';
    modeSelectionStep2.style.display = 'none';
  });
}

// --- DYNAMIC BOARD SCALING ---
function resizeBoard(){
  if(!boardEl) return;
  
  const root = document.documentElement;
  const minCellSize = 13; // Very small mobile
  const maxCellSize = 28; // Desktop
  
  // Get viewport dimensions
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Check if we're in mobile layout (sidebar stacked vertically)
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  
  let availableWidth;
  let availableHeight;
  
  if(isMobile){
    // Mobile: board takes full width minus padding
    const bodyPadding = window.getComputedStyle(document.body).paddingLeft;
    const padding = parseFloat(bodyPadding) || 12;
    availableWidth = viewportWidth - (padding * 2);
    
    // Account for header, footer, and padding
    const header = document.querySelector('h1');
    const footer = document.querySelector('.footer.show-mobile');
    const headerHeight = header ? header.offsetHeight + 12 : 30; // h1 + margin
    const footerHeight = footer ? footer.offsetHeight + 14 : 0; // footer + margin
    const bodyPaddingTop = parseFloat(window.getComputedStyle(document.body).paddingTop) || 12;
    const bodyPaddingBottom = parseFloat(window.getComputedStyle(document.body).paddingBottom) || 12;
    availableHeight = viewportHeight - headerHeight - footerHeight - bodyPaddingTop - bodyPaddingBottom;
  } else {
    // Desktop: account for sidebar, gap, and padding
    const sidebar = document.querySelector('.sidebar');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 340;
    const gap = 5; // gap between board and sidebar
    const bodyPadding = window.getComputedStyle(document.body).paddingLeft;
    const padding = parseFloat(bodyPadding) || 5;
    
    availableWidth = viewportWidth - sidebarWidth - gap - (padding * 2);
    
    // Account for header and padding
    const header = document.querySelector('h1');
    const headerHeight = header ? header.offsetHeight + 12 : 30; // h1 + margin
    const bodyPaddingTop = parseFloat(window.getComputedStyle(document.body).paddingTop) || 5;
    const bodyPaddingBottom = parseFloat(window.getComputedStyle(document.body).paddingBottom) || 5;
    availableHeight = viewportHeight - headerHeight - bodyPaddingTop - bodyPaddingBottom;
  }
  
  // Account for board border (4px * 2) and padding (6px * 2)
  const boardPadding = 6 * 2;
  const boardBorder = 4 * 2;
  const boardOverhead = boardPadding + boardBorder;
  
  // Calculate optimal cell size based on both width and height
  // Use the smaller dimension to ensure board stays square
  const cellSizeFromWidth = (availableWidth - boardOverhead) / SIZE;
  const cellSizeFromHeight = (availableHeight - boardOverhead) / SIZE;
  const calculatedCellSize = Math.min(cellSizeFromWidth, cellSizeFromHeight);
  
  // Clamp between min and max
  const cellSize = Math.max(minCellSize, Math.min(maxCellSize, calculatedCellSize));
  
  // Calculate actual board size
  const boardSize = (cellSize * SIZE) + boardOverhead;
  
  // Update CSS variable
  root.style.setProperty('--cell', `${cellSize}px`);
  
  // Set max-width on board to ensure it stays square
  boardEl.style.maxWidth = `${boardSize}px`;
  boardEl.style.maxHeight = `${boardSize}px`;
  
  // Set same max-width on instructions element
  const instructionsEl = document.getElementById('instructions');
  if(instructionsEl){
    instructionsEl.style.maxWidth = `${boardSize}px`;
  }
}

// Debounce resize handler
let resizeTimeout;
function handleResize(){
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    resizeBoard();
    updateBoardDimensionsCache(); // Update cached board dimensions on resize
  }, 100);
}

// Update board border color to match current player
function updateBoardBorder(){
  if(!boardEl) return;
  const root = document.documentElement;
  const playerColor = PLAYERS[currentPlayer].color;
  root.style.setProperty('--board-border-color', playerColor);
}

// Update turn indicator text
function updateTurnIndicator(){
  if(!turnIndicatorEl) return;
  turnIndicatorEl.textContent = getTurnIndicatorText();
}

// --- INIT ---
function init(){
  // If no game mode selected, show mode selection
  if(!gameMode){
    showModeSelection();
    return;
  }
  
  board = Array.from({length:SIZE},()=>Array.from({length:SIZE},()=>null));
  usedPieces = {}; PLAYERS.forEach(p=>usedPieces[p.id]=new Set());
  currentPlayer = 0;
  selectedPiece = null;
  selectedOrientation.index = 0;
  selectedPieceElement = null;
  history = [];
  interactionState = InteractionState.NONE;
  dragStart = {x: 0, y: 0};
  hoveringCell = null;
  previewCell = null;
  cachedBoundingBox = null;
  isPlacing = false;
  sharedColorTurn = 1; // Reset shared color turn for 3-player mode
  
  // Hide win message and show sidebar elements
  if(winMessageEl){
    winMessageEl.style.display = 'none';
  }
  
  // Show .scores and .controls in the sidebar
  const scoresEl = document.querySelector('.scores');
  const controlsEl = document.querySelector('.controls');
  if(scoresEl) scoresEl.style.display = '';
  if(controlsEl) controlsEl.style.display = '';
  
  updateBoardBorder();
  updateTurnIndicator();
  renderBoard();
  renderPalette();
  renderScores();
  resizeBoard();
  updateBoardDimensionsCache(); // Initialize board dimensions cache
  // Invalidate valid moves cache
  PLAYERS.forEach(p => validMovesCache[p.id] = undefined);
  // Document-level touchmove handler to catch all touch moves for ghost preview
  document.removeEventListener('touchmove', handleDocumentTouchMove);
  document.addEventListener('touchmove', handleDocumentTouchMove, {passive: false});
  
  // If it's computer's turn, auto-execute move
  if(isComputerTurn(currentPlayer)){
    setTimeout(() => executeAutoMove(), 500);
  }
}


function handleDocumentTouchMove(e){
  // Update ghost preview during touch dragging, regardless of where touch started
  // This is the primary handler for all touch moves during drag operations
  if(selectedPiece && e.touches && e.touches[0]){
    const touch = e.touches[0];
    // Handle if we're in any drag-related state (SELECTING or DRAGGING)
    if(interactionState === InteractionState.DRAGGING || interactionState === InteractionState.SELECTING){
      e.preventDefault();
      handleDragMove(touch.clientX, touch.clientY);
    }
  }
}

// Initialize cell cache for fast ghost rendering
function initCellCache(){
  cellEls = Array.from({length: SIZE}, (_, y) =>
    Array.from({length: SIZE}, (_, x) =>
      document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`)
    )
  );
}

// Cache for board rect and cell size (updated on resize)
let cachedBoardRect = null;
let cachedCellSize = null;

// Update cached board dimensions (call on resize)
function updateBoardDimensionsCache(){
  if(!boardEl || !cellEls || !cellEls[0] || !cellEls[0][0]) return;
  cachedBoardRect = boardEl.getBoundingClientRect();
  cachedCellSize = cellEls[0][0].getBoundingClientRect().width;
}

// Get cell coordinates and element from client coordinates (O(1) math, no DOM queries)
function getCellAt(clientX, clientY){
  if(!boardEl || !cellEls || !cellEls[0] || !cellEls[0][0]) return null;
  
  // Use cached board rect and cell size (updated on resize)
  if(!cachedBoardRect || !cachedCellSize){
    updateBoardDimensionsCache();
  }
  
  // Calculate grid coordinates using simple math
  const gx = Math.floor((clientX - cachedBoardRect.left) / cachedCellSize);
  const gy = Math.floor((clientY - cachedBoardRect.top) / cachedCellSize);
  
  // Validate bounds
  if(gx >= 0 && gy >= 0 && gx < SIZE && gy < SIZE && cellEls[gy] && cellEls[gy][gx]){
    return {
      x: gx,
      y: gy,
      element: cellEls[gy][gx]
    };
  }
  
  return null;
}

// --- SHARED DRAG HANDLERS (used by both mouse and touch) ---
function handleDragStart(clientX, clientY){
  if(!selectedPiece || interactionState !== InteractionState.NONE) return false;
  
  dragStart = {x: clientX, y: clientY};
  interactionState = InteractionState.SELECTING;
  return true;
}

function handleDragMove(clientX, clientY){
  if(interactionState === InteractionState.NONE || !selectedPiece) return;
  
  const dx = clientX - dragStart.x;
  const dy = clientY - dragStart.y;
  
  // Transition to DRAGGING if movement threshold exceeded
  if(interactionState === InteractionState.SELECTING){
    const threshold = 5; // pixels
    if(Math.abs(dx) > threshold || Math.abs(dy) > threshold){
      interactionState = InteractionState.DRAGGING;
    } else {
      return; // Still in SELECTING, no movement yet
    }
  }
  
  if(interactionState === InteractionState.DRAGGING){
    // Find which cell is under the pointer using fast math (no DOM queries)
    const cellInfo = getCellAt(clientX, clientY);
    if(cellInfo){
      hoveringCell = {x: cellInfo.x, y: cellInfo.y};
      lastHoveredCell = cellInfo.element;
      updateGhostPreview(cellInfo.element, cellInfo.x, cellInfo.y);
    } else {
      hoveringCell = null;
      clearGhost();
    }
  }
}

function handleDragEnd(clientX, clientY){
  // If already NONE, this was already called - return null to prevent duplicate handling
  if(interactionState === InteractionState.NONE || !selectedPiece) return null;
  
  const prevState = interactionState;
  const wasDragging = (prevState === InteractionState.DRAGGING);
  const wasSelecting = (prevState === InteractionState.SELECTING);
  
  // Reset state immediately to prevent duplicate calls
  interactionState = InteractionState.NONE;
  hoveringCell = null;
  
  if(wasSelecting){
    // This was a tap - return info for caller to handle (preview mode)
    return {type: 'tap', x: clientX, y: clientY};
  }
  
  if(wasDragging){
    // Was a drag - try to place if we have a cell (using fast math, no DOM queries)
    const cellInfo = getCellAt(clientX, clientY);
    if(cellInfo){
      return {type: 'drag', cell: cellInfo.element, x: cellInfo.x, y: cellInfo.y};
    }
    // Try last hovered cell as fallback
    if(lastHoveredCell){
      const x = parseInt(lastHoveredCell.dataset.x, 10);
      const y = parseInt(lastHoveredCell.dataset.y, 10);
      return {type: 'drag', cell: lastHoveredCell, x: x, y: y};
    }
    return {type: 'cancel'};
  }
  
  return {type: 'cancel'};
}

// Check if movement exceeds tap threshold
function isTapMovement(startX, startY, currentX, currentY, threshold = 10){
  return Math.abs(currentX - startX) <= threshold && 
         Math.abs(currentY - startY) <= threshold;
}

// Helper functions for backward compatibility during refactor
function isDragging(){
  return interactionState === InteractionState.DRAGGING;
}

function isPreviewing(){
  return interactionState === InteractionState.PREVIEWING;
}

function setDragging(value){
  if(value){
    if(interactionState === InteractionState.SELECTING){
      interactionState = InteractionState.DRAGGING;
    }
  } else {
    if(interactionState === InteractionState.DRAGGING || interactionState === InteractionState.SELECTING){
      interactionState = InteractionState.NONE;
    }
  }
}

function setPreviewMode(value){
  if(value){
    interactionState = InteractionState.PREVIEWING;
  } else {
    if(interactionState === InteractionState.PREVIEWING){
      interactionState = InteractionState.NONE;
    }
  }
}

// Touch start tracking for board cells (used with event delegation)
const boardCellTouchStarts = new WeakMap();

// --- RENDER BOARD ---
function renderBoard(){
  // Remove old event listeners if they exist
  boardEl.removeEventListener('click', handleBoardClick);
  boardEl.removeEventListener('touchstart', handleBoardTouchStart);
  boardEl.removeEventListener('touchmove', handleBoardTouchMove);
  boardEl.removeEventListener('touchend', handleBoardTouchEnd);
  boardEl.removeEventListener('touchcancel', handleBoardTouchCancel);
  
  boardEl.innerHTML='';
  cellEls = Array.from({length: SIZE}, () => []);
  for(let y=0;y<SIZE;y++){
    for(let x=0;x<SIZE;x++){
      const c = document.createElement('div');
      c.className='cell';
      c.dataset.x=x; c.dataset.y=y;
      const cell = board[y][x];
      if(cell!=null){
        const dot=document.createElement('div');dot.className='dot';dot.style.background=PLAYERS[cell.player].color;c.appendChild(dot);
      }
      // Drag events must stay on cells (can't use delegation)
      c.addEventListener('dragover',onDragOver);
      c.addEventListener('drop',onDrop);
      c.addEventListener('dragleave',(e)=>{
        if(!e.relatedTarget || !boardEl.contains(e.relatedTarget)){
          clearGhost();
        }
      });
      boardEl.appendChild(c);
      if(cellEls[y]) cellEls[y][x] = c;
    }
  }
  
  // Use event delegation for click and touch events (more efficient)
  boardEl.addEventListener('click', handleBoardClick);
  boardEl.addEventListener('touchstart', handleBoardTouchStart, {passive: true});
  // Note: touchmove is handled by handleDocumentTouchMove for global coverage
  // We still add board-level handler as backup
  boardEl.addEventListener('touchmove', handleBoardTouchMove, {passive: false});
  boardEl.addEventListener('touchend', handleBoardTouchEnd, {passive: false});
  boardEl.addEventListener('touchcancel', handleBoardTouchCancel);
  
  // Update cell cache after rendering
  initCellCache();
  updateBoardDimensionsCache(); // Update cached dimensions
}

// Event delegation handlers for board
function handleBoardClick(e){
  const cell = e.target.closest('.cell');
  if(!cell || !selectedPiece || isDragging()) return;
  const x=parseInt(cell.dataset.x,10);
  const y=parseInt(cell.dataset.y,10);
  handleCellInteraction(cell, x, y);
}

function handleBoardTouchStart(e){
  const cell = e.target.closest('.cell');
  if(!cell || !selectedPiece || !e.touches[0] || interactionState !== InteractionState.NONE) return;
  const touch = e.touches[0];
  boardCellTouchStarts.set(cell, {x: touch.clientX, y: touch.clientY});
  handleDragStart(touch.clientX, touch.clientY);
}

function handleBoardTouchMove(e){
  // Handle touch move for any drag operation (not just board cells)
  // This fires when touch moves over the board area
  // Note: handleDocumentTouchMove handles touch moves globally, this is just for board-specific handling
  // Don't preventDefault here - let document handler do it to avoid conflicts
  if(selectedPiece && e.touches && e.touches[0]){
    // Only handle if we're in a drag state (started from palette or board)
    if(interactionState === InteractionState.DRAGGING || interactionState === InteractionState.SELECTING){
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
      // Don't preventDefault - document handler will do it
    }
  }
}

function handleBoardTouchEnd(e){
  const cell = e.target.closest('.cell');
  if(!cell || !selectedPiece || !e.changedTouches || !e.changedTouches[0]) return;
  e.preventDefault();
  e.stopPropagation();
  const touch = e.changedTouches[0];
  const touchStart = boardCellTouchStarts.get(cell);
  const wasTap = touchStart && isTapMovement(touchStart.x, touchStart.y, touch.clientX, touch.clientY, 10);
  
  // If in preview mode, handle directly as cell interaction
  if(isPreviewing()){
    const x=parseInt(cell.dataset.x,10);
    const y=parseInt(cell.dataset.y,10);
    handleCellInteraction(cell, x, y);
    boardCellTouchStarts.delete(cell);
    return;
  }
  
  // Otherwise, handle as drag/tap
  const result = handleDragEnd(touch.clientX, touch.clientY);
  if(result){
    if(result.type === 'drag' && result.cell){
      handlePlacement(result.cell, result.x, result.y);
    } else if(wasTap && result.type === 'tap'){
      const x=parseInt(cell.dataset.x,10);
      const y=parseInt(cell.dataset.y,10);
      handleCellInteraction(cell, x, y);
    }
  }
  boardCellTouchStarts.delete(cell);
}

function handleBoardTouchCancel(e){
  const cell = e.target.closest('.cell');
  if(cell) boardCellTouchStarts.delete(cell);
  interactionState = InteractionState.NONE;
  hoveringCell = null;
  setPreviewMode(false);
  previewCell = null;
  clearGhost();
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

// --- RENDER PALETTE (click to select, then drag) ---
function renderPalette(){
  if(!paletteEl) return;
  
  paletteEl.innerHTML='';
  cachedPieceElements = []; // Reset cache
  
  // Show message if it's computer's turn, but still render pieces for computer moves
  const isComputerTurnNow = isComputerTurn(currentPlayer);
  if(isComputerTurnNow){
    const messageDiv = document.createElement('div');
    messageDiv.style.padding = '20px';
    messageDiv.style.textAlign = 'center';
    messageDiv.style.color = '#666';
    messageDiv.textContent = 'Computer is thinking...';
    paletteEl.appendChild(messageDiv);
    // Continue to render pieces so cachedPieceElements is populated for computer moves
  }
  PIECES.forEach(piece=>{
    const wrapper=document.createElement('div');
    wrapper.className='piece';
    // Hide pieces visually during computer turn, but keep them in DOM
    if(isComputerTurnNow){
      wrapper.style.display = 'none';
    }
    wrapper.dataset.pid=piece.id;
    const isUsed = usedPieces[currentPlayer].has(piece.id);
    if(isUsed){
      wrapper.style.opacity='0.4';
      wrapper.style.cursor='not-allowed';
    }
    wrapper.title=piece.name+(isUsed?" (used)":" — click to select, then drag to board");

    // Convert piece to 5x5 grid positions (normalized and centered)
    const gridCells = pieceToGrid(piece);
    
    const grid=document.createElement('div');grid.style.display='grid';grid.style.gridTemplateColumns='repeat(5,1fr)';grid.style.gridTemplateRows='repeat(5,1fr)';grid.style.width='100%';grid.style.height='100%';
    const cells=Array.from({length:25},()=>document.createElement('div'));
    cells.forEach(c=>c.className='px');
    
    // Render cells at their grid positions
    gridCells.forEach(([x, y]) => {
      const idx = y * 5 + x;
      if(cells[idx] && idx >= 0 && idx < 25){
        cells[idx].style.background=PLAYERS[currentPlayer].color;
        cells[idx].style.borderRadius='4px';
      }
    });
    
    cells.forEach(c=>grid.appendChild(c));
    wrapper.appendChild(grid);

    // Click to select piece (or rotate if already selected)
    const selectPiece = (e)=>{
      if(isUsed) return;
      
      // Check if this piece is already selected BEFORE deselecting others
      // The most reliable check is if this wrapper is the selectedPieceElement
      if(selectedPieceElement === wrapper && selectedPiece && getCurrentOrientation().length > 0){
        // Rotate the already-selected piece
        rotatePiece(selectedOrientation);
        // Update ghost preview if in preview mode or if we have a last hovered cell
        if(isPreviewing() && previewCell){
          const x=parseInt(previewCell.dataset.x,10);
          const y=parseInt(previewCell.dataset.y,10);
          updateGhostPreview(previewCell, x, y);
        } else if(lastHoveredCell){
          updateGhostPreview(lastHoveredCell, lastHoveredCell.dataset.x, lastHoveredCell.dataset.y);
        }
        // Update visual representation in palette
        updateSelectedPieceVisual();
        if(e) e.stopPropagation();
        return;
      }
      
      // Otherwise, select this piece
      // Deselect other pieces (use cached if available)
      if(cachedPieceElements){
        cachedPieceElements.forEach(p=>p.classList.remove('selected'));
      } else {
        document.querySelectorAll('.piece').forEach(p=>p.classList.remove('selected'));
      }
      // Clear preview mode when selecting new piece
      setPreviewMode(false);
      previewCell = null;
      clearGhost();
      // Select this piece
      wrapper.classList.add('selected');
      selectedPiece = JSON.parse(JSON.stringify(piece));
      selectedOrientation.index = 0; // Start with first orientation
      selectedPieceElement = wrapper;
      // Invalidate bounding box cache for new piece
      cachedBoundingBox = null;
      // Make the selected piece draggable
      wrapper.draggable = true;
      // Update visual
      updateSelectedPieceVisual();
    };
    // Track mouse position to distinguish clicks from drags
    let mouseDownPos = null;
    let clickHandled = false;
    wrapper.addEventListener('mousedown', (e)=>{
      mouseDownPos = {x: e.clientX, y: e.clientY};
      clickHandled = false;
    });
    wrapper.addEventListener('mouseup', (e)=>{
      if(mouseDownPos){
        const moved = Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5;
        if(!moved){
          // It's a click, not a drag
          selectPiece(e);
          clickHandled = true;
        }
        mouseDownPos = null;
      }
    });
    // Also handle click as fallback (in case mouseup doesn't fire)
    wrapper.addEventListener('click', (e)=>{
      if(!clickHandled){
        selectPiece(e);
      }
      clickHandled = false;
    });
    // Touch support for selection and dragging
    let touchStartPos = null;
    let touchStartedOnThisPiece = false;
    
    wrapper.addEventListener('touchstart',(e)=>{
      const touch = e.touches[0];
      if(touch){
        touchStartPos = {x: touch.clientX, y: touch.clientY};
        touchStartedOnThisPiece = wrapper.classList.contains('selected') && !isUsed && selectedPiece;
        if(touchStartedOnThisPiece){
          handleDragStart(touch.clientX, touch.clientY);
        }
        e.preventDefault();
      }
    }, {passive: false});
    
    wrapper.addEventListener('touchmove',(e)=>{
      // Only handle if this piece started the drag
      if(touchStartedOnThisPiece && selectedPiece && touchStartPos && e.touches[0]){
        const touch = e.touches[0];
        // Call handleDragMove but don't preventDefault - let document handler do it
        // This ensures document handler can also process the event globally
        handleDragMove(touch.clientX, touch.clientY);
      }
      // Don't preventDefault here - document handler will handle it globally
    }, {passive: false});
    
    wrapper.addEventListener('touchend', (e)=>{
      e.preventDefault();
      if(touchStartPos && e.changedTouches && e.changedTouches[0]){
        const touch = e.changedTouches[0];
        const wasTap = isTapMovement(touchStartPos.x, touchStartPos.y, touch.clientX, touch.clientY, 10);
        
        if(wasTap && !touchStartedOnThisPiece){
          // Tap on unselected piece - select it
          selectPiece();
        } else if(touchStartedOnThisPiece){
          // Was interacting with selected piece
          const result = handleDragEnd(touch.clientX, touch.clientY);
          if(result){
            if(result.type === 'tap'){
              // Tap on selected piece - rotate it
              if(selectedPieceElement === wrapper){
                rotatePiece(selectedOrientation);
                updateSelectedPieceVisual();
                if(isPreviewing() && previewCell){
                  const x=parseInt(previewCell.dataset.x,10);
                  const y=parseInt(previewCell.dataset.y,10);
                  updateGhostPreview(previewCell, x, y);
                }
              }
            } else if(result.type === 'drag' && result.cell){
              // Was a drag - place the piece
              handlePlacement(result.cell, result.x, result.y);
            }
          }
        }
        touchStartPos = null;
        touchStartedOnThisPiece = false;
      } else {
        // Fallback
        if(!isDragging()){
          selectPiece();
        }
      }
    });
    
    wrapper.addEventListener('touchcancel',()=>{
      if(touchStartedOnThisPiece){
        interactionState = InteractionState.NONE;
        hoveringCell = null;
      }
      touchStartPos = null;
      touchStartedOnThisPiece = false;
      setPreviewMode(false);
      previewCell = null;
      clearGhost();
    });

    // Make piece draggable only when selected
    wrapper.addEventListener('dragstart',e=>{
      if(!wrapper.classList.contains('selected') || isUsed){
        e.preventDefault();return;
      }
      // Start drag interaction - HTML5 drag immediately goes to DRAGGING state
      interactionState = InteractionState.DRAGGING;
      // Use transparent drag image so it doesn't overlay the ghost preview
      e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    });
    wrapper.addEventListener('dragend',(e)=>{ 
      // Don't handle placement here - onDrop handles it
      // This handler just cleans up state
      interactionState = InteractionState.NONE;
      hoveringCell = null;
      setPreviewMode(false);
      previewCell = null;
      clearGhost();
    });

    paletteEl.appendChild(wrapper);
    cachedPieceElements.push(wrapper); // Cache piece element
  });
}

// --- RENDER SCORES ---
function renderScores(){
  if(!scoresEl || !gameMode) return;
  
  // Calculate scores for all players
  const allPlayerScores = calculateAllPlayerScores();
  
  // Sort by score (highest first - leader)
  allPlayerScores.sort((a, b) => b.score - a.score);
  
  // Clear and render
  scoresEl.innerHTML = '';
  allPlayerScores.forEach((ps) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '4px';
    row.style.marginBottom = '8px';
    row.style.padding = '8px';
    row.style.borderRadius = '4px';
    
    // Check if current player controls any of this player's colors
    const isCurrentPlayer = ps.colors.includes(currentPlayer);
    if(isCurrentPlayer){
      row.style.backgroundColor = 'rgba(43, 138, 239, 0.1)';
      row.style.border = '1px solid rgba(43, 138, 239, 0.3)';
    } else {
      row.style.border = '1px solid transparent';
    }
    
    // Main score row
    const mainRow = document.createElement('div');
    mainRow.style.display = 'flex';
    mainRow.style.alignItems = 'center';
    mainRow.style.gap = '8px';
    
    // Player label
    const label = document.createElement('span');
    label.style.fontWeight = '600';
    label.style.fontSize = '14px';
    if(ps.playerNumber === 'computer'){
      label.textContent = 'Computer:';
      label.style.color = '#666';
    } else if(typeof ps.playerNumber === 'string' && ps.playerNumber.startsWith('computer-')){
      // Individual computer color in 4-player mode
      const colorName = ps.playerNumber.replace('computer-', '');
      label.textContent = `Computer (${colorName}):`;
      label.style.color = '#666';
    } else {
      label.textContent = `Player ${ps.playerNumber}:`;
    }
    mainRow.appendChild(label);
    
    // Total score
    const scoreText = document.createElement('span');
    scoreText.textContent = ps.score;
    scoreText.style.fontSize = '14px';
    scoreText.style.fontWeight = '600';
    mainRow.appendChild(scoreText);
    
    row.appendChild(mainRow);
    
    // Color breakdown
    if(ps.colorBreakdown && ps.colorBreakdown.length > 0){
      const breakdown = document.createElement('div');
      breakdown.style.display = 'flex';
      breakdown.style.alignItems = 'center';
      breakdown.style.gap = '6px';
      breakdown.style.fontSize = '12px';
      breakdown.style.color = '#666';
      breakdown.style.marginLeft = '4px';
      
      const breakdownParts = ps.colorBreakdown.map(cb => {
        const swatch = document.createElement('span');
        swatch.style.display = 'inline-block';
        swatch.style.width = '8px';
        swatch.style.height = '8px';
        swatch.style.borderRadius = '2px';
        swatch.style.background = PLAYERS[cb.colorId].color;
        swatch.style.marginRight = '2px';
        swatch.style.verticalAlign = 'middle';
        
        return `${cb.colorName}: ${cb.score}`;
      });
      
      breakdown.textContent = `(${breakdownParts.join(', ')})`;
      row.appendChild(breakdown);
    }
    
    scoresEl.appendChild(row);
  });
}

// --- GHOST PREVIEW ---
let ghostCells = [];
// Cache bounding box for selected orientation to avoid recalculation
let cachedBoundingBox = null;

function clearGhost(){ 
  // Efficiently clear only cells that have ghost classes
  ghostCells.forEach(c=>{
    if(c) {
      c.classList.remove('ghost','illegal');
      c.style.removeProperty('--ghost-color');
    }
  }); 
  ghostCells=[]; 
}

// Cache bounding box when orientation changes (no longer needed, but kept for compatibility)
function updateBoundingBoxCache(){
  const cells = getCurrentOrientation();
  if(!cells || cells.length === 0){
    cachedBoundingBox = null;
    return;
  }
  cachedBoundingBox = {
    minX: Math.min(...cells.map(c=>c[0])),
    minY: Math.min(...cells.map(c=>c[1])),
    maxX: Math.max(...cells.map(c=>c[0])),
    maxY: Math.max(...cells.map(c=>c[1]))
  };
}

function updateGhostPreview(cellEl, x, y){
  if((!isDragging() && !isPreviewing()) || !selectedPiece || !cellEls) {
    clearGhost();
    return;
  }
  
  // Clear previous ghost
  clearGhost();
  
  // Get orientation key for cache lookup
  const currentCells = getCurrentOrientation();
  if(!currentCells || currentCells.length === 0) return;
  const orientationKey = orientationToKey(currentCells);
  
  // Look up precomputed placement from cache (zero math, zero GC)
  const placed = placementCache[selectedPiece.id]?.[orientationKey]?.[y]?.[x];
  if(!placed) {
    // No valid placement for this position
    return;
  }
  
  // Validate placement (still need to check board state)
  const isLegal = isEmpty(placed) && validBlokusContact(placed, currentPlayer);
  
  const playerColor = PLAYERS[currentPlayer].color;
  
  // Batch DOM updates: collect all changes first, then apply
  const updates = [];
  for(const [px, py] of placed){
    if(px >= 0 && px < SIZE && py >= 0 && py < SIZE && cellEls[py] && cellEls[py][px]){
      updates.push({
        cell: cellEls[py][px],
        isLegal: isLegal
      });
    }
  }
  
  // Apply all updates in batch
  updates.forEach(({cell, isLegal}) => {
    cell.classList.add('ghost');
    if(!isLegal) cell.classList.add('illegal');
    cell.style.setProperty('--ghost-color', playerColor);
    ghostCells.push(cell);
  });
}

// --- DRAG TARGETS ON BOARD ---
function onDragOver(e){ 
  e.preventDefault(); 
  if(isDragging() && selectedPiece){
    const x=parseInt(e.currentTarget.dataset.x,10);
    const y=parseInt(e.currentTarget.dataset.y,10);
    lastHoveredCell = e.currentTarget;
    hoveringCell = {x, y};
    updateGhostPreview(e.currentTarget, x, y);
  }
}

// Handle cell click/tap with preview mode
function handleCellInteraction(cellEl, x, y){
  if(!selectedPiece || isDragging()) return;
  
  // If already in preview mode and clicking the same cell, confirm placement
  if(isPreviewing() && previewCell === cellEl){
    handlePlacement(cellEl, x, y);
    setPreviewMode(false);
    previewCell = null;
    clearGhost();
    return;
  }
  
  // Otherwise, enter preview mode or update preview position
  setPreviewMode(true);
  previewCell = cellEl;
  updateGhostPreview(cellEl, x, y);
}
function handlePlacement(cellEl, x, y){
  if(!selectedPiece || isPlacing) return;
  // Block placement if it's not a human player's turn (but allow computer moves)
  if(!isComputerTurn(currentPlayer) && !isCurrentPlayerTurn()){
    showToast('Not your turn');
    return;
  }
  isPlacing = true; // Prevent duplicate calls
  
  // Use placement cache instead of recalculating
  const orientationKey = orientationToKey(getCurrentOrientation());
  const placed = placementCache[selectedPiece.id]?.[orientationKey]?.[y]?.[x];
  
  if(!placed) {
    isPlacing = false; // Reset guard on failure
    showToast('Outside board'); 
    return; 
  }

  if(!isEmpty(placed)){ 
    isPlacing = false; // Reset guard on failure
    showToast('Collides with existing piece'); 
    return; 
  }
  if(!validBlokusContact(placed,currentPlayer)){
    isPlacing = false; // Reset guard on failure
    showToast('Invalid Blokus placement'); 
    return; 
  }

  placed.forEach(([px,py])=>board[py][px]={player:currentPlayer});
  usedPieces[currentPlayer].add(selectedPiece.id);
  history.push({player:currentPlayer,placed,pid:selectedPiece.id});

  // Invalidate valid moves cache for all players (board changed)
  PLAYERS.forEach(p => validMovesCache[p.id] = undefined);
  
  // Update shared color turn after a move is made on shared color (3-player mode)
  if(sharedColor !== null && currentPlayer === sharedColor){
    sharedColorTurn = (sharedColorTurn % 3) + 1;
  }

  selectedPiece=null;selectedOrientation.index=0;selectedPieceElement=null;
  setDragging(false);
  setPreviewMode(false);
  previewCell = null;
  clearGhost();
  // Deselect piece (use cached if available)
  if(cachedPieceElements){
    cachedPieceElements.forEach(p=>p.classList.remove('selected'));
  } else {
    document.querySelectorAll('.piece').forEach(p=>p.classList.remove('selected'));
  }
  isPlacing = false; // Reset guard
  nextTurn();renderBoard();renderPalette();
}

function onDrop(e){
  e.preventDefault();
  // Only handle if not already placing (prevents duplicate calls)
  if(!isDragging() || !selectedPiece || isPlacing) return;
  const x=parseInt(e.currentTarget.dataset.x,10);
  const y=parseInt(e.currentTarget.dataset.y,10);
  handlePlacement(e.currentTarget, x, y);
}

// --- RULES / HELPERS ---
function isInsideBoard(cells){return cells.every(([x,y])=>x>=0&&x<SIZE&&y>=0&&y<SIZE);} 
function isEmpty(cells){return cells.every(([x,y])=>board[y][x]===null);} 
function validBlokusContact(cells,player){
  // For first move, must be placed in any corner
  if(usedPieces[player].size===0){
    const corners = [
      [0, 0],                    // top-left
      [0, SIZE-1],              // bottom-left
      [SIZE-1, 0],              // top-right
      [SIZE-1, SIZE-1]          // bottom-right
    ];
    if(!cells.some(([x,y])=>corners.some(([cx,cy])=>x===cx&&y===cy))) return false;
  }
  let hasCorner=false;
  for(const [x,y] of cells){
    const sides=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
    for(const [nx,ny] of sides){
      if(nx>=0&&nx<SIZE&&ny>=0&&ny<SIZE&&board[ny][nx]&&board[ny][nx].player===player) return false;
    }
    const corners=[[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]];
    for(const [cx,cy] of corners){
      if(cx>=0&&cx<SIZE&&cy>=0&&cy<SIZE&&board[cy][cx]&&board[cy][cx].player===player) hasCorner=true;
    }
  }
  if(usedPieces[player].size===0) return true;
  return hasCorner;
}

// Check if a player has any valid moves (with caching)
function hasValidMoves(player, returnHint = false){
  // If returning hint, bypass cache to get actual hint string
  if(!returnHint && validMovesCache[player] !== undefined){
    return validMovesCache[player];
  }
  
  // Get all unused pieces for this player
  const unusedPieces = PIECES.filter(p => !usedPieces[player].has(p.id));
  if(unusedPieces.length === 0) {
    validMovesCache[player] = false;
    if(returnHint) return `Player ${PLAYERS[player].name} has no more pieces available`;
    return false;
  }
  
  // For each unused piece, try all precomputed orientations at all positions
  for(const piece of unusedPieces){
    const orientations = PIECE_ORIENTATIONS.get(piece.id);
    if(!orientations) continue;
    
    // Try each orientation at every position on the board
    for(const orientation of orientations){
      const orientationKey = orientationToKey(orientation);
      const bbox = boundingBoxCache[piece.id]?.[orientationKey];
      if(!bbox) continue; // Skip if no bounding box cached
      
      // Try placing at every position using placement cache
      for(let y = 0; y < SIZE; y++){
        for(let x = 0; x < SIZE; x++){
          // Use precomputed placement from cache
          const placed = placementCache[piece.id]?.[orientationKey]?.[y]?.[x];
          if(!placed) continue; // Skip invalid placements
          
          // Check if valid (placement already adjusted and inside board)
          if(isEmpty(placed) && validBlokusContact(placed, player)){
            validMovesCache[player] = true; // Found at least one valid move
            const hint = `${PLAYERS[player].name} can place piece ${piece.name} at position (${x}, ${y})`;
            if (returnHint) return hint;
            return true;
          }
        }
      }
    }
  }
  
  validMovesCache[player] = false;
  if(returnHint) return `Player ${PLAYERS[player].name} has no valid moves available`;
  return false; // No valid moves found
}

// Get the number of unplayed squares for a player
function getUnplayedSquares(playerId){
  const unusedPieces = PIECES.filter(p => !usedPieces[playerId].has(p.id));
  return unusedPieces.reduce((total, piece) => total + piece.cells.length, 0);
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

// Get the size (number of cells) of a piece by its ID
function getPieceSize(pieceId){
  const piece = PIECES.find(p => p.id === pieceId);
  return piece ? piece.cells.length : 0;
}

// Calculate a color's score according to official Blokus rules
function calculateColorScore(colorId){
  const unplayedSquares = getUnplayedSquares(colorId);
  let score = -unplayedSquares; // Base score: -1 per unplayed square
  
  // Check if all 21 pieces were played
  if(usedPieces[colorId].size === 21){
    const lastPiece = getLastPiecePlayed(colorId);
    if(lastPiece === '1'){ // Monomino bonus
      score += 20;
    } else {
      score += 15;
    }
  }
  
  return score;
}

// Calculate a player's total score (sum of all colors they control)
function calculatePlayerScore(playerNumber){
  const playerColors = getColorsForPlayer(playerNumber);
  if(playerColors.length === 0) return 0;
  
  let totalScore = 0;
  playerColors.forEach(colorId => {
    totalScore += calculateColorScore(colorId);
  });
  
  return totalScore;
}

// Calculate all player scores for end game
function calculateAllPlayerScores(){
  const playerScores = [];
  
  // Get all unique player numbers (excluding 'computer' and 'shared')
  const playerNumbers = new Set();
  for(let colorId = 0; colorId < 4; colorId++){
    const player = getPlayerForColor(colorId);
    if(player && player !== 'computer' && player !== 'shared' && typeof player === 'number'){
      playerNumbers.add(player);
    }
  }
  
  // Add computer if it exists
  let hasComputer = false;
  for(let colorId = 0; colorId < 4; colorId++){
    if(isComputerTurn(colorId)){
      hasComputer = true;
      break;
    }
  }
  
  // Calculate scores for each player
  playerNumbers.forEach(playerNum => {
    const colors = getColorsForPlayer(playerNum);
    let totalScore = 0;
    const colorBreakdown = [];
    
    colors.forEach(colorId => {
      const colorScore = calculateColorScore(colorId);
      totalScore += colorScore;
      colorBreakdown.push({
        colorId: colorId,
        colorName: PLAYERS[colorId].name,
        score: colorScore
      });
    });
    
    playerScores.push({
      playerNumber: playerNum,
      score: totalScore,
      colors: colors,
      colorBreakdown: colorBreakdown
    });
  });
  
  // Calculate computer score if it exists
  if(hasComputer){
    // In 4-player vs computer mode, show each computer color separately
    // In 2-player vs computer mode, aggregate computer colors
    const computerColors = [];
    for(let colorId = 0; colorId < 4; colorId++){
      if(isComputerTurn(colorId)){
        computerColors.push(colorId);
      }
    }
    
    if(gameMode === 'vsComputer' && numberOfPlayers === 4){
      // 4-player mode: show each computer color separately
      for(const colorId of computerColors){
        const colorScore = calculateColorScore(colorId);
        playerScores.push({
          playerNumber: `computer-${PLAYERS[colorId].name}`,
          score: colorScore,
          colors: [colorId],
          colorBreakdown: [{
            colorId: colorId,
            colorName: PLAYERS[colorId].name,
            score: colorScore
          }]
        });
      }
    } else {
      // 2-player mode: aggregate computer colors
      const computerBreakdown = [];
      let computerScore = 0;
      
      for(const colorId of computerColors){
        const colorScore = calculateColorScore(colorId);
        computerScore += colorScore;
        computerBreakdown.push({
          colorId: colorId,
          colorName: PLAYERS[colorId].name,
          score: colorScore
        });
      }
      
      playerScores.push({
        playerNumber: 'computer',
        score: computerScore,
        colors: computerColors,
        colorBreakdown: computerBreakdown
      });
    }
  }
  
  return playerScores;
}

// Sort player scores with tiebreaker rules
function sortPlayerScoresWithTiebreaker(playerScores){
  // First sort by score (highest first)
  playerScores.sort((a, b) => b.score - a.score);
  
  // Group players by score to handle ties
  const scoreGroups = [];
  let currentGroup = [];
  let currentScore = null;
  
  for(const ps of playerScores){
    if(ps.score !== currentScore){
      if(currentGroup.length > 0){
        scoreGroups.push({score: currentScore, players: currentGroup});
      }
      currentGroup = [ps];
      currentScore = ps.score;
    } else {
      currentGroup.push(ps);
    }
  }
  if(currentGroup.length > 0){
    scoreGroups.push({score: currentScore, players: currentGroup});
  }
  
  // Sort each group using tiebreaker rules
  const sortedScores = [];
  for(const group of scoreGroups){
    if(group.players.length === 1){
      // No tie, just add the player
      sortedScores.push(...group.players);
    } else {
      // There's a tie - apply tiebreaker rules
      const tiedPlayers = group.players.map(ps => ps.player);
      const allPiecesPlaced = tiedPlayers.every(p => usedPieces[p.id].size === 21);
      
      // Create a map of player to their tiebreaker value for sorting
      const tiebreakerValues = new Map();
      
      if(allPiecesPlaced){
        // Special case: All tied players placed all pieces
        // Sort by who placed piece "1" last (most recent = better rank)
        const monominoIndices = new Map();
        
        for(let i = history.length - 1; i >= 0; i--){
          const move = history[i];
          if(!move.pass && move.pid === '1' && tiedPlayers.some(p => p.id === move.player)){
            if(!monominoIndices.has(move.player)){
              monominoIndices.set(move.player, i);
            }
          }
        }
        
        // Players with monomino get higher rank (higher index = more recent = better)
        // Players without monomino get worst rank (Infinity)
        for(const player of tiedPlayers){
          const index = monominoIndices.get(player.id);
          // Use negative index so higher index (more recent) = smaller value (better rank)
          tiebreakerValues.set(player.id, index !== undefined ? -index : Infinity);
        }
      } else {
        // Regular tiebreaker: sort by smallest last piece size
        // If same size, most recent wins (higher index = better)
        const lastPieceSizes = new Map();
        const lastPieceIndices = new Map();
        
        // Find last piece for each player
        for(let i = history.length - 1; i >= 0; i--){
          const move = history[i];
          if(!move.pass && move.pid && tiedPlayers.some(p => p.id === move.player)){
            if(!lastPieceIndices.has(move.player)){
              const pieceSize = getPieceSize(move.pid);
              lastPieceSizes.set(move.player, pieceSize);
              lastPieceIndices.set(move.player, i);
            }
          }
        }
        
        // Sort by: smaller piece size first, then by most recent (higher index)
        for(const player of tiedPlayers){
          const pieceSize = lastPieceSizes.get(player.id) || Infinity;
          const moveIndex = lastPieceIndices.get(player.id) || -1;
          // Smaller piece size = better rank (smaller value)
          // Higher move index (more recent) = better rank (smaller value)
          // Use pieceSize * large_number - moveIndex so smaller piece and more recent = smaller value
          tiebreakerValues.set(player.id, pieceSize * 10000 - moveIndex);
        }
      }
      
      // Sort the tied players by tiebreaker value
      group.players.sort((a, b) => {
        const valA = tiebreakerValues.get(a.player.id) ?? Infinity;
        const valB = tiebreakerValues.get(b.player.id) ?? Infinity;
        return valA - valB; // Lower value = better rank
      });
      
      sortedScores.push(...group.players);
    }
  }
  
  return sortedScores;
}

// Render final scores in the win message (same style as renderScores)
function renderFinalScores(){
  if(!finalScoresEl || !gameMode) return;
  
  // Calculate scores for all players (player-based)
  const allPlayerScores = calculateAllPlayerScores();
  
  // Sort by score (highest first)
  allPlayerScores.sort((a, b) => b.score - a.score);
  
  // Clear and render
  finalScoresEl.innerHTML = '';
  allPlayerScores.forEach((ps) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '4px';
    row.style.marginBottom = '8px';
    row.style.padding = '8px';
    row.style.borderRadius = '4px';
    
    // Main score row
    const mainRow = document.createElement('div');
    mainRow.style.display = 'flex';
    mainRow.style.alignItems = 'center';
    mainRow.style.gap = '8px';
    
    // Player label
    const label = document.createElement('span');
    label.style.fontWeight = '600';
    label.style.fontSize = '14px';
    if(ps.playerNumber === 'computer'){
      label.textContent = 'Computer:';
      label.style.color = '#666';
    } else if(typeof ps.playerNumber === 'string' && ps.playerNumber.startsWith('computer-')){
      // Individual computer color in 4-player mode
      const colorName = ps.playerNumber.replace('computer-', '');
      label.textContent = `Computer (${colorName}):`;
      label.style.color = '#666';
    } else {
      label.textContent = `Player ${ps.playerNumber}:`;
    }
    mainRow.appendChild(label);
    
    // Total score
    const scoreText = document.createElement('span');
    scoreText.textContent = ps.score;
    scoreText.style.fontSize = '14px';
    scoreText.style.fontWeight = '600';
    mainRow.appendChild(scoreText);
    
    row.appendChild(mainRow);
    
    // Color breakdown
    if(ps.colorBreakdown && ps.colorBreakdown.length > 0){
      const breakdown = document.createElement('div');
      breakdown.style.display = 'flex';
      breakdown.style.alignItems = 'center';
      breakdown.style.gap = '6px';
      breakdown.style.fontSize = '12px';
      breakdown.style.color = '#666';
      breakdown.style.marginLeft = '4px';
      
      const breakdownParts = ps.colorBreakdown.map(cb => {
        return `${cb.colorName}: ${cb.score}`;
      });
      
      breakdown.textContent = `(${breakdownParts.join(', ')})`;
      row.appendChild(breakdown);
    }
    
    finalScoresEl.appendChild(row);
  });
}

// End game and show results
function endGame(){
  if(!gameMode) return;
  
  // Calculate scores for all players (player-based)
  const allPlayerScores = calculateAllPlayerScores();
  
  // Sort by score (highest first)
  allPlayerScores.sort((a, b) => b.score - a.score);
  
  // Check for ties and apply tiebreaker rules
  let winner = allPlayerScores[0];
  const topScore = winner.score;
  
  // Find all players with the top score (potential ties)
  const tiedPlayers = allPlayerScores.filter(ps => ps.score === topScore);
  
  if(tiedPlayers.length > 1){
    // There's a tie - apply tiebreaker rules
    // For player-based scoring, we need to check the last piece played across all their colors
    let winnerWithTiebreaker = null;
    let bestTiebreakerValue = Infinity;
    
    for(const tiedPlayer of tiedPlayers){
      // Find the best (smallest) last piece across all colors for this player
      let smallestLastPieceSize = Infinity;
      let mostRecentMoveIndex = -1;
      
      for(const colorId of tiedPlayer.colors){
        const lastPieceId = getLastPiecePlayed(colorId);
        if(lastPieceId){
          const pieceSize = getPieceSize(lastPieceId);
          if(pieceSize < smallestLastPieceSize){
            smallestLastPieceSize = pieceSize;
          }
        }
      }
      
      // Find the most recent move with the smallest piece size
      for(let i = history.length - 1; i >= 0; i--){
        const move = history[i];
        if(!move.pass && move.pid && tiedPlayer.colors.includes(move.player)){
          const pieceSize = getPieceSize(move.pid);
          if(pieceSize === smallestLastPieceSize && i > mostRecentMoveIndex){
            mostRecentMoveIndex = i;
          }
        }
      }
      
      // Check if all pieces were placed
      const allPiecesPlaced = tiedPlayer.colors.every(colorId => usedPieces[colorId].size === 21);
      
      let tiebreakerValue;
      if(allPiecesPlaced){
        // Special case: Check for monomino bonus
        let monominoIndex = -1;
        for(let i = history.length - 1; i >= 0; i--){
          const move = history[i];
          if(!move.pass && move.pid === '1' && tiedPlayer.colors.includes(move.player)){
            if(i > monominoIndex){
              monominoIndex = i;
            }
          }
        }
        // Lower index (more recent) = better, so use negative
        tiebreakerValue = monominoIndex !== -1 ? -monominoIndex : Infinity;
      } else {
        // Regular tiebreaker: smaller piece and more recent = better
        tiebreakerValue = smallestLastPieceSize * 10000 - mostRecentMoveIndex;
      }
      
      if(tiebreakerValue < bestTiebreakerValue){
        bestTiebreakerValue = tiebreakerValue;
        winnerWithTiebreaker = tiedPlayer;
      }
    }
    
    if(winnerWithTiebreaker){
      winner = winnerWithTiebreaker;
    }
  }
  
  // Set winner name
  if(winMessagePlayerEl){
    if(winner.playerNumber === 'computer'){
      winMessagePlayerEl.textContent = 'Computer';
    } else if(typeof winner.playerNumber === 'string' && winner.playerNumber.startsWith('computer-')){
      // Individual computer color in 4-player mode
      const colorName = winner.playerNumber.replace('computer-', '');
      winMessagePlayerEl.textContent = `Computer (${colorName})`;
    } else {
      winMessagePlayerEl.textContent = `Player ${winner.playerNumber}`;
    }
  }
  
  // Check if any players have valid moves
  const playersWithValidMoves = PLAYERS.filter(p => hasValidMoves(p.id));
  const hasNoValidMoves = playersWithValidMoves.length === 0;
  
  // Show/hide "No more valid moves" message
  if(noValidMovesEl){
    noValidMovesEl.style.display = hasNoValidMoves ? 'inline-block' : 'none';
  }
  
  // Set winner border color CSS variable (use first color of winner)
  const root = document.documentElement;
  if(winner.colors && winner.colors.length > 0){
    const winnerColor = PLAYERS[winner.colors[0]].color;
    root.style.setProperty('--winner-border-color', winnerColor);
  }
  
  // Render final scores
  renderFinalScores();
  
  // Show win message and hide sidebar elements
  if(winMessageEl){
    winMessageEl.style.display = 'block';
  }
  
  // Hide .scores and .controls in the sidebar
  const scoresEl = document.querySelector('.scores');
  const controlsEl = document.querySelector('.controls');
  if(scoresEl) scoresEl.style.display = 'none';
  if(controlsEl) controlsEl.style.display = 'none';
}

// Log all player scores to console
function logPlayerScores(){
  if(!gameMode) return;
  const allPlayerScores = calculateAllPlayerScores();
  console.log('Player scores:', allPlayerScores);
}

function nextTurn(){ 
  // Check how many players have valid moves BEFORE advancing
  const playersWithValidMoves = PLAYERS.filter(p => hasValidMoves(p.id));
  const validMoveCount = playersWithValidMoves.length;
  
  // If only one player has valid moves, switch to that player so they can place final pieces
  if(validMoveCount === 1){
    const remainingPlayer = playersWithValidMoves[0];
    currentPlayer = remainingPlayer.id; // Switch to the remaining player
    showToast(`Player ${remainingPlayer.name} is the only player left with valid moves.`);
    logPlayerScores();
    updateBoardBorder();
    updateTurnIndicator();
    renderScores();
    
    // If it's computer's turn, auto-execute
    if(isComputerTurn(currentPlayer)){
      setTimeout(() => executeAutoMove(), 500);
    }
    return;
  }
  
  // If no players have valid moves, end game (don't show new toast, don't advance)
  if(validMoveCount === 0){
    // No players have valid moves - game over, calculate scores
    endGame();
    // Don't advance currentPlayer
    logPlayerScores();
    updateBoardBorder();
    updateTurnIndicator();
    renderScores();
    return;
  }
  
  // Normal turn advancement (2+ players still have valid moves)
  const startPlayer = currentPlayer;
  let attempts = 0;
  
  // Advance to next color (always in order: 0→1→2→3)
  currentPlayer = (currentPlayer + 1) % PLAYERS.length;
  
  // Skip players with no valid moves
  while(!hasValidMoves(currentPlayer) && attempts < PLAYERS.length){
    const playerName = PLAYERS[currentPlayer].name;
    showToast(`Player ${playerName} has no more valid options.`);
    currentPlayer = (currentPlayer + 1) % PLAYERS.length;
    attempts++;
  }
  
  // Log scores after each turn
  logPlayerScores();
  
  // Update board border color for new current player
  updateBoardBorder();
  updateTurnIndicator();
  
  // Update scores display
  renderScores();
  
  // If it's computer's turn, auto-execute move
  if(isComputerTurn(currentPlayer)){
    setTimeout(() => executeAutoMove(), 500);
  }
}

// --- ROTATION / FLIP ---
function rotatePiece(orientation){
  // Just increment index into precomputed orientations (zero calculations)
  if(!selectedPiece) return;
  const orientations = PIECE_ORIENTATIONS.get(selectedPiece.id);
  if(!orientations || orientations.length === 0) return;
  orientation.index = (orientation.index + 1) % orientations.length;
}

function flipPiece(orientation){
  // Find matching flipped orientation in precomputed list (zero calculations)
  if(!selectedPiece) return;
  const orientations = PIECE_ORIENTATIONS.get(selectedPiece.id);
  if(!orientations || orientations.length === 0) return;
  
  const currentCells = getCurrentOrientation();
  const currentKey = orientationToKey(currentCells);
  
  // Generate what the flipped version would be
  const flipped = currentCells.map(([x, y]) => [-x, y]);
  const flippedNormalized = normalizeOrientation(flipped);
  const flippedKey = orientationToKey(flippedNormalized);
  
  // Find matching orientation in precomputed list
  const flippedIndex = orientations.findIndex(orient => orientationToKey(orient) === flippedKey);
  if(flippedIndex !== -1){
    orientation.index = flippedIndex;
  }
}

function updateSelectedPieceVisual(){
  const currentCells = getCurrentOrientation();
  if(!selectedPieceElement || !currentCells || currentCells.length === 0) return;
  const grid = selectedPieceElement.querySelector('div[style*="grid"]');
  if(!grid) return;
  // Clear all cells
  grid.querySelectorAll('.px').forEach(c=>{
    c.style.background='';
    c.style.borderRadius='';
  });
  
  // Convert current orientation to 5x5 grid positions (normalized and centered)
  const gridCells = pieceToGrid({cells: currentCells});
  
  // Draw cells at their grid positions
  gridCells.forEach(([x, y]) => {
    const idx = y * 5 + x;
    const cell = grid.querySelectorAll('.px')[idx];
    if(cell && idx >= 0 && idx < 25){
      cell.style.background=PLAYERS[currentPlayer].color;
      cell.style.borderRadius='4px';
    }
  });
}

// --- AUTO-MOVE ---

// Score a placement position (higher = better)
function scorePlacement(placed, player){
  let score = 0;
  
  // Prefer placements closer to corners (especially early game)
  const corners = [
    [0, 0], [0, SIZE-1], [SIZE-1, 0], [SIZE-1, SIZE-1]
  ];
  
  // Check if any cell is in a corner
  const isInCorner = placed.some(([x, y]) => 
    corners.some(([cx, cy]) => x === cx && y === cy)
  );
  if(isInCorner){
    score += 100; // Big bonus for corner placement
  }
  
  // Prefer placements closer to edges (but not as much as corners)
  const isOnEdge = placed.some(([x, y]) => 
    x === 0 || x === SIZE-1 || y === 0 || y === SIZE-1
  );
  if(isOnEdge && !isInCorner){
    score += 20;
  }
  
  // Prefer placements that don't block future moves
  // Count how many adjacent empty cells this placement has
  let adjacentEmpty = 0;
  const checked = new Set();
  for(const [x, y] of placed){
    const neighbors = [[x-1,y], [x+1,y], [x,y-1], [x,y+1]];
    for(const [nx, ny] of neighbors){
      const key = `${nx},${ny}`;
      if(checked.has(key)) continue;
      checked.add(key);
      if(nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && board[ny][nx] === null){
        adjacentEmpty++;
      }
    }
  }
  score += adjacentEmpty * 2; // More adjacent empty = better
  
  // Slight preference for center positions (but less than corners/edges)
  const centerX = SIZE / 2;
  const centerY = SIZE / 2;
  for(const [x, y] of placed){
    const distFromCenter = Math.abs(x - centerX) + Math.abs(y - centerY);
    score += (SIZE - distFromCenter) * 0.1; // Closer to center = slightly better
  }
  
  // Add player-specific variation to make different computer colors play differently
  // Use player ID as a seed for variation (so each color has consistent but different preferences)
  const playerVariation = (player * 17) % 50; // Variation between 0-49 based on player
  score += playerVariation;
  
  // Add small random factor to break ties and add unpredictability
  // This ensures different computer colors make different moves even in similar situations
  score += Math.random() * 10; // Random factor 0-10
  
  return score;
}

// Find the best valid move for a player using strategy
function findValidMove(player){
  // Get all unused pieces for this player
  const unusedPieces = PIECES.filter(p => !usedPieces[player].has(p.id));
  if(unusedPieces.length === 0) return null;
  
  // Sort pieces by size (largest first) - this is the key strategy
  // Larger pieces are harder to place later, so place them early
  const sortedPieces = [...unusedPieces].sort((a, b) => {
    const sizeA = a.cells.length;
    const sizeB = b.cells.length;
    if(sizeB !== sizeA) return sizeB - sizeA; // Larger first
    
    // If same size, prefer more complex/irregular shapes
    // (pieces with more unique orientations are generally more flexible)
    const orientA = PIECE_ORIENTATIONS.get(a.id)?.length || 0;
    const orientB = PIECE_ORIENTATIONS.get(b.id)?.length || 0;
    return orientB - orientA; // More orientations = more flexible = place later
  });
  
  // Collect all valid moves with their scores
  const validMoves = [];
  
  // For each piece (sorted by size), try all orientations at all positions
  for(const piece of sortedPieces){
    const orientations = PIECE_ORIENTATIONS.get(piece.id);
    if(!orientations) continue;
    
    // Try each orientation at every position on the board
    for(let orientIndex = 0; orientIndex < orientations.length; orientIndex++){
      const orientation = orientations[orientIndex];
      const orientationKey = orientationToKey(orientation);
      
      // Try placing at every position using placement cache
      for(let y = 0; y < SIZE; y++){
        for(let x = 0; x < SIZE; x++){
          // Use precomputed placement from cache
          const placed = placementCache[piece.id]?.[orientationKey]?.[y]?.[x];
          if(!placed) continue; // Skip invalid placements
          
          // Check if valid (placement already adjusted and inside board)
          if(isEmpty(placed) && validBlokusContact(placed, player)){
            const score = scorePlacement(placed, player);
            validMoves.push({
              piece,
              orientationIndex: orientIndex,
              x,
              y,
              placed,
              score
            });
          }
        }
      }
    }
    
    // If we found moves with this piece (largest), prefer the best one
    // This implements "largest piece first" strategy
    if(validMoves.length > 0){
      // Sort by score (highest first)
      validMoves.sort((a, b) => b.score - a.score);
      
      // Instead of always picking the absolute best, pick from top 3 moves
      // This adds variety while still being strategic
      const topMoves = validMoves.slice(0, Math.min(3, validMoves.length));
      const selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];
      return selectedMove;
    }
  }
  
  // Fallback: if no moves found with strategy, return null
  return null;
}

// Execute a single auto-move for the current player
function executeAutoMove(){
  if(!hasValidMoves(currentPlayer)){
    // Current player has no valid moves - pass
    history.push({player: currentPlayer, pass: true});
    nextTurn();
    renderPalette();
    return false; // Continue auto-moving
  }
  
  const move = findValidMove(currentPlayer);
  if(!move) return false; // No move found, should not happen if hasValidMoves is true
  
  // Select the piece
  const pieceElement = cachedPieceElements?.find(el => el.dataset.pid === move.piece.id);
  if(!pieceElement) return false;
  
  // Clear previous selection
  if(cachedPieceElements){
    cachedPieceElements.forEach(p=>p.classList.remove('selected'));
  }
  
  // Select this piece
  pieceElement.classList.add('selected');
  selectedPiece = JSON.parse(JSON.stringify(move.piece));
  selectedOrientation.index = move.orientationIndex;
  selectedPieceElement = pieceElement;
  cachedBoundingBox = null;
  
  // Update visual
  updateSelectedPieceVisual();
  
  // Get the cell element for placement
  const cellEl = cellEls?.[move.y]?.[move.x];
  if(!cellEl) return false;
  
  // Place the piece
  handlePlacement(cellEl, move.x, move.y);
  
  return true; // Move executed successfully
}

// Execute a single auto-move
function makeAutoMove(){
  // Check if game should end
  const playersWithValidMoves = PLAYERS.filter(p => hasValidMoves(p.id));
  if(playersWithValidMoves.length === 0){
    // Game already over, do nothing
    return;
  }
  
  // Execute move for current player
  executeAutoMove();
}

// --- UNDO, PASS, RESTART ---
let lastHoveredCell = null;
window.addEventListener('keydown',e=>{
  if(e.key==='u'||e.key==='U') undo();
});
function undo(){
  const last=history.pop();if(!last){alert('No moves');return;}
  if(last.pass){currentPlayer=last.player;updateBoardBorder();updateTurnIndicator();renderPalette();renderScores();return;}
  last.placed.forEach(([x,y])=>board[y][x]=null);
  usedPieces[last.player].delete(last.pid);
  currentPlayer=last.player;updateBoardBorder();updateTurnIndicator();renderBoard();renderPalette();renderScores();
}
flipBtn.addEventListener('click',()=>{
  if(selectedPiece && getCurrentOrientation().length > 0){
    flipPiece(selectedOrientation);
    updateSelectedPieceVisual();
    // Update ghost preview if in preview mode or if we have a last hovered cell
    if(isPreviewing() && previewCell){
      const x=parseInt(previewCell.dataset.x,10);
      const y=parseInt(previewCell.dataset.y,10);
      updateGhostPreview(previewCell, x, y);
    } else if(lastHoveredCell){
      const x=parseInt(lastHoveredCell.dataset.x,10);
      const y=parseInt(lastHoveredCell.dataset.y,10);
      updateGhostPreview(lastHoveredCell, x, y);
    }
  }
});
rotateBtn.addEventListener('click',()=>{
  if(selectedPiece && getCurrentOrientation().length > 0){
    rotatePiece(selectedOrientation);
    updateSelectedPieceVisual();
    // Update ghost preview if in preview mode or if we have a last hovered cell
    if(isPreviewing() && previewCell){
      const x=parseInt(previewCell.dataset.x,10);
      const y=parseInt(previewCell.dataset.y,10);
      updateGhostPreview(previewCell, x, y);
    } else if(lastHoveredCell){
      const x=parseInt(lastHoveredCell.dataset.x,10);
      const y=parseInt(lastHoveredCell.dataset.y,10);
      updateGhostPreview(lastHoveredCell, x, y);
    }
  }
});
passBtn.addEventListener('click',()=>{
  history.push({player:currentPlayer,pass:true});
  // Update shared color turn after a pass on shared color (3-player mode)
  if(sharedColor !== null && currentPlayer === sharedColor){
    sharedColorTurn = (sharedColorTurn % 3) + 1;
  }
  nextTurn();renderPalette();
});
undoBtn.addEventListener('click',()=>{undo();});
restartBtn.addEventListener('click',async ()=>{if(await customConfirm('Start new game?', 'Restart Game')) {gameMode = null; init();}});
if(restartBtnWin){
  restartBtnWin.addEventListener('click',()=>{gameMode = null; init();});
}
endGameBtn.addEventListener('click',async ()=>{if(await customConfirm('End game and calculate scores?', 'End Game')) endGame();});
showHintBtn.addEventListener('click',()=>{
  const hint = hasValidMoves(currentPlayer, true);
  showToast(hint);
});
autoMoveBtn.addEventListener('click',()=>{
  makeAutoMove();
});

// Setup resize handler
window.addEventListener('resize', handleResize);
// Also handle orientation changes on mobile devices
window.addEventListener('orientationchange', () => {
  // Delay slightly to allow viewport to update
  setTimeout(() => {
    resizeBoard();
  }, 100);
});

// Initialize game
init();

// Ensure board scaling runs after DOM is fully loaded and laid out
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => {
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      resizeBoard();
    });
  });
} else {
  // DOM already loaded, but ensure layout is complete
  requestAnimationFrame(() => {
    resizeBoard();
    // Also call after a short delay to catch any late layout changes
    setTimeout(resizeBoard, 100);
  });
}
