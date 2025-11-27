// Drag-and-drop enabled version
// --- CONFIG ---
const SIZE = 20;
const PLAYERS = [
  {id:0,name:'Blue',color:'#3b82f6'},
  {id:1,name:'Yellow',color:'#f59e0b'},
  {id:2,name:'Red',color:'#ef4444'},
  {id:3,name:'Green',color:'#10b981'}
];
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

// Precompute orientations for all pieces at startup
PIECES.forEach(piece => {
  const orientations = [];
  const seen = new Set(); // Use Set for O(1) lookup instead of O(n) array search
  let cells = piece.cells.map(c => [c[0], c[1]]); // Start with fresh copy
  
  // Generate all 4 rotations (0°, 90°, 180°, 270°)
  for(let rot = 0; rot < 4; rot++){
    const normalized = normalizeOrientation(cells);
    const key = orientationToKey(normalized);
    
    // Check if we've seen this orientation before (deduplicate symmetric pieces)
    if(!seen.has(key)){
      orientations.push(normalized);
      seen.add(key);
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
let selectedOrientation = {cells:[]};
let selectedPieceElement = null; // Reference to the selected piece's DOM element
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
const endGameBtn = document.getElementById('endGameBtn');

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
    const gap = 18; // gap between board and sidebar
    const bodyPadding = window.getComputedStyle(document.body).paddingLeft;
    const padding = parseFloat(bodyPadding) || 18;
    
    availableWidth = viewportWidth - sidebarWidth - gap - (padding * 2);
    
    // Account for header and padding
    const header = document.querySelector('h1');
    const headerHeight = header ? header.offsetHeight + 12 : 30; // h1 + margin
    const bodyPaddingTop = parseFloat(window.getComputedStyle(document.body).paddingTop) || 18;
    const bodyPaddingBottom = parseFloat(window.getComputedStyle(document.body).paddingBottom) || 18;
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
  }, 100);
}

// Update board border color to match current player
function updateBoardBorder(){
  if(!boardEl) return;
  const root = document.documentElement;
  const playerColor = PLAYERS[currentPlayer].color;
  root.style.setProperty('--board-border-color', playerColor);
}

// --- INIT ---
function init(){
  board = Array.from({length:SIZE},()=>Array.from({length:SIZE},()=>null));
  usedPieces = {}; PLAYERS.forEach(p=>usedPieces[p.id]=new Set());
  currentPlayer = 0;
  selectedPiece = null;
  selectedOrientation.cells = [];
  selectedPieceElement = null;
  history = [];
  interactionState = InteractionState.NONE;
  dragStart = {x: 0, y: 0};
  hoveringCell = null;
  previewCell = null;
  cachedBoundingBox = null;
  isPlacing = false;
  updateBoardBorder();
  renderBoard();
  renderPalette();
  renderScores();
  resizeBoard();
  // Board-level touchmove handler to track touches across cells (only add once)
  boardEl.removeEventListener('touchmove', handleBoardTouchMove);
  boardEl.addEventListener('touchmove', handleBoardTouchMove, {passive: false});
  // Board-level touchend handler to place piece when touch ends while dragging
  boardEl.removeEventListener('touchend', handleBoardTouchEnd);
  boardEl.addEventListener('touchend', handleBoardTouchEnd, {passive: false});
  // Document-level touchmove handler to catch all touch moves for ghost preview
  document.removeEventListener('touchmove', handleDocumentTouchMove);
  document.addEventListener('touchmove', handleDocumentTouchMove, {passive: false});
}

function handleBoardTouchMove(e){
  if(selectedPiece && e.touches && e.touches[0]){
    const touch = e.touches[0];
    // If not yet dragging, try to start
    if(interactionState === InteractionState.NONE){
      handleDragStart(touch.clientX, touch.clientY);
    }
    // Update drag movement
    if(interactionState !== InteractionState.NONE){
      e.preventDefault();
      handleDragMove(touch.clientX, touch.clientY);
    }
  }
}

function handleBoardTouchEnd(e){
  // Only handle if we're still in a dragging state (not already handled by cell)
  // handleDragEnd resets state to NONE, so if state is already NONE, it was already called
  if(!selectedPiece || interactionState === InteractionState.NONE || isPlacing) return;
  
  if(e.changedTouches && e.changedTouches[0]){
    e.preventDefault();
    const touch = e.changedTouches[0];
    // handleDragEnd will return null if already called, preventing duplicate placement
    const result = handleDragEnd(touch.clientX, touch.clientY);
    if(result && result.type === 'drag' && result.cell){
      handlePlacement(result.cell, result.x, result.y);
    }
  }
}

function handleDocumentTouchMove(e){
  // Update ghost preview during touch dragging, regardless of where touch started
  if(selectedPiece && e.touches && e.touches[0]){
    const touch = e.touches[0];
    if(interactionState !== InteractionState.NONE){
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
    // Find which cell is under the pointer
    const cell = document.elementFromPoint(clientX, clientY)?.closest('.cell');
    if(cell && cell.classList.contains('cell')){
      const x = parseInt(cell.dataset.x, 10);
      const y = parseInt(cell.dataset.y, 10);
      hoveringCell = {x, y};
      lastHoveredCell = cell;
      updateGhostPreview(cell, x, y);
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
    // Was a drag - try to place if we have a cell
    const cell = document.elementFromPoint(clientX, clientY)?.closest('.cell');
    if(cell && cell.classList.contains('cell')){
      const x = parseInt(cell.dataset.x, 10);
      const y = parseInt(cell.dataset.y, 10);
      return {type: 'drag', cell: cell, x: x, y: y};
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

// --- RENDER BOARD ---
function renderBoard(){
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
      c.addEventListener('dragover',onDragOver);
      c.addEventListener('drop',onDrop);
      c.addEventListener('dragleave',(e)=>{
        if(!e.relatedTarget || !boardEl.contains(e.relatedTarget)){
          clearGhost();
        }
      });
      // Click handler for placing selected piece (with preview mode)
      c.addEventListener('click',(e)=>{
        // Only handle if piece is selected and we're not in a drag operation
        if(selectedPiece && !isDragging()){
          const x=parseInt(c.dataset.x,10);
          const y=parseInt(c.dataset.y,10);
          handleCellInteraction(c, x, y);
        }
      });
      // Touch support - use shared drag handlers
      let boardCellTouchStart = null;
      c.addEventListener('touchstart',(e)=>{
        if(selectedPiece && e.touches[0] && interactionState === InteractionState.NONE){
          const touch = e.touches[0];
          boardCellTouchStart = {x: touch.clientX, y: touch.clientY};
          handleDragStart(touch.clientX, touch.clientY);
        }
      }, {passive: true});
      c.addEventListener('touchmove',(e)=>{
        if(selectedPiece && e.touches[0]){
          e.preventDefault();
          const touch = e.touches[0];
          handleDragMove(touch.clientX, touch.clientY);
        }
      }, {passive: false});
      c.addEventListener('touchend',(e)=>{
        if(selectedPiece && e.changedTouches && e.changedTouches[0]){
          e.preventDefault();
          e.stopPropagation(); // Stop propagation immediately to prevent board handler
          const touch = e.changedTouches[0];
          const wasTap = boardCellTouchStart && 
                        isTapMovement(boardCellTouchStart.x, boardCellTouchStart.y, touch.clientX, touch.clientY, 10);
          
          const result = handleDragEnd(touch.clientX, touch.clientY);
          if(result){
            if(result.type === 'drag' && result.cell){
              // Was a drag - place at this cell immediately
              handlePlacement(result.cell, result.x, result.y);
            } else if(wasTap && result.type === 'tap'){
              // Was a tap - handle with preview mode
              const x=parseInt(c.dataset.x,10);
              const y=parseInt(c.dataset.y,10);
              handleCellInteraction(c, x, y);
            }
          }
          boardCellTouchStart = null;
        }
      });
      c.addEventListener('touchcancel',()=>{
        interactionState = InteractionState.NONE;
        hoveringCell = null;
        boardCellTouchStart = null;
        setPreviewMode(false);
        previewCell = null;
        clearGhost();
      });
      boardEl.appendChild(c);
      if(cellEls[y]) cellEls[y][x] = c;
    }
  }
  // Update cell cache after rendering
  initCellCache();
}

// --- RENDER PALETTE (click to select, then drag) ---
function renderPalette(){
  paletteEl.innerHTML='';
  PIECES.forEach(piece=>{
    const wrapper=document.createElement('div');
    wrapper.className='piece';
    wrapper.dataset.pid=piece.id;
    const isUsed = usedPieces[currentPlayer].has(piece.id);
    if(isUsed){
      wrapper.style.opacity='0.4';
      wrapper.style.cursor='not-allowed';
    }
    wrapper.title=piece.name+(isUsed?" (used)":" — click to select, then drag to board");

    // Calculate piece dimensions and scale to fill more space
    const minX = Math.min(...piece.cells.map(c=>c[0]));
    const maxX = Math.max(...piece.cells.map(c=>c[0]));
    const minY = Math.min(...piece.cells.map(c=>c[1]));
    const maxY = Math.max(...piece.cells.map(c=>c[1]));
    const pieceWidth = maxX - minX + 1;
    const pieceHeight = maxY - minY + 1;
    const maxDim = Math.max(pieceWidth, pieceHeight);
    
    // Scale to use most of the 5x5 grid
    // Allow pieces up to 5 cells to use full grid, scale larger pieces
    const scale = maxDim <= 5 ? 1 : Math.min(4 / maxDim, 1);
    const scaledWidth = maxDim <= 5 ? pieceWidth : Math.ceil(pieceWidth * scale);
    const scaledHeight = maxDim <= 5 ? pieceHeight : Math.ceil(pieceHeight * scale);
    
    // Center the scaled piece in the 5x5 grid
    const offsetX = Math.floor((5 - scaledWidth) / 2);
    const offsetY = Math.floor((5 - scaledHeight) / 2);
    
    const grid=document.createElement('div');grid.style.display='grid';grid.style.gridTemplateColumns='repeat(5,1fr)';grid.style.gridTemplateRows='repeat(5,1fr)';grid.style.width='100%';grid.style.height='100%';
    const cells=Array.from({length:25},()=>document.createElement('div'));
    cells.forEach(c=>c.className='px');
    piece.cells.forEach(([cx,cy])=>{
      // Scale and center the cell position
      // For pieces <= 5 cells, use direct mapping; for larger pieces, scale
      const scaledX = maxDim <= 5 ? (cx - minX) + offsetX : Math.round((cx - minX) * scale) + offsetX;
      const scaledY = maxDim <= 5 ? (cy - minY) + offsetY : Math.round((cy - minY) * scale) + offsetY;
      const idx = scaledY * 5 + scaledX;
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
      if(selectedPieceElement === wrapper && selectedPiece && selectedOrientation.cells.length > 0){
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
      // Deselect other pieces
      document.querySelectorAll('.piece').forEach(p=>p.classList.remove('selected'));
      // Clear preview mode when selecting new piece
      setPreviewMode(false);
      previewCell = null;
      clearGhost();
      // Select this piece
      wrapper.classList.add('selected');
      selectedPiece = JSON.parse(JSON.stringify(piece));
      selectedOrientation.cells = selectedPiece.cells.map(c=>[c[0],c[1]]);
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
      if(touchStartedOnThisPiece && selectedPiece && touchStartPos && e.touches[0]){
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
      }
      e.preventDefault();
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
  });
}

// --- RENDER SCORES ---
function renderScores(){
  if(!scoresEl) return;
  
  // Calculate scores for all players
  const playerScores = PLAYERS.map(player => ({
    player: player,
    score: calculatePlayerScore(player.id)
  }));
  
  // Sort by score (highest first - leader)
  playerScores.sort((a, b) => b.score - a.score);
  
  // Clear and render
  scoresEl.innerHTML = '';
  playerScores.forEach((ps, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginBottom = '4px';
    row.style.padding = '4px';
    
    // Add highlight for current player
    if(ps.player.id === currentPlayer){
      row.style.backgroundColor = 'rgba(43, 138, 239, 0.1)';
      row.style.borderRadius = '4px';
    }
    
    // Player color swatch
    const swatch = document.createElement('div');
    swatch.style.width = '12px';
    swatch.style.height = '12px';
    swatch.style.borderRadius = '2px';
    swatch.style.background = ps.player.color;
    row.appendChild(swatch);
    
    // Player name and score
    const text = document.createElement('span');
    text.textContent = `${ps.player.name}: ${ps.score}`;
    text.style.fontSize = '13px';
    row.appendChild(text);
    
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

// Cache bounding box when orientation changes
function updateBoundingBoxCache(){
  if(!selectedOrientation || !selectedOrientation.cells.length){
    cachedBoundingBox = null;
    return;
  }
  cachedBoundingBox = {
    minX: Math.min(...selectedOrientation.cells.map(c=>c[0])),
    minY: Math.min(...selectedOrientation.cells.map(c=>c[1])),
    maxX: Math.max(...selectedOrientation.cells.map(c=>c[0])),
    maxY: Math.max(...selectedOrientation.cells.map(c=>c[1]))
  };
}

function updateGhostPreview(cellEl, x, y){
  if((!isDragging() && !isPreviewing()) || !selectedPiece || !cellEls) {
    clearGhost();
    return;
  }
  
  // Clear previous ghost
  clearGhost();
  
  // Use cached bounding box or calculate if not cached
  if(!cachedBoundingBox){
    updateBoundingBoxCache();
  }
  if(!cachedBoundingBox) return;
  
  const {minX, minY, maxX, maxY} = cachedBoundingBox;
  
  // Calculate initial placement
  let placed = selectedOrientation.cells.map(([cx,cy])=>[x+(cx-minX), y+(cy-minY)]);
  
  // Adjust placement if it would go out of bounds (same logic as onDrop)
  let adjustedX = x, adjustedY = y;
  if(!isInsideBoard(placed)){
    if(x + maxX >= SIZE) adjustedX = SIZE - 1 - maxX;
    if(y + maxY >= SIZE) adjustedY = SIZE - 1 - maxY;
    if(adjustedX < 0) adjustedX = 0;
    if(adjustedY < 0) adjustedY = 0;
    placed = selectedOrientation.cells.map(([cx,cy])=>[adjustedX+(cx-minX), adjustedY+(cy-minY)]);
  }
  
  // Validate placement
  const isLegal = isInsideBoard(placed) && 
                  isEmpty(placed) && 
                  validBlokusContact(placed, currentPlayer);
  
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
  isPlacing = true; // Prevent duplicate calls
  
  const minX=Math.min(...selectedOrientation.cells.map(c=>c[0]));
  const minY=Math.min(...selectedOrientation.cells.map(c=>c[1]));
  const maxX=Math.max(...selectedOrientation.cells.map(c=>c[0]));
  const maxY=Math.max(...selectedOrientation.cells.map(c=>c[1]));
  
  // Calculate initial placement
  let placed = selectedOrientation.cells.map(([cx,cy])=>[x+(cx-minX), y+(cy-minY)]);
  
  // Adjust placement if it would go out of bounds
  if(!isInsideBoard(placed)){
    // Try to adjust
    if(x + maxX >= SIZE) x = SIZE - 1 - maxX;
    if(y + maxY >= SIZE) y = SIZE - 1 - maxY;
    if(x < 0) x = 0;
    if(y < 0) y = 0;
    placed = selectedOrientation.cells.map(([cx,cy])=>[x+(cx-minX), y+(cy-minY)]);
  }

  if(!isInsideBoard(placed)){ 
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

  selectedPiece=null;selectedOrientation.cells=[];selectedPieceElement=null;
  setDragging(false);
  setPreviewMode(false);
  previewCell = null;
  clearGhost();
  // Deselect piece
  document.querySelectorAll('.piece').forEach(p=>p.classList.remove('selected'));
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

// Check if a player has any valid moves
function hasValidMoves(player){
  // Get all unused pieces for this player
  const unusedPieces = PIECES.filter(p => !usedPieces[player].has(p.id));
  if(unusedPieces.length === 0) return false;
  
  // For each unused piece, try all precomputed orientations at all positions
  for(const piece of unusedPieces){
    const orientations = PIECE_ORIENTATIONS.get(piece.id);
    if(!orientations) continue;
    
    // Try each orientation at every position on the board
    for(const orientation of orientations){
      const minX = Math.min(...orientation.map(c => c[0]));
      const minY = Math.min(...orientation.map(c => c[1]));
      const maxX = Math.max(...orientation.map(c => c[0]));
      const maxY = Math.max(...orientation.map(c => c[1]));
      
      // Try placing at every position
      for(let y = 0; y < SIZE; y++){
        for(let x = 0; x < SIZE; x++){
          // Calculate placement
          const placed = orientation.map(([cx, cy]) => [x + (cx - minX), y + (cy - minY)]);
          
          // Check if valid
          if(isInsideBoard(placed) && isEmpty(placed) && validBlokusContact(placed, player)){
            return true; // Found at least one valid move
          }
        }
      }
    }
  }
  
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

// Calculate a player's score according to official Blokus rules
function calculatePlayerScore(playerId){
  const unplayedSquares = getUnplayedSquares(playerId);
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

// End game and show results
function endGame(){
  // Calculate scores for all players
  const playerScores = PLAYERS.map(player => ({
    player: player,
    score: calculatePlayerScore(player.id)
  }));
  
  // Sort by score (highest first)
  playerScores.sort((a, b) => b.score - a.score);
  
  // Build result message
  let message = 'Game Over\n\n';
  playerScores.forEach((ps, index) => {
    const place = index + 1;
    message += `${place}. Player ${ps.player.name}: ${ps.score} points\n`;
  });
  
  alert(message);
}

// Log all player scores to console
function logPlayerScores(){
  const scores = PLAYERS.map(player => ({
    name: player.name,
    score: calculatePlayerScore(player.id)
  }));
  console.log('Player scores:', scores);
}

function nextTurn(){ 
  const startPlayer = currentPlayer;
  let attempts = 0;
  
  // Advance to next player
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
  
  // Update scores display
  renderScores();
  
  // Check for game end: no players have valid moves
  const playersWithValidMoves = PLAYERS.filter(p => hasValidMoves(p.id));
  const validMoveCount = playersWithValidMoves.length;
  
  if(validMoveCount === 0){
    // No players have valid moves - game over, calculate scores
    endGame();
  }
}

// --- ROTATION / FLIP ---
function rotatePiece(orientation){
  // Rotate 90 degrees clockwise: (x, y) -> (y, -x)
  const rotated = orientation.cells.map(([x,y])=>[y, -x]);
  // Normalize: shift so minX=0, minY=0
  const minX = Math.min(...rotated.map(c=>c[0]));
  const minY = Math.min(...rotated.map(c=>c[1]));
  orientation.cells = rotated.map(([x,y])=>[x-minX, y-minY]);
  // Invalidate bounding box cache
  cachedBoundingBox = null;
}

function flipPiece(orientation){
  // Flip horizontally: (x, y) -> (-x, y)
  const flipped = orientation.cells.map(([x,y])=>[-x, y]);
  // Normalize: shift so minX=0, minY=0
  const minX = Math.min(...flipped.map(c=>c[0]));
  const minY = Math.min(...flipped.map(c=>c[1]));
  orientation.cells = flipped.map(([x,y])=>[x-minX, y-minY]);
  // Invalidate bounding box cache
  cachedBoundingBox = null;
}

function updateSelectedPieceVisual(){
  if(!selectedPieceElement || !selectedOrientation.cells.length) return;
  const grid = selectedPieceElement.querySelector('div[style*="grid"]');
  if(!grid) return;
  // Clear all cells
  grid.querySelectorAll('.px').forEach(c=>{
    c.style.background='';
    c.style.borderRadius='';
  });
  // Calculate dimensions and scale (same logic as renderPalette)
  const minX = Math.min(...selectedOrientation.cells.map(c=>c[0]));
  const maxX = Math.max(...selectedOrientation.cells.map(c=>c[0]));
  const minY = Math.min(...selectedOrientation.cells.map(c=>c[1]));
  const maxY = Math.max(...selectedOrientation.cells.map(c=>c[1]));
  const pieceWidth = maxX - minX + 1;
  const pieceHeight = maxY - minY + 1;
  const maxDim = Math.max(pieceWidth, pieceHeight);
  
  // Allow pieces up to 5 cells to use full grid, scale larger pieces
  const scale = maxDim <= 5 ? 1 : Math.min(4 / maxDim, 1);
  const scaledWidth = maxDim <= 5 ? pieceWidth : Math.ceil(pieceWidth * scale);
  const scaledHeight = maxDim <= 5 ? pieceHeight : Math.ceil(pieceHeight * scale);
  
  const offsetX = Math.floor((5 - scaledWidth) / 2);
  const offsetY = Math.floor((5 - scaledHeight) / 2);
  
  // Draw current orientation with scaling
  selectedOrientation.cells.forEach(([cx,cy])=>{
    // For pieces <= 5 cells, use direct mapping; for larger pieces, scale
    const scaledX = maxDim <= 5 ? (cx - minX) + offsetX : Math.round((cx - minX) * scale) + offsetX;
    const scaledY = maxDim <= 5 ? (cy - minY) + offsetY : Math.round((cy - minY) * scale) + offsetY;
    const idx = scaledY * 5 + scaledX;
    const cell = grid.querySelectorAll('.px')[idx];
    if(cell && idx >= 0 && idx < 25){
      cell.style.background=PLAYERS[currentPlayer].color;
      cell.style.borderRadius='4px';
    }
  });
}

// --- UNDO, PASS, RESTART ---
let lastHoveredCell = null;
window.addEventListener('keydown',e=>{
  if(e.key==='u'||e.key==='U') undo();
});
function undo(){
  const last=history.pop();if(!last){alert('No moves');return;}
  if(last.pass){currentPlayer=last.player;updateBoardBorder();renderPalette();renderScores();return;}
  last.placed.forEach(([x,y])=>board[y][x]=null);
  usedPieces[last.player].delete(last.pid);
  currentPlayer=last.player;updateBoardBorder();renderBoard();renderPalette();renderScores();
}
flipBtn.addEventListener('click',()=>{
  if(selectedPiece && selectedOrientation.cells.length > 0){
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
  if(selectedPiece && selectedOrientation.cells.length > 0){
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
passBtn.addEventListener('click',()=>{history.push({player:currentPlayer,pass:true});nextTurn();renderPalette();});
undoBtn.addEventListener('click',()=>{undo();});
restartBtn.addEventListener('click',()=>{if(confirm('Restart?')) init();});
endGameBtn.addEventListener('click',()=>{if(confirm('End game and calculate scores?')) endGame();});

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
