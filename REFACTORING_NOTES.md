# Refactoring Plan

The monolithic blokus.js (1396 lines) is being split into logical modules:

1. **config.js** - Shared constants (SIZE, PLAYERS)
2. **piece.js** - Piece definitions, orientations, rotations, normalization (DONE)
3. **board.js** - Game rules (isInsideBoard, isEmpty, validBlokusContact) (DONE)
4. **state.js** - Game state management (currentPlayer, history, usedPieces) (DONE)
5. **ui.js** - DOM rendering (board, palette, scores, ghost preview, resize)
6. **interaction.js** - Drag/drop/touch handling, state machine
7. **main.js** - Initialization and event binding

Modules will share state through a global BlokusApp namespace to manage interdependencies.

