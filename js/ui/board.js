// Wraps chessboard.js and overlays a move-classification badge, a last-move
// square highlight, a game-termination marker, a best-move suggestion arrow
// and free-form right-click annotations (squares + arrows) on the board.

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// The arrow is built as ONE filled polygon (shaft rectangle(s) + head
// triangle, all in a single <path>) rather than a stroked line plus a
// separate <marker>. A stroke+marker pair are two independently alpha-
// blended shapes, so wherever they overlap the semi-transparent color visibly
// darkens ("seam"); round line caps/joins also don't match a sharp-edged
// look. A single filled path has none of that - overlapping sub-paths within
// one <path> are resolved into one shape before opacity is applied, and
// straight polygon edges are sharp by construction.
//
// Color comes from a CSS class (.arrow-best-move / .arrow-user - defined in
// css/styles.css as `fill: var(--best-move-arrow-color|--user-arrow-color)`)
// rather than a literal `fill` attribute set here, so every already-drawn
// arrow re-colors itself instantly when js/main.js updates those custom
// properties on a board-theme change, with no redraw needed.
const ARROW_SHAFT_HALF_WIDTH_FRACTION = 0.095; // of a square's size
const ARROW_HEAD_HALF_WIDTH_FRACTION = 0.27;
const ARROW_HEAD_LENGTH_FRACTION = 0.337; // 32/95 - triangle depth
const ARROW_TIP_PULLBACK_FRACTION = 0; // tip points to destination square center
const ARROW_START_PULLBACK_FRACTION = 0.35; // arrow starts at 75% of the distance (1 - 0.25)

const DEFAULT_PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';

export class BoardView {
  #board;
  #boardElId;
  #boardEl;
  #arrowLayer;
  #userArrowLayer;
  #orientation = 'white';
  #pieceTheme = DEFAULT_PIECE_THEME;
  #onMoveEnd;
  #canDragStart;
  #onUserDrop;
  #onSnapEnd;
  #getLegalMoves;
  #onIllegalClick;
  #lastBadge = null;
  #lastArrow = null;
  #lastTerminationMarkers = null;
  #lastMoveSquares = null;
  #badgeEl = null;
  #terminationEls = [];
  #lastMoveEls = [];
  #userArrows = []; // {from, to}[] - right-click-dragged annotation arrows
  #userHighlightSquares = new Set(); // right-clicked (not dragged) annotation squares
  #selectedSquare = null; // click-to-move: the square whose legal destinations are currently highlighted
  #selectedSquareEl = null; // its DOM element, for the .selected-square veil
  #legalTargets = new Set(); // destination squares of #selectedSquare - a click on one of these completes the move
  #moveHighlightEls = [];
  #awaitingDeselectToggle = false; // onDragStart re-picked-up the already-selected square - onDrop deselects it if that turns out to be a plain click

