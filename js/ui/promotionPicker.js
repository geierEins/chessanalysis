// Piece-choice picker for a pawn-promotion drag-drop on the analysis board
// (js/main.js's handleUserDrop). Appended directly into the target square's
// own DOM element - the same technique js/ui/board.js already uses for
// badges/termination markers - rather than a separately-positioned overlay.

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

/**
 * @param {HTMLElement} squareEl - the target square's DOM element
 * @param {'w'|'b'} color - which side is promoting, picks the matching piece images
 * @returns {Promise<string|null>} the chosen piece letter, or null if dismissed
 */
export function showPromotionPicker(squareEl, color) {
  return new Promise((resolve) => {
    squareEl.style.position = 'relative';
    const picker = document.createElement('div');
    picker.className = 'promotion-picker';

    function finish(choice) {
      picker.remove();
      document.removeEventListener('mousedown', onOutsideClick, true);
      resolve(choice);
    }

    function onOutsideClick(e) {
      if (!picker.contains(e.target)) finish(null);
    }

    for (const piece of PROMOTION_PIECES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promotion-piece';
      const img = document.createElement('img');
      img.src = `https://chessboardjs.com/img/chesspieces/wikipedia/${color}${piece.toUpperCase()}.png`;
      img.alt = piece;
      btn.appendChild(img);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        finish(piece);
      });
      picker.appendChild(btn);
    }

    squareEl.appendChild(picker);
    // Deferred past this tick so the mousedown that triggered the rejected
    // drag/drop (which is what caused this picker to open) doesn't itself
    // immediately count as an "outside click" and close it again.
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
  });
}
