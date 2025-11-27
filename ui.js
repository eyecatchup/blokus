// UI rendering: DOM rendering, palette, board, scores, ghost preview
const UI = (function() {
  'use strict';
  
  // DOM element references (will be initialized in main.js)
  let boardEl, paletteEl, scoresEl, toastContainer;
  
  // Cached DOM grid for fast ghost rendering
  let cellEls = null;
  let cachedBoardRect = null;
  let cachedCellSize = null;
  let ghostCells = [];
  let cachedPieceElements = [];
  
  // Initialize DOM references
  function init(elements) {
    boardEl = elements.boardEl;
    paletteEl = elements.paletteEl;
    scoresEl = elements.scoresEl;
    toastContainer = elements.toastContainer;
  }
  
  // Toast notifications
  function showToast(message) {
    if(!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
  
  // Dynamic board scaling
  function resizeBoard(size) {
    if(!boardEl) return;
    
    const root = document.documentElement;
    const minCellSize = 13;
    const maxCellSize = 28;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    let availableWidth, availableHeight;
    
    if(isMobile){
      const bodyPadding = window.getComputedStyle(document.body).paddingLeft;
      const padding = parseFloat(bodyPadding) || 12;
      availableWidth = viewportWidth - (padding * 2);
      
      const header = document.querySelector('h1');
      const footer = document.querySelector('.footer.show-mobile');
      const headerHeight = header ? header.offsetHeight + 12 : 30;
      const footerHeight = footer ? footer.offsetHeight + 14 : 0;
      const bodyPaddingTop = parseFloat(window.getComputedStyle(document.body).paddingTop) || 12;
      const bodyPaddingBottom = parseFloat(window.getComputedStyle(document.body).paddingBottom) || 12;
      availableHeight = viewportHeight - headerHeight - footerHeight - bodyPaddingTop - bodyPaddingBottom;
    } else {
      const sidebar = document.querySelector('.sidebar');
      const sidebarWidth = sidebar ? sidebar.offsetWidth : 340;
      const gap = 18;
      const bodyPadding = window.getComputedStyle(document.body).paddingLeft;
      const padding = parseFloat(bodyPadding) || 18;
      
      availableWidth = viewportWidth - sidebarWidth - gap - (padding * 2);
      
      const header = document.querySelector('h1');
      const headerHeight = header ? header.offsetHeight + 12 : 30;
      const bodyPaddingTop = parseFloat(window.getComputedStyle(document.body).paddingTop) || 18;
      const bodyPaddingBottom = parseFloat(window.getComputedStyle(document.body).paddingBottom) || 18;
      availableHeight = viewportHeight - headerHeight - bodyPaddingTop - bodyPaddingBottom;
    }
    
    const boardPadding = 6 * 2;
    const boardBorder = 4 * 2;
    const boardOverhead = boardPadding + boardBorder;
    
    const cellSizeFromWidth = (availableWidth - boardOverhead) / size;
    const cellSizeFromHeight = (availableHeight - boardOverhead) / size;
    const calculatedCellSize = Math.min(cellSizeFromWidth, cellSizeFromHeight);
    const cellSize = Math.max(minCellSize, Math.min(maxCellSize, calculatedCellSize));
    const boardSize = (cellSize * size) + boardOverhead;
    
    root.style.setProperty('--cell', `${cellSize}px`);
    boardEl.style.maxWidth = `${boardSize}px`;
    boardEl.style.maxHeight = `${boardSize}px`;
    
    const instructionsEl = document.getElementById('instructions');
    if(instructionsEl){
      instructionsEl.style.maxWidth = `${boardSize}px`;
    }
  }
  
  // Update board border color to match current player
  function updateBoardBorder(currentPlayer, players) {
    if(!boardEl) return;
    const root = document.documentElement;
    const playerColor = players[currentPlayer].color;
    root.style.setProperty('--board-border-color', playerColor);
  }
  
  // Initialize cell cache for fast ghost rendering
  function initCellCache(size) {
    cellEls = Array.from({length: size}, (_, y) =>
      Array.from({length: size}, (_, x) =>
        document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`)
      )
    );
  }
  
  // Update cached board dimensions
  function updateBoardDimensionsCache() {
    if(!boardEl || !cellEls || !cellEls[0] || !cellEls[0][0]) return;
    cachedBoardRect = boardEl.getBoundingClientRect();
    cachedCellSize = cellEls[0][0].getBoundingClientRect().width;
  }
  
  // Get cell coordinates from client coordinates (O(1) math, no DOM queries)
  function getCellAt(clientX, clientY, size) {
    if(!boardEl || !cellEls || !cellEls[0] || !cellEls[0][0]) return null;
    
    if(!cachedBoardRect || !cachedCellSize){
      updateBoardDimensionsCache();
    }
    
    const gx = Math.floor((clientX - cachedBoardRect.left) / cachedCellSize);
    const gy = Math.floor((clientY - cachedBoardRect.top) / cachedCellSize);
    
    if(gx >= 0 && gy >= 0 && gx < size && gy < size && cellEls[gy] && cellEls[gy][gx]){
      return {
        x: gx,
        y: gy,
        element: cellEls[gy][gx]
      };
    }
    
    return null;
  }
  
  // Clear ghost preview
  function clearGhost() {
    ghostCells.forEach(c => {
      if(c) {
        c.classList.remove('ghost','illegal');
        c.style.removeProperty('--ghost-color');
      }
    });
    ghostCells = [];
  }
  
  // Update ghost preview
  function updateGhostPreview(cellEl, x, y, app) {
    const { interactionState, selectedPiece, players, size } = app;
    const currentPlayer = app.currentPlayer; // Use getter
    const { InteractionState, isDragging, isPreviewing } = app.interaction;
    const { getCurrentOrientation } = app.piece;
    const { orientationToKey, placementCache } = app.piece;
    const { isEmpty, validBlokusContact } = app.board;
    
    if((!isDragging(interactionState) && !isPreviewing(interactionState)) || !selectedPiece) {
      clearGhost();
      return;
    }
    
    // Ensure cellEls is initialized - try to initialize if not set
    if(!cellEls || !cellEls[0] || !cellEls[0][0]) {
      initCellCache(app.size);
      if(!cellEls || !cellEls[0] || !cellEls[0][0]) {
        clearGhost();
        return;
      }
    }
    
    clearGhost();
    
    // Ensure orientationIndex is set (default to 0 if undefined)
    if(selectedPiece.orientationIndex === undefined) {
      selectedPiece.orientationIndex = 0;
    }
    
    const currentCells = getCurrentOrientation(selectedPiece.id, selectedPiece.orientationIndex);
    if(!currentCells || currentCells.length === 0) return;
    const orientationKey = orientationToKey(currentCells);
    
    const placed = placementCache[selectedPiece.id]?.[orientationKey]?.[y]?.[x];
    if(!placed) return;
    
    const board = app.state.getBoard();
    const usedPieces = app.state.getUsedPieces();
    const isLegal = isEmpty(placed, board) && validBlokusContact(placed, currentPlayer, board, size, usedPieces);
    const playerColor = players[currentPlayer].color;
    
    const updates = [];
    for(const [px, py] of placed){
      if(px >= 0 && px < size && py >= 0 && py < size && cellEls[py] && cellEls[py][px]){
        updates.push({ cell: cellEls[py][px], isLegal: isLegal });
      }
    }
    
    updates.forEach(({cell, isLegal}) => {
      cell.classList.add('ghost');
      if(!isLegal) cell.classList.add('illegal');
      cell.style.setProperty('--ghost-color', playerColor);
      ghostCells.push(cell);
    });
  }
  
  // Render board
  function renderBoard(board, size, players, handlers) {
    if(!boardEl) return;
    
    // Remove old event listeners
    boardEl.removeEventListener('click', handlers.handleBoardClick);
    boardEl.removeEventListener('touchstart', handlers.handleBoardTouchStart);
    boardEl.removeEventListener('touchmove', handlers.handleBoardTouchMove);
    boardEl.removeEventListener('touchend', handlers.handleBoardTouchEnd);
    boardEl.removeEventListener('touchcancel', handlers.handleBoardTouchCancel);
    
    boardEl.innerHTML = '';
    cellEls = Array.from({length: size}, () => []);
    
    for(let y = 0; y < size; y++){
      for(let x = 0; x < size; x++){
        const c = document.createElement('div');
        c.className = 'cell';
        c.dataset.x = x;
        c.dataset.y = y;
        const cell = board[y][x];
        if(cell != null){
          const dot = document.createElement('div');
          dot.className = 'dot';
          dot.style.background = players[cell.player].color;
          c.appendChild(dot);
        }
        c.addEventListener('dragover', handlers.onDragOver);
        c.addEventListener('drop', handlers.onDrop);
        c.addEventListener('dragleave', (e) => {
          if(!e.relatedTarget || !boardEl.contains(e.relatedTarget)){
            clearGhost();
          }
        });
        boardEl.appendChild(c);
        cellEls[y][x] = c;
      }
    }
    
    boardEl.addEventListener('click', handlers.handleBoardClick);
    boardEl.addEventListener('touchstart', handlers.handleBoardTouchStart, {passive: true});
    boardEl.addEventListener('touchmove', handlers.handleBoardTouchMove, {passive: false});
    boardEl.addEventListener('touchend', handlers.handleBoardTouchEnd, {passive: false});
    boardEl.addEventListener('touchcancel', handlers.handleBoardTouchCancel);
    
    // Update cell cache after rendering (redundant but ensures it's set)
    initCellCache(size);
    updateBoardDimensionsCache();
  }
  
  // Render palette
  function renderPalette(pieces, currentPlayer, players, usedPieces, handlers, app) {
    if(!paletteEl) return;
    
    paletteEl.innerHTML = '';
    cachedPieceElements = [];
    
    const { pieceToGrid } = app.piece;
    const { getCurrentOrientation } = app.piece;
    const { rotatePiece } = app.piece;
    const { updateSelectedPieceVisual } = app.ui;
    const { updateGhostPreview } = app.ui;
    const { clearGhost } = app.ui;
    const { setPreviewMode } = app.interaction;
    
    pieces.forEach(piece => {
      const wrapper = document.createElement('div');
      wrapper.className = 'piece';
      wrapper.dataset.pid = piece.id;
      const isUsed = usedPieces[currentPlayer].has(piece.id);
      if(isUsed){
        wrapper.style.opacity = '0.4';
        wrapper.style.cursor = 'not-allowed';
      }
      wrapper.title = piece.name + (isUsed ? " (used)" : " — click to select, then drag to board");
      
      const gridCells = pieceToGrid(piece);
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(5,1fr)';
      grid.style.gridTemplateRows = 'repeat(5,1fr)';
      grid.style.width = '100%';
      grid.style.height = '100%';
      const cells = Array.from({length: 25}, () => document.createElement('div'));
      cells.forEach(c => c.className = 'px');
      
      gridCells.forEach(([x, y]) => {
        const idx = y * 5 + x;
        if(cells[idx] && idx >= 0 && idx < 25){
          cells[idx].style.background = players[currentPlayer].color;
          cells[idx].style.borderRadius = '4px';
        }
      });
      
      cells.forEach(c => grid.appendChild(c));
      wrapper.appendChild(grid);
      
      const selectPiece = (e) => {
        if(isUsed) return;
        
        if(app.selectedPieceElement === wrapper && app.selectedPiece && 
           getCurrentOrientation(app.selectedPiece.id, app.selectedPiece.orientationIndex).length > 0){
          const newIndex = rotatePiece(app.selectedPiece.id, app.selectedPiece.orientationIndex);
          app.selectedPiece.orientationIndex = newIndex;
          
          if(app.interaction.isPreviewing(app.interactionState) && app.previewCell){
            const x = parseInt(app.previewCell.dataset.x, 10);
            const y = parseInt(app.previewCell.dataset.y, 10);
            updateGhostPreview(app.previewCell, x, y, app);
          } else if(app.lastHoveredCell){
            const x = parseInt(app.lastHoveredCell.dataset.x, 10);
            const y = parseInt(app.lastHoveredCell.dataset.y, 10);
            updateGhostPreview(app.lastHoveredCell, x, y, app);
          }
          updateSelectedPieceVisual(app);
          if(e) e.stopPropagation();
          return;
        }
        
        if(cachedPieceElements){
          cachedPieceElements.forEach(p => p.classList.remove('selected'));
        } else {
          document.querySelectorAll('.piece').forEach(p => p.classList.remove('selected'));
        }
        setPreviewMode(false, app);
        app.previewCell = null;
        clearGhost();
        wrapper.classList.add('selected');
        app.selectedPiece = JSON.parse(JSON.stringify(piece));
        app.selectedPiece.orientationIndex = 0;
        app.selectedPieceElement = wrapper;
        wrapper.draggable = true;
        updateSelectedPieceVisual(app);
      };
      
      let mouseDownPos = null;
      let clickHandled = false;
      wrapper.addEventListener('mousedown', (e) => {
        mouseDownPos = {x: e.clientX, y: e.clientY};
        clickHandled = false;
      });
      wrapper.addEventListener('mouseup', (e) => {
        if(mouseDownPos){
          const moved = Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5;
          if(!moved){
            selectPiece(e);
            clickHandled = true;
          }
          mouseDownPos = null;
        }
      });
      wrapper.addEventListener('click', (e) => {
        if(!clickHandled){
          selectPiece(e);
        }
        clickHandled = false;
      });
      
      let touchStartPos = null;
      let touchStartedOnThisPiece = false;
      
      wrapper.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if(touch){
          touchStartPos = {x: touch.clientX, y: touch.clientY};
          touchStartedOnThisPiece = wrapper.classList.contains('selected') && !isUsed && app.selectedPiece;
          if(touchStartedOnThisPiece){
            handlers.handleDragStart(touch.clientX, touch.clientY, app);
          }
          e.preventDefault();
        }
      }, {passive: false});
      
      wrapper.addEventListener('touchmove', (e) => {
        if(touchStartedOnThisPiece && app.selectedPiece && touchStartPos && e.touches[0]){
          const touch = e.touches[0];
          handlers.handleDragMove(touch.clientX, touch.clientY, app);
        }
      }, {passive: false});
      
      wrapper.addEventListener('touchend', (e) => {
        e.preventDefault();
        if(touchStartPos && e.changedTouches && e.changedTouches[0]){
          const touch = e.changedTouches[0];
          const wasTap = handlers.isTapMovement(touchStartPos.x, touchStartPos.y, touch.clientX, touch.clientY, 10);
          
          if(wasTap && !touchStartedOnThisPiece){
            selectPiece();
          } else if(touchStartedOnThisPiece){
            const result = handlers.handleDragEnd(touch.clientX, touch.clientY, app);
            if(result){
              if(result.type === 'tap'){
                if(app.selectedPieceElement === wrapper){
                  const newIndex = rotatePiece(app.selectedPiece.id, app.selectedPiece.orientationIndex);
                  app.selectedPiece.orientationIndex = newIndex;
                  updateSelectedPieceVisual(app);
                  if(app.interaction.isPreviewing(app.interactionState) && app.previewCell){
                    const x = parseInt(app.previewCell.dataset.x, 10);
                    const y = parseInt(app.previewCell.dataset.y, 10);
                    updateGhostPreview(app.previewCell, x, y, app);
                  }
                }
              } else if(result.type === 'drag' && result.cell){
                handlers.handlePlacement(result.cell, result.x, result.y, app);
              }
            }
          }
          touchStartPos = null;
          touchStartedOnThisPiece = false;
        } else {
          if(!app.interaction.isDragging(app.interactionState)){
            selectPiece();
          }
        }
      });
      
      wrapper.addEventListener('touchcancel', () => {
        if(touchStartedOnThisPiece){
          app.interactionState = app.interaction.InteractionState.NONE;
          app.hoveringCell = null;
        }
        touchStartPos = null;
        touchStartedOnThisPiece = false;
        setPreviewMode(false, app);
        app.previewCell = null;
        clearGhost();
      });
      
      wrapper.addEventListener('dragstart', e => {
        if(!wrapper.classList.contains('selected') || isUsed){
          e.preventDefault();
          return;
        }
        app.interactionState = app.interaction.InteractionState.DRAGGING;
        e.dataTransfer.setDragImage(app.emptyDragImage, 0, 0);
      });
      
      wrapper.addEventListener('dragend', e => {
        app.interactionState = app.interaction.InteractionState.NONE;
        app.hoveringCell = null;
        setPreviewMode(false, app);
        app.previewCell = null;
        clearGhost();
      });
      
      paletteEl.appendChild(wrapper);
      cachedPieceElements.push(wrapper);
    });
  }
  
  // Render scores
  function renderScores(currentPlayer, players, calculatePlayerScore) {
    if(!scoresEl) return;
    
    const playerScores = players.map(player => ({
      player: player,
      score: calculatePlayerScore(player.id)
    }));
    
    playerScores.sort((a, b) => b.score - a.score);
    
    scoresEl.innerHTML = '';
    playerScores.forEach((ps) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.marginBottom = '4px';
      row.style.padding = '4px';
      
      if(ps.player.id === currentPlayer){
        row.style.backgroundColor = 'rgba(43, 138, 239, 0.1)';
        row.style.borderRadius = '4px';
      }
      
      const swatch = document.createElement('div');
      swatch.style.width = '12px';
      swatch.style.height = '12px';
      swatch.style.borderRadius = '2px';
      swatch.style.background = ps.player.color;
      row.appendChild(swatch);
      
      const text = document.createElement('span');
      text.textContent = `${ps.player.name}: ${ps.score}`;
      text.style.fontSize = '13px';
      row.appendChild(text);
      
      scoresEl.appendChild(row);
    });
  }
  
  // Update selected piece visual
  function updateSelectedPieceVisual(app) {
    const { selectedPiece, selectedPieceElement, currentPlayer, players } = app;
    const { getCurrentOrientation } = app.piece;
    const { pieceToGrid } = app.piece;
    
    const currentCells = getCurrentOrientation(selectedPiece.id, selectedPiece.orientationIndex);
    if(!selectedPieceElement || !currentCells || currentCells.length === 0) return;
    const grid = selectedPieceElement.querySelector('div[style*="grid"]');
    if(!grid) return;
    
    grid.querySelectorAll('.px').forEach(c => {
      c.style.background = '';
      c.style.borderRadius = '';
    });
    
    const gridCells = pieceToGrid({cells: currentCells});
    gridCells.forEach(([x, y]) => {
      const idx = y * 5 + x;
      const cell = grid.querySelectorAll('.px')[idx];
      if(cell && idx >= 0 && idx < 25){
        cell.style.background = players[currentPlayer].color;
        cell.style.borderRadius = '4px';
      }
    });
  }
  
  // Public API
  return {
    init,
    showToast,
    resizeBoard,
    updateBoardBorder,
    initCellCache,
    updateBoardDimensionsCache,
    getCellAt,
    clearGhost,
    updateGhostPreview,
    renderBoard,
    renderPalette,
    renderScores,
    updateSelectedPieceVisual,
    get cachedPieceElements() { return cachedPieceElements; }
  };
})();