  /**
   * @param {{
   *   onMoveEnd?: () => void,
   *   canDragStart?: (square: string, piece: string) => boolean,
   *   onUserDrop?: (source: string, target: string, info: {viaDrag: boolean}) => boolean,
   *   onSnapEnd?: () => void,
   *   getLegalMoves?: (square: string) => Array<{to: string, isCapture: boolean}>,
   *   onIllegalClick?: () => void,
   * }} [options]
   *   onMoveEnd fires once a piece's move animation (triggered by
   *   setPosition) has fully finished. canDragStart/onUserDrop/onSnapEnd wire
   *   up interactive dragging (js/main.js's handleUserDrop) - board.js itself
   *   has no chess-rule knowledge; it just forwards chessboard.js's own
   *   onDragStart/onDrop/onSnapEnd to these callbacks and translates the
   *   boolean result into what chessboard.js expects. getLegalMoves backs
   *   both the drag-start highlight and the click-to-move flow below -
   *   board.js only renders whatever squares it returns, it never computes
   *   legality itself. onUserDrop's info.viaDrag tells the caller whether
   *   chessboard.js's own animation is about to visually place the piece
   *   (a real drag) or not (a click-to-move completion) - js/main.js needs
   *   this to know whether it still has to move the piece on the board
   *   itself. onIllegalClick fires from that same click-to-move flow when a
   *   piece was selected and the next click landed on an occupied, non-legal
   *   square (js/main.js wires this to the same illegal-move sound a
   *   rejected drag already gets).
   */
  constructor(
    boardElementId,
    arrowLayerId,
    userArrowLayerId,
    { onMoveEnd, canDragStart, onUserDrop, onSnapEnd, getLegalMoves, onIllegalClick } = {}
  ) {
    this.#boardElId = boardElementId;
    this.#boardEl = document.getElementById(boardElementId);
    this.#arrowLayer = document.getElementById(arrowLayerId);
    this.#userArrowLayer = document.getElementById(userArrowLayerId);
    this.#onMoveEnd = onMoveEnd;
    this.#canDragStart = canDragStart;
    this.#onUserDrop = onUserDrop;
    this.#onSnapEnd = onSnapEnd;
    this.#getLegalMoves = getLegalMoves;
    this.#onIllegalClick = onIllegalClick;
    this.#board = this.#createBoard();

    // The board container is sized by CSS (responsive, viewport-based), not by
    // chessboard.js itself, so re-measure and re-render whenever it changes.
    // chessboard.js also fully rebuilds its internal square/piece DOM on every
    // resize (and on flip/orientation), which wipes anything we've injected
    // directly into square elements (badge, last-move highlight, termination
    // marker) - so all of those need reapplying here too, not just the arrow.
    const container = this.#arrowLayer.parentElement;
    const observer = new ResizeObserver(() => {
      this.#board.resize();
      this.#reapplyOverlays();
    });
    observer.observe(container);

    this.#setupAnnotationMouseEvents();
    this.#setupClickToMove(this.#canDragStart, this.#onUserDrop, this.#onIllegalClick);
  }

