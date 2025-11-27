// Interaction: drag/drop/touch handling, state machine
const Interaction = (function() {
  'use strict';
  
  // Interaction state machine
  const InteractionState = {
    NONE: 0,
    SELECTING: 1,
    DRAGGING: 2,
    PREVIEWING: 3
  };
  
  // Touch start tracking for board cells
  const boardCellTouchStarts = new WeakMap();
  
  // Check if movement exceeds tap threshold
  function isTapMovement(startX, startY, currentX, currentY, threshold = 10) {
    return Math.abs(currentX - startX) <= threshold && 
           Math.abs(currentY - startY) <= threshold;
  }
  
  // State check helpers
  function isDragging(interactionState) {
    return interactionState === InteractionState.DRAGGING;
  }
  
  function isPreviewing(interactionState) {
    return interactionState === InteractionState.PREVIEWING;
  }
  
  function setDragging(value, app) {
    if(value){
      if(app.interactionState === InteractionState.SELECTING){
        app.interactionState = InteractionState.DRAGGING;
      }
    } else {
      if(app.interactionState === InteractionState.DRAGGING || app.interactionState === InteractionState.SELECTING){
        app.interactionState = InteractionState.NONE;
      }
    }
  }
  
  function setPreviewMode(value, app) {
    if(value){
      app.interactionState = InteractionState.PREVIEWING;
    } else {
      if(app.interactionState === InteractionState.PREVIEWING){
        app.interactionState = InteractionState.NONE;
        app._previewEnterTime = null;
      }
    }
  }
  
  // Shared drag handlers (used by both mouse and touch)
  function handleDragStart(clientX, clientY, app) {
    if(!app.selectedPiece || app.interactionState !== InteractionState.NONE) return false;
    
    app.dragStart = {x: clientX, y: clientY};
    app.interactionState = InteractionState.SELECTING;
    return true;
  }
  
  function handleDragMove(clientX, clientY, app) {
    if(app.interactionState === InteractionState.NONE || !app.selectedPiece) return;
    
    const dx = clientX - app.dragStart.x;
    const dy = clientY - app.dragStart.y;
    
    // Transition to DRAGGING if movement threshold exceeded
    if(app.interactionState === InteractionState.SELECTING){
      const threshold = 5;
      if(Math.abs(dx) > threshold || Math.abs(dy) > threshold){
        app.interactionState = InteractionState.DRAGGING;
      } else {
        return;
      }
    }
    
    if(app.interactionState === InteractionState.DRAGGING){
      const cellInfo = app.ui.getCellAt(clientX, clientY, app.size);
      if(cellInfo){
        app.hoveringCell = {x: cellInfo.x, y: cellInfo.y};
        app.lastHoveredCell = cellInfo.element;
        app.ui.updateGhostPreview(cellInfo.element, cellInfo.x, cellInfo.y, app);
      } else {
        app.hoveringCell = null;
        app.ui.clearGhost();
      }
    }
  }
  
  function handleDragEnd(clientX, clientY, app) {
    if(app.interactionState === InteractionState.NONE || !app.selectedPiece) return null;
    
    const prevState = app.interactionState;
    const wasDragging = (prevState === InteractionState.DRAGGING);
    const wasSelecting = (prevState === InteractionState.SELECTING);
    
    app.interactionState = InteractionState.NONE;
    app.hoveringCell = null;
    
    if(wasSelecting){
      return {type: 'tap', x: clientX, y: clientY};
    }
    
    if(wasDragging){
      const cellInfo = app.ui.getCellAt(clientX, clientY, app.size);
      if(cellInfo){
        return {type: 'drag', cell: cellInfo.element, x: cellInfo.x, y: cellInfo.y};
      }
      if(app.lastHoveredCell){
        const x = parseInt(app.lastHoveredCell.dataset.x, 10);
        const y = parseInt(app.lastHoveredCell.dataset.y, 10);
        return {type: 'drag', cell: app.lastHoveredCell, x: x, y: y};
      }
      return {type: 'cancel'};
    }
    
    return {type: 'cancel'};
  }
  
  // Document-level touchmove handler
  function handleDocumentTouchMove(e, app) {
    if(app.selectedPiece && e.touches && e.touches[0]){
      const touch = e.touches[0];
      if(app.interactionState === InteractionState.DRAGGING || app.interactionState === InteractionState.SELECTING){
        e.preventDefault();
        handleDragMove(touch.clientX, touch.clientY, app);
      }
    }
  }
  
  // Handle cell click/tap with preview mode
  function handleCellInteraction(cellEl, x, y, app) {
    if(!app.selectedPiece || isDragging(app.interactionState)) return;
    
    // Check if previewCell is still in the document (it might have been removed during board re-render)
    if(app.previewCell && !document.body.contains(app.previewCell)){
      app.previewCell = null;
      setPreviewMode(false, app);
    }
    
    // Check if we're in preview mode and clicking the same cell (by coordinates)
    // Only allow placement if we've been in preview mode for at least a short time
    // This prevents immediate placement when both touch and click events fire
    if(isPreviewing(app.interactionState) && app.previewCell){
      const previewX = parseInt(app.previewCell.dataset.x, 10);
      const previewY = parseInt(app.previewCell.dataset.y, 10);
      
      // Check if enough time has passed since entering preview mode
      const timeSincePreview = app._previewEnterTime ? (Date.now() - app._previewEnterTime) : Infinity;
      const canPlace = timeSincePreview > 100; // Require at least 100ms in preview mode
      
      // If same cell (by coordinates) or same element, confirm placement
      if(canPlace && ((previewX === x && previewY === y) || app.previewCell === cellEl)){
        handlePlacement(cellEl, x, y, app);
        setPreviewMode(false, app);
        app.previewCell = null;
        app._previewEnterTime = null;
        app.ui.clearGhost();
        return;
      }
    }
    
    // Otherwise, enter/update preview mode
    setPreviewMode(true, app);
    app.previewCell = cellEl;
    app._previewEnterTime = Date.now();
    app.ui.updateGhostPreview(cellEl, x, y, app);
  }
  
  // Handle placement
  function handlePlacement(cellEl, x, y, app) {
    if(!app.selectedPiece || app.isPlacing) return;
    app.isPlacing = true;
    
    const { getCurrentOrientation, orientationToKey, placementCache } = app.piece;
    const { isEmpty, validBlokusContact } = app.board;
    const board = app.state.getBoard();
    const usedPieces = app.state.getUsedPieces();
    
    const orientationKey = orientationToKey(getCurrentOrientation(app.selectedPiece.id, app.selectedPiece.orientationIndex));
    const placed = placementCache[app.selectedPiece.id]?.[orientationKey]?.[y]?.[x];
    
    if(!placed) {
      app.isPlacing = false;
      app.ui.showToast('Outside board');
      return;
    }
    
    if(!isEmpty(placed, board)){
      app.isPlacing = false;
      app.ui.showToast('Collides with existing piece');
      return;
    }
    
    if(!validBlokusContact(placed, app.currentPlayer, board, app.size, usedPieces)){
      app.isPlacing = false;
      app.ui.showToast('Invalid Blokus placement');
      return;
    }
    
    app.state.placePiece(placed, app.currentPlayer, app.selectedPiece.id);
    app.state.invalidateValidMovesCache(app.players);
    
    app.selectedPiece = null;
    app.selectedPieceElement = null;
    setDragging(false, app);
    setPreviewMode(false, app);
    app.previewCell = null;
    app.ui.clearGhost();
    
    if(app.ui.cachedPieceElements){
      app.ui.cachedPieceElements.forEach(p => p.classList.remove('selected'));
    } else {
      document.querySelectorAll('.piece').forEach(p => p.classList.remove('selected'));
    }
    
    app.isPlacing = false;
    nextTurn(app);
    app.ui.renderBoard(app.state.getBoard(), app.size, app.players, createBoardHandlers(app));
    app.ui.renderPalette(app.piece.PIECES, app.currentPlayer, app.players, app.state.getUsedPieces(), createPaletteHandlers(app), app);
  }
  
  // Board event handlers
  function handleBoardClick(e, app) {
    // Ignore click events that are triggered by touch (they fire after touchend)
    // We track this by checking if we recently handled a touch event
    if(app._lastTouchTime && (Date.now() - app._lastTouchTime) < 300) {
      return;
    }
    const cell = e.target.closest('.cell');
    if(!cell || !app.selectedPiece || isDragging(app.interactionState)) return;
    const x = parseInt(cell.dataset.x, 10);
    const y = parseInt(cell.dataset.y, 10);
    handleCellInteraction(cell, x, y, app);
  }
  
  function handleBoardTouchStart(e, app) {
    const cell = e.target.closest('.cell');
    if(!cell || !app.selectedPiece || !e.touches[0]) return;
    
    const touch = e.touches[0];
    
    // If already in preview mode, just track the touch start (for tap detection)
    // but don't start a drag - let touchend handle the interaction
    if(isPreviewing(app.interactionState)) {
      boardCellTouchStarts.set(cell, {x: touch.clientX, y: touch.clientY});
      return;
    }
    
    // Only start drag if in NONE state
    if(app.interactionState !== InteractionState.NONE) return;
    
    boardCellTouchStarts.set(cell, {x: touch.clientX, y: touch.clientY});
    // Call handleDragStart to set state to SELECTING for tap detection
    const dragStarted = handleDragStart(touch.clientX, touch.clientY, app);
    // If handleDragStart failed for some reason, we still track the touch start
    // so that handleBoardTouchEnd can detect it as a tap
  }
  
  function handleBoardTouchMove(e, app) {
    if(app.selectedPiece && e.touches && e.touches[0]){
      if(app.interactionState === InteractionState.DRAGGING || app.interactionState === InteractionState.SELECTING){
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY, app);
      }
    }
  }
  
  function handleBoardTouchEnd(e, app) {
    const cell = e.target.closest('.cell');
    if(!cell || !app.selectedPiece || !e.changedTouches || !e.changedTouches[0]) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Mark that we just handled a touch event to prevent click from firing
    app._lastTouchTime = Date.now();
    
    const touch = e.changedTouches[0];
    const touchStart = boardCellTouchStarts.get(cell);
    const wasTap = touchStart && isTapMovement(touchStart.x, touchStart.y, touch.clientX, touch.clientY, 10);
    
    // If in preview mode, handle cell interaction directly (for tap-to-confirm)
    if(isPreviewing(app.interactionState)){
      const x = parseInt(cell.dataset.x, 10);
      const y = parseInt(cell.dataset.y, 10);
      handleCellInteraction(cell, x, y, app);
      boardCellTouchStarts.delete(cell);
      return;
    }
    
    // Otherwise, handle drag end
    const result = handleDragEnd(touch.clientX, touch.clientY, app);
    if(result){
      if(result.type === 'drag' && result.cell){
        handlePlacement(result.cell, result.x, result.y, app);
      } else if(wasTap && result.type === 'tap'){
        const x = parseInt(cell.dataset.x, 10);
        const y = parseInt(cell.dataset.y, 10);
        handleCellInteraction(cell, x, y, app);
      }
    } else if(wasTap && touchStart){
      // Fallback: if handleDragEnd returned null but we have a valid tap,
      // treat it as a tap (this handles cases where the state wasn't set correctly)
      const x = parseInt(cell.dataset.x, 10);
      const y = parseInt(cell.dataset.y, 10);
      handleCellInteraction(cell, x, y, app);
    }
    boardCellTouchStarts.delete(cell);
  }
  
  function handleBoardTouchCancel(e, app) {
    const cell = e.target.closest('.cell');
    if(cell) boardCellTouchStarts.delete(cell);
    app.interactionState = InteractionState.NONE;
    app.hoveringCell = null;
    setPreviewMode(false, app);
    app.previewCell = null;
    app.ui.clearGhost();
  }
  
  // Drag over handler
  function onDragOver(e, app) {
    e.preventDefault();
    if(isDragging(app.interactionState) && app.selectedPiece){
      const x = parseInt(e.currentTarget.dataset.x, 10);
      const y = parseInt(e.currentTarget.dataset.y, 10);
      app.lastHoveredCell = e.currentTarget;
      app.hoveringCell = {x, y};
      app.ui.updateGhostPreview(e.currentTarget, x, y, app);
    }
  }
  
  // Drop handler
  function onDrop(e, app) {
    e.preventDefault();
    if(!isDragging(app.interactionState) || !app.selectedPiece || app.isPlacing) return;
    const x = parseInt(e.currentTarget.dataset.x, 10);
    const y = parseInt(e.currentTarget.dataset.y, 10);
    handlePlacement(e.currentTarget, x, y, app);
  }
  
  // Create board handlers object
  function createBoardHandlers(app) {
    return {
      handleBoardClick: (e) => handleBoardClick(e, app),
      handleBoardTouchStart: (e) => handleBoardTouchStart(e, app),
      handleBoardTouchMove: (e) => handleBoardTouchMove(e, app),
      handleBoardTouchEnd: (e) => handleBoardTouchEnd(e, app),
      handleBoardTouchCancel: (e) => handleBoardTouchCancel(e, app),
      onDragOver: (e) => onDragOver(e, app),
      onDrop: (e) => onDrop(e, app)
    };
  }
  
  // Create palette handlers object
  function createPaletteHandlers(app) {
    return {
      handleDragStart: (x, y) => handleDragStart(x, y, app),
      handleDragMove: (x, y) => handleDragMove(x, y, app),
      handleDragEnd: (x, y) => handleDragEnd(x, y, app),
      handlePlacement: (cell, x, y) => handlePlacement(cell, x, y, app),
      isTapMovement: isTapMovement
    };
  }
  
  // Next turn logic (moved here from main since it's interaction-related)
  function nextTurn(app) {
    const { hasValidMoves } = app.board;
    const { getValidMovesCache } = app.state;
    const validMovesCache = getValidMovesCache();
    
    let attempts = 0;
    app.currentPlayer = (app.currentPlayer + 1) % app.players.length;
    
    while(!hasValidMoves(app.currentPlayer, app.state.getBoard(), app.size, app.state.getUsedPieces(), 
                         app.piece.PIECES, app.piece.PIECE_ORIENTATIONS, app.piece.placementCache, 
                         app.piece.boundingBoxCache, app.piece.orientationToKey, app.board.isEmpty, 
                         app.board.validBlokusContact, validMovesCache) && attempts < app.players.length){
      const playerName = app.players[app.currentPlayer].name;
      app.ui.showToast(`Player ${playerName} has no more valid options.`);
      app.currentPlayer = (app.currentPlayer + 1) % app.players.length;
      attempts++;
    }
    
    app.state.setCurrentPlayer(app.currentPlayer);
    app.ui.updateBoardBorder(app.currentPlayer, app.players);
    app.ui.renderScores(app.currentPlayer, app.players, (playerId) => {
      return app.state.calculatePlayerScore(playerId, app.piece.PIECES);
    });
    
    const playersWithValidMoves = app.players.filter(p => 
      hasValidMoves(p.id, app.state.getBoard(), app.size, app.state.getUsedPieces(), 
                    app.piece.PIECES, app.piece.PIECE_ORIENTATIONS, app.piece.placementCache, 
                    app.piece.boundingBoxCache, app.piece.orientationToKey, app.board.isEmpty, 
                    app.board.validBlokusContact, validMovesCache));
    
    if(playersWithValidMoves.length === 0){
      endGame(app);
    }
  }
  
  // End game
  function endGame(app) {
    const playerScores = app.players.map(player => ({
      player: player,
      score: app.state.calculatePlayerScore(player.id, app.piece.PIECES)
    }));
    
    playerScores.sort((a, b) => b.score - a.score);
    
    let message = 'Game Over\n\n';
    playerScores.forEach((ps, index) => {
      const place = index + 1;
      message += `${place}. Player ${ps.player.name}: ${ps.score} points\n`;
    });
    
    alert(message);
  }
  
  // Public API
  return {
    InteractionState,
    isDragging,
    isPreviewing,
    setDragging,
    setPreviewMode,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDocumentTouchMove,
    handleCellInteraction,
    handlePlacement,
    createBoardHandlers,
    createPaletteHandlers,
    isTapMovement,
    nextTurn,
    endGame
  };
})();

