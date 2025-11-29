# Blokus Online Version

Play in your (mobile) browser: https://eyecatchup.github.io/blokus/

## Implementation Details

- 🧩 **100% Blokus gameplay**
  - All official Blokus rules implemented - plus tiebraker handling
  - All 21 official Blokus pieces included
- 📱 **Mobile-optimized UX**
  - Custom drag handling with threshold detection
  - Alternative for drag-and-drop: Tap-to-preview mode (click once → preview, click again → place)
  - Responsive layout with dynamic board scaling
- ⚡️ **Performance-optimized for smooth game-play - even on low-end device**
  - Precomputing all possible orientations + all valid placements for every piece at startup
  - O(1) placement lookup during drag
  - Using 2D array for direct DOM access instead of querySelector during ghost preview = buttery smooth on mobile
- ✨ **Extras**
  - Undo support with full move history
  - Hint feature
  - Auto-move (random valid move)

## Scoring Rules

The official Mattel rules do not specify a tiebreaker. However, a commonly accepted rule is used in this implementation:

Tiebreaker: If multiple players have the same score count, the winner is the one who played the **smaller last piece**.  
All pieces placed: If multiple players have the same score count _and_ completed the game by placing all 21 pieces, the winner is the one who placed the **single-square piece last**.

## Clarifying the “Free-Corner” vs. “Assigned-Corner” Rule

According to the official Mattel rules—as well as major digital implementations such as the official app and Board Game Arena—each player may place their first piece on any of the four board corners. Starting corners are not tied to specific colors.

However, many unofficial or community implementations assume fixed color–corner assignments (so players are not “free to choose”): Blue starts at (0,0), Yellow (0,19), Red (19,0), Green (19,19). 

This project follows the official Mattel rules, allowing players to freely choose their starting corner.

## Credits

The game uses icons from: https://www.svgrepo.com/collection/zwicon-line-icons/.

## License

(c) 2025 - present, Stephan Schmitz <eyecatchup@gmail.com>  
License: MIT, http://eyecatchup.mit-license.org  
URL: https://github.com/eyecatchup/blokus

## Legal Note

The author of the software is not a partner, affiliate, or licensee of Mattel or its employees, nor is the software in any other way formally associated with or legitimized by Mattel. Blokus is a registered trademark of Mattel.
