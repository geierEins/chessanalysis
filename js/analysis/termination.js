// Computes which square(s) should show a termination badge (checkmate/timeout/
// resignation/draw icon) on the board's final position. Pure FEN-in,
// badge-descriptors-out - no dependency on app state, so it's extracted out
// of main.js on its own.

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// Reuses existing move-category colors where they fit, so the termination
// marker reads as part of the same visual language rather than a one-off.
const TERMINATION_MARKERS = {
  checkmate: { icon: 'icons/svg/mate.svg', color: '#ec6250', label: 'Schachmatt' },
  timeout: { icon: 'icons/svg/unnamed_clock_black.svg', color: '#F7A256', label: 'Zeitüberschreitung' },
  resignation: { icon: 'icons/svg/resign_black.svg', color: '#9CA3AF', label: 'Aufgegeben' },
  abandonment: { icon: 'icons/svg/resign_black.svg', color: '#9CA3AF', label: 'Abgebrochen' },
  draw: { icon: 'icons/svg/draw_black.svg', color: '#7A9CBF', label: 'Remis' },
};

/** @returns {string|null} e.g. "e1" - reads the FEN board field directly
 *  rather than instantiating a full Chess() instance just to look up a king. */
function findKingSquare(fen, color) {
  const kingChar = color === 'w' ? 'K' : 'k';
  const ranks = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      if (ch === kingChar) return `${FILES[file]}${8 - r}`;
      file++;
    }
  }
  return null;
}

/** Termination badges to show on the final position's king(s), or []. */
export function computeTerminationMarkers(termination, finalFen) {
  if (!termination) return [];
  const marker = TERMINATION_MARKERS[termination.type];
  if (!marker) return [];

  if (termination.type === 'draw') {
    return [findKingSquare(finalFen, 'w'), findKingSquare(finalFen, 'b')]
      .filter(Boolean)
      .map((square) => ({ square, ...marker }));
  }

  const square = findKingSquare(finalFen, termination.loserColor === 'white' ? 'w' : 'b');
  return square ? [{ square, ...marker }] : [];
}
