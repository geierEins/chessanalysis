// Piece theme picker: a small dropdown next to the board-color picker, for
// switching the piece sprite set. Self-contained (own DOM refs, own
// listeners, own persistence) - main.js just calls initPieceThemePicker(board)
// once at startup, passing the BoardView instance it applies to (js/ui/board.js's
// setPieceTheme).

import { loadPieceTheme, savePieceTheme } from '../persistence.js';

// chess.com's own CDN wants the piece code fully lowercase ("wn" rather than
// "wN" - chessboard.js's own convention every other theme here matches), so
// this entry uses a urlTemplate FUNCTION instead of the plain {piece} string
// template the rest use - both forms are passed straight through to
// chessboard.js's own config.pieceTheme, which already supports either.
// ("The Woods" was tried here too, twice ("wood" then "neo_wood") - neither
// folder matched what chess.com's own UI actually shows for that name, so it
// was dropped again rather than keep guessing at more folder names.)
function chessComPieceUrl(set) {
  return (piece) => `https://images.chesscomfiles.com/chess-themes/pieces/${set}/150/${piece.toLowerCase()}.png`;
}

// neo is chess.com's own; wikipedia/alpha is chessboardjs.com's own hosted
// set; the rest are lichess's (SVG, hosted on lichess1.org) - all picked for
// being visually distinct enough to be worth the extra choice (cburnett,
// lichess's default set, was tried here first but dropped again: too similar
// to wikipedia; uscf and california were dropped again too, at the user's
// request). Neo listed first and set as the default (js/persistence.js's
// loadPieceTheme still overrules this the moment the user has ever picked
// something else).
export const PIECE_THEMES = {
  neo: { label: 'Neo', urlTemplate: chessComPieceUrl('neo') },
  wikipedia: { label: 'Wikipedia', urlTemplate: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png' },
  alpha: { label: 'Alpha', urlTemplate: 'https://chessboardjs.com/img/chesspieces/alpha/{piece}.png' },
  fantasy: { label: 'Fantasy', urlTemplate: 'https://lichess1.org/assets/piece/fantasy/{piece}.svg' },
  chessnut: { label: 'Chessnut', urlTemplate: 'https://lichess1.org/assets/piece/chessnut/{piece}.svg' },
  celtic: { label: 'Celtic', urlTemplate: 'https://lichess1.org/assets/piece/celtic/{piece}.svg' },
  pixel: { label: 'Pixel', urlTemplate: 'https://lichess1.org/assets/piece/pixel/{piece}.svg' },
};
const DEFAULT_PIECE_THEME_KEY = 'neo';

/** A white knight from the given theme - used as that theme's own icon
 *  (in the collapsed button and in its menu row), so the choice shows a real
 *  sample of the art style itself rather than an abstract stand-in glyph. */
function iconUrl(theme) {
  return typeof theme.urlTemplate === 'function'
    ? theme.urlTemplate('wN')
    : theme.urlTemplate.replace('{piece}', 'wN');
}

/** @param {import('./board.js').BoardView} board */
export function initPieceThemePicker(board) {
  const pieceThemePicker = document.getElementById('piece-theme-picker');
  const pieceThemeBtn = document.getElementById('piece-theme-btn');
  const pieceThemeMenu = document.getElementById('piece-theme-menu');
  const pieceThemeBtnIcon = document.getElementById('piece-theme-btn-icon');
  const itemsByKey = new Map();
  // Highlights whichever row matches the active theme, so reopening the
  // menu shows at a glance what's already picked (reuses js/ui/
  // customSelect.js's own .custom-select-option-selected class/look).
  let selectedOption = null;

  function setPieceTheme(key) {
    const theme = PIECE_THEMES[key] ?? PIECE_THEMES[DEFAULT_PIECE_THEME_KEY];
    board.setPieceTheme(theme.urlTemplate);
    pieceThemeBtnIcon.src = iconUrl(theme);
    selectedOption?.classList.remove('custom-select-option-selected');
    selectedOption = itemsByKey.get(key) ?? null;
    selectedOption?.classList.add('custom-select-option-selected');
  }

  for (const [key, theme] of Object.entries(PIECE_THEMES)) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'piece-theme-option';
    option.innerHTML = `<img src="${iconUrl(theme)}" alt="" class="piece-theme-option-icon">${theme.label}`;
    option.addEventListener('click', () => {
      setPieceTheme(key);
      savePieceTheme(key);
      pieceThemeMenu.classList.add('hidden');
    });
    pieceThemeMenu.appendChild(option);
    itemsByKey.set(key, option);
  }

  setPieceTheme(loadPieceTheme() ?? DEFAULT_PIECE_THEME_KEY);

  pieceThemeBtn.addEventListener('click', () => {
    if (pieceThemeMenu.classList.contains('hidden')) {
      // position: fixed (computed here, not CSS `absolute`) - same reasoning
      // as js/ui/boardThemePicker.js's own menu.
      const rect = pieceThemeBtn.getBoundingClientRect();
      pieceThemeMenu.style.position = 'fixed';
      pieceThemeMenu.style.top = `${rect.bottom + 4}px`;
      pieceThemeMenu.style.right = `${window.innerWidth - rect.right}px`;
      pieceThemeMenu.classList.remove('hidden');
      selectedOption?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    } else {
      pieceThemeMenu.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!pieceThemePicker.contains(e.target)) pieceThemeMenu.classList.add('hidden');
  });
}