  /** Builds the actual chessboard.js instance against this.#pieceTheme -
   *  factored out of the constructor so setPieceTheme() below can destroy and
   *  rebuild it with a new theme without duplicating all the drag/click-to-
   *  move wiring. */
  #createBoard() {
    return window.Chessboard(this.#boardElId, {
      position: 'start',
      draggable: true,
      pieceTheme: this.#pieceTheme,
      onDragStart: (source, piece) => {
        const allowed = this.#canDragStart?.(source, piece) ?? false;
        if (!allowed) return false;
        if (this.#selectedSquare === source) {
          // Picking the already-selected piece back up - if this turns into
          // a plain click with no movement (onDrop below), that's the
          // deselect toggle; if it's a real drag instead, onDrop's own
          // source!==target branch handles that normally either way.
          this.#awaitingDeselectToggle = true;
        } else {
          this.#showMoveHighlights(source, this.#getLegalMoves?.(source) ?? []);
        }
        return true;
      },
      onDrop: (source, target) => {
        if (source === target) {
          // No real movement - chessboard.js still runs this whole
          // onDragStart/onDrop lifecycle for a plain click, so this is
          // click-to-move's own "it was just a click" signal, not a move
          // attempt. Either toggle off the selection just picked back up
          // (see onDragStart above), or leave a fresh/switched selection's
          // highlights showing exactly as onDragStart already rendered them.
          if (this.#awaitingDeselectToggle) this.clearMoveHighlights();
          this.#awaitingDeselectToggle = false;
          // MUST be 'snapback', not undefined/a normal drop: any other
          // result routes through chessboard.js's dropDraggedPieceOnSquare(),
          // which always fires onSnapEnd once its (same-square, so instant)
          // animation completes - and js/main.js's onSnapEnd handler calls
          // board.setPosition(), whose own clearMoveHighlights() would wipe
          // the selection right back out a moment after onDragStart just
          // rendered it. 'snapback' instead runs snapbackDraggedPiece(),
          // which only fires the (here unwired) onSnapbackEnd - no
          // setPosition(), so the highlights survive untouched.
          return 'snapback';
        }
        this.#awaitingDeselectToggle = false;
        this.clearMoveHighlights();
        // viaDrag:true - chessboard.js's own animation is about to visually
        // place the piece, so js/main.js knows it can skip its own redundant
        // setPosition() here (still doing one later via onSnapEnd, to fix up
        // castling/en passant). The click-to-move path below has no such
        // animation ever happening, so it passes false instead.
        return this.#onUserDrop?.(source, target, { viaDrag: true }) ? undefined : 'snapback';
      },
      onSnapEnd: () => this.#onSnapEnd?.(),
      onMoveEnd: () => this.#onMoveEnd?.(),
    });
  }

  /**
   * Switches the piece sprite set (e.g. wikipedia/alpha/uscf/neo -
   * js/ui/pieceThemePicker.js), preserving the current position/orientation/
   * overlays. chessboard.js reads config.pieceTheme once at construction and
   * bakes it into every piece <img> src it renders - there's no public API to
   * swap it live, so this destroys and rebuilds the whole chessboard.js
   * instance instead (our own BoardView wrapper, its overlays and DOM
   * container all survive; only chessboard.js's internal widget is replaced).
   * @param {string|((piece: string) => string)} urlTemplate - either a plain
   *   string template (e.g. '.../{piece}.png', {piece} becomes e.g. "wP" -
   *   chessboard.js's own interpolation), or a function for a set whose CDN
   *   needs the piece code transformed first (e.g. chess.com's own sets want
   *   it lowercased to "wp") - passed straight through to chessboard.js's
   *   config.pieceTheme, which already supports both forms itself.
   */
  setPieceTheme(urlTemplate) {
    if (this.#pieceTheme === urlTemplate) return;
    this.#pieceTheme = urlTemplate;
    const fen = this.#board.fen();
    const orientation = this.#orientation;
    this.#board.destroy();
    this.#board = this.#createBoard();
    this.#board.orientation(orientation);
    this.#board.position(fen, false);
    this.#reapplyOverlays();
  }

  /**
   * Chess.com-style click-to-move, second half of the flow started by
   * onDragStart/onDrop above: those two already own every square with a
   * piece this side can pick up (selecting it, switching selection to a
   * different one, or toggling the same one back off - see their own
   * comments), including for a plain click with zero movement, since
   * chessboard.js runs that same onDragStart/onDrop lifecycle regardless of
   * whether the piece actually moved anywhere. What's left for this
   * independent mousedown/mouseup pair (same pairing
   * #setupAnnotationMouseEvents already uses for the right-click case below)
   * is exactly what that lifecycle never touches: a click landing on an
   * empty square, or a piece canDragStart refuses to let this side pick up
   * (the opponent's) - completing the move onto a legal target, or clearing
   * the selection (with an illegal-move buzz if it looks like a failed
   * capture attempt) otherwise.
   */
  #setupClickToMove(canDragStart, onUserDrop, onIllegalClick) {
    let pointerDownSquare = null;
    let pointerDownWasOwnDraggable = false;

    this.#boardEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // left button only - right-click is #setupAnnotationMouseEvents's job
      const square = e.target.closest('[data-square]')?.dataset.square ?? null;
      pointerDownSquare = square;
      const piece = square ? this.#board.position()[square] : null;
      pointerDownWasOwnDraggable = Boolean(piece && (canDragStart?.(square, piece) ?? false));
    });

    this.#boardEl.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || pointerDownSquare === null) return;
      const clickedSquare = pointerDownSquare;
      const wasOwnDraggable = pointerDownWasOwnDraggable;
      pointerDownSquare = null;
      pointerDownWasOwnDraggable = false;
      // This square's own onDragStart/onDrop already handled the entire
      // gesture (select/switch/toggle-off, or a real drag-move).
      if (wasOwnDraggable) return;

      const releasedOn = e.target.closest('[data-square]')?.dataset.square ?? null;
      // mousedown and mouseup landed on different squares - an actual drag
      // dropped onto an empty/opponent square chessboard.js's own lifecycle
      // never engaged for (no piece there to have picked up in the first
      // place) - not a click either way, nothing for this handler to do.
      if (releasedOn !== clickedSquare) return;

      if (this.#selectedSquare && this.#legalTargets.has(clickedSquare)) {
        const source = this.#selectedSquare;
        this.clearMoveHighlights();
        // viaDrag:false - no chessboard.js drag animation ran for this click
        // at all, so js/main.js must do its own setPosition() to actually
        // move the piece visually (see the drag-path's own comment above).
        onUserDrop?.(source, clickedSquare, { viaDrag: false });
        return;
      }

      const hadSelection = Boolean(this.#selectedSquare);
      this.clearMoveHighlights();

      // A piece was selected and this click landed on an occupied square
      // that isn't among its legal destinations (the opponent's piece,
      // otherwise this square's own onDragStart/onDrop would already have
      // claimed the gesture above) - a genuine failed capture attempt,
      // worth the same buzz a rejected drag gets. Clicking empty space just
      // cancels the selection silently, same as a drag dropped back on its
      // own square.
      const piece = this.#board.position()[clickedSquare];
      if (hadSelection && piece) onIllegalClick?.();
    });
  }

  /** Renders the small move-hint markers (filled dot on an empty square, a
   *  ring on a capturable one) plus a highlight on the selected square
   *  itself, and remembers the selection so a later click on one of these
   *  squares (#setupClickToMove) can complete the move. */
  #showMoveHighlights(square, legalMoves) {
    this.clearMoveHighlights();
    if (!legalMoves || legalMoves.length === 0) return;
    this.#selectedSquare = square;
    this.#selectedSquareEl = this.#squareEl(square);
    this.#selectedSquareEl?.classList.add('selected-square');

    for (const move of legalMoves) {
      this.#legalTargets.add(move.to);
      const squareEl = this.#squareEl(move.to);
      if (!squareEl) continue;
      squareEl.style.position = 'relative';

      const hint = document.createElement('div');
      hint.className = `move-hint ${move.isCapture ? 'move-hint-capture' : 'move-hint-move'}`;
      squareEl.appendChild(hint);
      this.#moveHighlightEls.push(hint);
    }
  }

  clearMoveHighlights() {
    this.#selectedSquare = null;
    this.#selectedSquareEl?.classList.remove('selected-square');
    this.#selectedSquareEl = null;
    this.#legalTargets.clear();
    for (const el of this.#moveHighlightEls) el.remove();
    this.#moveHighlightEls = [];
  }

  /**
   * Right-click a square (no drag) toggles a red highlight on it; right-
   * click-drag from square to square toggles a blue arrow between them; a
   * plain left click anywhere on the board clears all of them - same
   * conventions as lichess/chess.com. Also cleared automatically on the next
   * setPosition() (a new move/ply). Listens on #boardEl itself (not the
   * individual square elements, which chessboard.js recreates on every
   * resize/flip) so this never needs re-wiring.
   */
  #setupAnnotationMouseEvents() {
    let dragStartSquare = null;

    this.#boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // Capture phase, not bubbling: chessboard.js's own mousedownSquare (bound
    // via jQuery delegation on its inner .board element, a descendant of
    // #boardEl) never checks which mouse button was pressed, so holding the
    // RIGHT button on a piece would otherwise also start chessboard.js's own
    // native drag - moving the piece - at the same time this handler starts
    // tracking a right-click arrow/highlight gesture. Running in the capture
    // phase lets stopPropagation() here veto that descendant's bubbling
    // listener before it ever fires, for a right-click specifically; left
    // clicks fall through untouched (no stopPropagation), so normal
    // dragging and this file's own click-to-move (#setupClickToMove, also on
    // #boardEl) are both unaffected.
    this.#boardEl.addEventListener(
      'mousedown',
      (e) => {
        if (e.button !== 2) return;
        e.stopPropagation();
        dragStartSquare = e.target.closest('[data-square]')?.dataset.square ?? null;
      },
      { capture: true }
    );

    this.#boardEl.addEventListener('mouseup', (e) => {
      if (e.button !== 2 || !dragStartSquare) return;
      const startSquare = dragStartSquare;
      dragStartSquare = null;
      const endSquare = e.target.closest('[data-square]')?.dataset.square ?? null;
      if (!endSquare) return;

      if (endSquare === startSquare) {
        this.toggleSquareHighlight(startSquare);
      } else {
        this.toggleUserArrow(startSquare, endSquare);
      }
    });

    // 'click' only ever fires for the primary (left) mouse button.
    this.#boardEl.addEventListener('click', () => {
      this.clearUserArrows();
      this.clearSquareHighlights();
    });
  }

  setPosition(fen) {
    // Annotations are scoped to the position they were drawn on, not the
    // whole game - stale arrows pointing at a totally different position
    // would just be confusing once you've stepped to a different move.
    this.clearUserArrows();
    this.clearSquareHighlights();
    this.clearMoveHighlights();
    this.#board.position(fen, true);
  }

  #squareEl(square) {
    return this.#boardEl.querySelector(`[data-square="${square}"]`);
  }

  /** Public accessor for #squareEl - e.g. js/main.js overlays the promotion
   *  picker (js/ui/promotionPicker.js) directly into a square's element. */
  getSquareElement(square) {
    return this.#squareEl(square);
  }

  clearBadge() {
    this.#lastBadge = null;
    this.#badgeEl?.remove();
    this.#badgeEl = null;
  }

  /**
   * Shows a move-classification icon leaning into the top-right corner of the
   * given square. Appended directly into the square's own DOM element, so it
   * scales with the square automatically (percentage sizing) and never drifts
   * out of alignment with it.
   * @param {string} square - e.g. "e4"
   * @param {{icon: string, label: string}} category
   */
  showBadge(square, category) {
    this.clearBadge();
    if (!square || !category) return;
    this.#lastBadge = { square, category };

    const squareEl = this.#squareEl(square);
    if (!squareEl) return;
    squareEl.style.position = 'relative';

    const badge = document.createElement('img');
    badge.className = 'move-badge';
    badge.src = category.icon;
    badge.alt = category.label;
    squareEl.appendChild(badge);
    this.#badgeEl = badge;
  }

  /**
   * Same spot as showBadge(), but a neutral spinning placeholder - shown while
   * a move's classification is still being computed in the background (a
   * branch move, see js/main.js's evaluateBranchNode).
   * @param {string} square - e.g. "e4"
   */
  showLoadingBadge(square) {
    this.clearBadge();
    if (!square) return;
    this.#lastBadge = { square, category: null };

    const squareEl = this.#squareEl(square);
    if (!squareEl) return;
    squareEl.style.position = 'relative';

    const badge = document.createElement('span');
    badge.className = 'move-badge move-badge-loading';
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', 'Zugqualität wird berechnet');
    squareEl.appendChild(badge);
    this.#badgeEl = badge;
  }

  clearLastMoveHighlight() {
    this.#lastMoveSquares = null;
    for (const el of this.#lastMoveEls) el.classList.remove('lastmove-highlight');
    this.#lastMoveEls = [];
  }

  /**
   * Outlines the from/to squares of the currently-shown move, so it's clear
   * at a glance which piece just moved and where from - a thin border derived
   * from the active board theme's own light-square color (via the
   * `--board-light` custom property), not a hardcoded color.
   * @param {string} from - e.g. "g1"
   * @param {string} to - e.g. "f3"
   */
  showLastMoveHighlight(from, to) {
    this.clearLastMoveHighlight();
    if (!from || !to) return;
    this.#lastMoveSquares = { from, to };

    for (const square of [from, to]) {
      const squareEl = this.#squareEl(square);
      if (!squareEl) continue;
      squareEl.classList.add('lastmove-highlight');
      this.#lastMoveEls.push(squareEl);
    }
  }

  clearTerminationBadges() {
    this.#lastTerminationMarkers = null;
    for (const el of this.#terminationEls) {
      el.classList.remove('termination-square');
      el.style.removeProperty('--marker-color');
      el.querySelector(':scope > .termination-marker-icon')?.remove();
    }
    this.#terminationEls = [];
  }

  /**
   * Marks the king square(s) that explain how the game ended (only meaningful
   * on the final position): the square's own background color (set on the
   * square element itself, so it always sits *behind* the piece rendered
   * inside it - the piece's own colors stay untouched) plus a matching icon
   * in the corner, e.g. a red background + mate symbol on a checkmated king,
   * or a clock on a king whose side ran out of time.
   * @param {{square: string, icon: string, color: string, label: string}[]} markers
   */
  showTerminationBadges(markers) {
    this.clearTerminationBadges();
    if (!markers || markers.length === 0) return;
    this.#lastTerminationMarkers = markers;

    for (const marker of markers) {
      const squareEl = this.#squareEl(marker.square);
      if (!squareEl) continue;
      squareEl.style.position = 'relative';
      squareEl.style.setProperty('--marker-color', marker.color);
      squareEl.classList.add('termination-square');

      const icon = document.createElement('img');
      icon.className = 'termination-marker-icon';
      icon.src = marker.icon;
      icon.alt = marker.label;
      squareEl.appendChild(icon);

      this.#terminationEls.push(squareEl);
    }
  }

  clearArrow() {
    this.#lastArrow = null;
    this.#arrowLayer.innerHTML = '';
  }

  /**
   * Draws a thick, semi-transparent "best move" arrow. Knight-shaped moves
   * (file/rank delta of 1-and-2) get the conventional bent L-shaped arrow
   * instead of a straight line, since a straight line doesn't read as a
   * knight move.
   * @param {string} from - e.g. "g1"
   * @param {string} to - e.g. "f3"
   */
  showArrow(from, to) {
    this.#arrowLayer.innerHTML = '';
    if (!from || !to) {
      this.#lastArrow = null;
      return;
    }
    this.#lastArrow = { from, to };
    this.#appendArrow(this.#arrowLayer, from, to, 'arrow-best-move');
  }

  /** Toggles a right-click-dragged annotation arrow between two squares -
   *  dragging the exact same arrow again removes it (lichess/chess.com
   *  convention), and multiple such arrows can coexist. */
  toggleUserArrow(from, to) {
    const index = this.#userArrows.findIndex((a) => a.from === from && a.to === to);
    if (index !== -1) this.#userArrows.splice(index, 1);
    else this.#userArrows.push({ from, to });
    this.#redrawUserArrows();
  }

  clearUserArrows() {
    if (this.#userArrows.length === 0) return;
    this.#userArrows = [];
    this.#userArrowLayer.innerHTML = '';
  }

  #redrawUserArrows() {
    this.#userArrowLayer.innerHTML = '';
    for (const { from, to } of this.#userArrows) {
      this.#appendArrow(this.#userArrowLayer, from, to, 'arrow-user');
    }
  }

  /** Toggles a right-clicked (not dragged) annotation highlight on a square -
   *  right-clicking an already-highlighted square clears it again. */
  toggleSquareHighlight(square) {
    if (this.#userHighlightSquares.has(square)) this.#userHighlightSquares.delete(square);
    else this.#userHighlightSquares.add(square);
    this.#redrawUserHighlights();
  }

  clearSquareHighlights() {
    if (this.#userHighlightSquares.size === 0) return;
    this.#userHighlightSquares.clear();
    this.#redrawUserHighlights();
  }

  #redrawUserHighlights() {
    for (const el of this.#boardEl.querySelectorAll('.user-highlight-red')) {
      el.classList.remove('user-highlight-red');
    }
    for (const square of this.#userHighlightSquares) {
      this.#squareEl(square)?.classList.add('user-highlight-red');
    }
  }

  /** Builds and appends one arrow <path> (shared by the best-move arrow and
   *  user-drawn annotation arrows - only the target layer/CSS class differ). */
  #appendArrow(layer, from, to, className) {
    const a = this.#squareCenter(from);
    const b = this.#squareCenter(to);
    if (!a || !b) return;
    const size = this.#squareEl(from)?.getBoundingClientRect().width || 1;

    const fileDelta = Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0]));
    const rankDelta = Math.abs(Number(from[1]) - Number(to[1]));
    const isKnightMove = (fileDelta === 1 && rankDelta === 2) || (fileDelta === 2 && rankDelta === 1);

    const shaftHalfWidth = Math.max(2, size * ARROW_SHAFT_HALF_WIDTH_FRACTION);
    const headHalfWidth = Math.max(4, size * ARROW_HEAD_HALF_WIDTH_FRACTION);
    const headLength = Math.max(6, size * ARROW_HEAD_LENGTH_FRACTION);

    const arrowStart = isKnightMove
      ? (rankDelta === 2 ? { x: a.x, y: a.y + size * 0.35 * (b.y > a.y ? 1 : -1) } : { x: a.x + size * 0.35 * (b.x > a.x ? 1 : -1), y: a.y })
      : pullBackTowards(b, a, size * ARROW_START_PULLBACK_FRACTION);
    const bend = isKnightMove ? (rankDelta === 2 ? { x: arrowStart.x, y: b.y } : { x: b.x, y: arrowStart.y }) : null;
    const finalLegStart = bend ?? arrowStart;
    const tip = pullBackTowards(finalLegStart, b, size * ARROW_TIP_PULLBACK_FRACTION);
    const headBase = pullBackTowards(finalLegStart, tip, headLength);
    // The shaft reaches into the middle of the head (not just its base), so
    // there's no shared edge between the two shapes for antialiasing to show
    // as a seam, even though the combined fill makes that invisible anyway.
    const shaftEnd = { x: (headBase.x + tip.x) / 2, y: (headBase.y + tip.y) / 2 };

    const subpaths = [];
    if (bend) {
      // Each leg is pushed `shaftHalfWidth` past the bend, into the other
      // leg's territory, so their union fully covers the shaftHalfWidth-sized
      // corner square from both directions. Without this, the two rectangles
      // only share that square diagonally, leaving a notched "double corner"
      // on the inside of the bend instead of one clean square joint.
      const leg1End = extendPast(arrowStart, bend, shaftHalfWidth);
      const leg2Start = extendPast(shaftEnd, bend, shaftHalfWidth);
      subpaths.push(rectPath(arrowStart, leg1End, shaftHalfWidth));
      subpaths.push(rectPath(leg2Start, shaftEnd, shaftHalfWidth));
    } else {
      subpaths.push(rectPath(arrowStart, shaftEnd, shaftHalfWidth));
    }
    subpaths.push(trianglePath(headBase, tip, headHalfWidth));

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', subpaths.join(' '));
    path.setAttribute('class', className);
    path.setAttribute('fill-rule', 'nonzero');
    layer.appendChild(path);
  }

  /** Square center, in px relative to the arrow layer's own positioning
   *  parent (#board-wrap) - read directly from the real rendered square
   *  element rather than computed from an assumed size/orientation, so it's
   *  exact regardless of chessboard.js's own internal rounding. */
  #squareCenter(square) {
    const el = this.#squareEl(square);
    if (!el) return null;
    const wrapRect = this.#arrowLayer.parentElement.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return { x: rect.left - wrapRect.left + rect.width / 2, y: rect.top - wrapRect.top + rect.height / 2 };
  }

  #reapplyOverlays() {
    // Selection state (not "sticky" data to redraw, unlike the others below)
    // just gets dropped on a resize - the squares it pointed at are about to
    // be recreated anyway.
    this.clearMoveHighlights();
    if (this.#lastBadge?.category) this.showBadge(this.#lastBadge.square, this.#lastBadge.category);
    else if (this.#lastBadge) this.showLoadingBadge(this.#lastBadge.square);
    if (this.#lastMoveSquares) this.showLastMoveHighlight(this.#lastMoveSquares.from, this.#lastMoveSquares.to);
    if (this.#lastTerminationMarkers) this.showTerminationBadges(this.#lastTerminationMarkers);
    if (this.#lastArrow) this.showArrow(this.#lastArrow.from, this.#lastArrow.to);
    this.#redrawUserHighlights();
    this.#redrawUserArrows();
  }

  resize() {
    this.#board.resize();
    this.#reapplyOverlays();
  }

  /** Flips the board orientation and re-renders any overlays at their new spot. */
  flip() {
    this.#orientation = this.#board.flip();
    this.#reapplyOverlays();
  }

  /**
   * Sets the orientation directly (rather than toggling), e.g. to default to
   * the searched player's own side at the bottom.
   * @param {'white'|'black'} color
   */
  setOrientation(color) {
    this.#orientation = this.#board.orientation(color);
    this.#reapplyOverlays();
  }

  /** @returns {'white'|'black'} which color is currently shown at the bottom */
  getOrientation() {
    return this.#orientation;
  }
}

function pullBackTowards(from, to, distance) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: to.x - (dx / len) * distance, y: to.y - (dy / len) * distance };
}

/** Continues past `to` (in the from->to direction) by `distance`. */
function extendPast(from, to, distance) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: to.x + (dx / len) * distance, y: to.y + (dy / len) * distance };
}

/** SVG subpath for a rectangle of the given half-width, centered on the from->to line. */
function rectPath(from, to, halfWidth) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * halfWidth;
  const py = (dx / len) * halfWidth;
  return (
    `M ${from.x + px} ${from.y + py}` +
    ` L ${to.x + px} ${to.y + py}` +
    ` L ${to.x - px} ${to.y - py}` +
    ` L ${from.x - px} ${from.y - py} Z`
  );
}

/** SVG subpath for an isosceles triangle: base centered on `base`, pointing at `tip`. */
function trianglePath(base, tip, halfWidth) {
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * halfWidth;
  const py = (dx / len) * halfWidth;
  return `M ${base.x + px} ${base.y + py} L ${tip.x} ${tip.y} L ${base.x - px} ${base.y - py} Z`;
}
