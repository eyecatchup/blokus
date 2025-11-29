# Blokus Online Version

Play in your (mobile) browser: https://eyecatchup.github.io/blokus/

## Scoring Rules

The official Mattel rules, don't specify a tiebraker rule. However, a common rule is established and used for determining the winner in this game implementation.

Tiebreaker: If both players have the same number of unplayed squares, the winner is the one who played the smaller last piece.  
All pieces placed: If both players complete the game by placing all their pieces, the player who placed the single-square piece last is the winner.

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
