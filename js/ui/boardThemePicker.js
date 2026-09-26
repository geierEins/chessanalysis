// Board theme picker: native <select> can't show two colors per entry, so
// this is a small custom dropdown instead. Self-contained (own DOM refs,
// own listeners, own persistence) - main.js just calls initBoardThemePicker()
// once at startup.

import { complementaryHighlight, mutedComplementaryHighlight } from '../colorUtils.js';
import { loadBoardTheme, saveBoardTheme } from '../persistence.js';

export function initBoardThemePicker() {
  const boardThemePicker = document.getElementById('board-theme-picker');
  const boardThemeBtn = document.getElementById('board-theme-btn');
  const boardThemeMenu = document.getElementById('board-theme-menu');
  const boardThemeBtnSwatch = document.getElementById('board-theme-btn-swatch');

  function setBoardTheme(light, dark, isWood = false) {
    document.documentElement.style.setProperty('--board-light', light);
    document.documentElement.style.setProperty('--board-dark', dark);
    // "Holzmaserung" option only - self-generated SVG turbulence textures
    // (--wood-grain-image-light/-dark, defined in css/styles.css) layered
    // over both squares' own flat colors instead of a plain fill - light
    // squares got left flat at first, which just looked wrong/inconsistent
    // next to a textured dark square.
    document.documentElement.style.setProperty(
      '--board-light-image',
      isWood ? 'var(--wood-grain-image-light)' : 'none'
    );
    document.documentElement.style.setProperty(
      '--board-dark-image',
      isWood ? 'var(--wood-grain-image-dark)' : 'none'
    );
    // Derived (not picked per-theme) so the last-move highlight and the best-
    // move arrow always contrast with whichever board theme is active, instead
    // of a fixed color that might barely show up against some of them - and
    // since js/ui/board.js applies these via a CSS class (fill: var(--...))
    // rather than baking a literal color into each drawn <path>, every
    // already-drawn arrow re-colors itself instantly the moment this changes
    // here, with no redraw needed. The right-click annotation arrow's color
    // (--user-arrow-color) is intentionally NOT touched here - it stays the
    // fixed red declared in :root on every theme, matching its square-
    // highlight counterpart (.user-highlight-red).
    //
    // The arrow keeps the full vivid complementary color - a thin line can
    // take that boldness. Painted across an entire square, the same color
    // read as too loud, so the last-move highlight gets the softer, board-
    // toned variant instead (see mutedComplementaryHighlight's own comment).
    document.documentElement.style.setProperty('--lastmove-color', mutedComplementaryHighlight(light, dark));
    document.documentElement.style.setProperty('--best-move-arrow-color', complementaryHighlight(dark));
    // Single swatch, split into 4 alternating quadrants (a mini 2x2
    // checkerboard) rather than two separate light/dark squares.
    boardThemeBtnSwatch.style.background =
      `conic-gradient(${light} 90deg, ${dark} 90deg 180deg, ${light} 180deg 270deg, ${dark} 270deg)`;
  }

  // Highlights whichever swatch button matches the active theme, so
  // reopening the menu shows at a glance what's already picked (reuses
  // js/ui/customSelect.js's own .custom-select-option-selected class/look).
  let selectedOption = null;
  function markSelected(option) {
    selectedOption?.classList.remove('custom-select-option-selected');
    selectedOption = option ?? null;
    selectedOption?.classList.add('custom-select-option-selected');
  }

  const storedTheme = loadBoardTheme();
  const initialLight =
    storedTheme?.light ?? getComputedStyle(document.documentElement).getPropertyValue('--board-light').trim();
  const initialDark =
    storedTheme?.dark ?? getComputedStyle(document.documentElement).getPropertyValue('--board-dark').trim();
  const initialIsWood = storedTheme?.isWood ?? false;
  setBoardTheme(initialLight, initialDark, initialIsWood);
  markSelected(
    [...document.querySelectorAll('.board-theme-option')].find(
      (o) =>
        o.dataset.light === initialLight &&
        o.dataset.dark === initialDark &&
        (o.dataset.wood === 'true') === initialIsWood
    )
  );

  boardThemeBtn.addEventListener('click', () => {
    if (boardThemeMenu.classList.contains('hidden')) {
      // position: fixed (computed here, not CSS `absolute`) so the menu isn't
      // clipped by #filter-row's horizontal-scroll container - see the same
      // comment on CustomSelect#openMenu in js/ui/customSelect.js.
      const rect = boardThemeBtn.getBoundingClientRect();
      boardThemeMenu.style.position = 'fixed';
      boardThemeMenu.style.top = `${rect.bottom + 4}px`;
      boardThemeMenu.style.right = `${window.innerWidth - rect.right}px`;
      boardThemeMenu.classList.remove('hidden');
      selectedOption?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    } else {
      boardThemeMenu.classList.add('hidden');
    }
  });

  for (const option of document.querySelectorAll('.board-theme-option')) {
    option.addEventListener('click', () => {
      const isWood = option.dataset.wood === 'true';
      setBoardTheme(option.dataset.light, option.dataset.dark, isWood);
      saveBoardTheme(option.dataset.light, option.dataset.dark, isWood);
      markSelected(option);
      boardThemeMenu.classList.add('hidden');
    });
  }

  document.addEventListener('click', (e) => {
    if (!boardThemePicker.contains(e.target)) boardThemeMenu.classList.add('hidden');
  });
}
