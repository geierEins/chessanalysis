// A small button+menu dropdown standing in for a native <select> wherever per-
// option text color matters (the game-type filter, the loaded-games picker).
// macOS Firefox and Chrome both render an open <select>'s option list via the
// native AppKit popup menu, which ignores CSS entirely (color, background,
// everything) - so colored options (time-class colors, win/loss tint) simply
// don't show there, even though the exact same markup works fine on Windows.
// A fully custom, page-rendered dropdown is the only reliable fix.
export class CustomSelect {
  #btn;
  #btnLabel;
  #menu;
  #onChange;
  #options = [];
  #value = null;

  /**
   * @param {{buttonId: string, labelId: string, menuId: string, onChange?: (value: string) => void}} ids
   */
  constructor({ buttonId, labelId, menuId, onChange }) {
    this.#btn = document.getElementById(buttonId);
    this.#btnLabel = document.getElementById(labelId);
    this.#menu = document.getElementById(menuId);
    this.#onChange = onChange;

    this.#btn.addEventListener('click', () => {
      if (this.#btn.disabled) return;
      if (this.#menu.classList.contains('hidden')) this.#openMenu();
      else this.#menu.classList.add('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!this.#btn.contains(e.target) && !this.#menu.contains(e.target)) {
        this.#menu.classList.add('hidden');
      }
    });
  }

  /** Positions the menu with `position: fixed`, computed from the button's
   *  current on-screen position, rather than relying on CSS `absolute`
   *  positioning within a `relative` ancestor. Needed because the filter bar
   *  (#filter-row) is a horizontal-scroll container (so it can never wrap to
   *  a second line - see css/styles.css) - an `overflow`-scrolling ancestor
   *  clips `absolute` descendants whose containing block is inside it, which
   *  would otherwise cut the open menu off well before it could show its
   *  last few options. `fixed` positioning escapes that entirely. */
  #openMenu() {
    const rect = this.#btn.getBoundingClientRect();
    this.#menu.style.position = 'fixed';
    this.#menu.style.top = `${rect.bottom + 4}px`;
    this.#menu.style.left = `${rect.left}px`;
    this.#menu.style.minWidth = `${rect.width}px`;
    this.#menu.classList.remove('hidden');
  }

  /**
   * Replaces the option list and selects `selectedValue` (or the first
   * option if omitted/not found).
   * @param {Array<{value: string, label: string, shortLabel?: string, icon?: string, color?: string}>} options
   *   shortLabel, if given, is shown on the collapsed button instead of
   *   label - so the button doesn't have to grow to fit text that's only
   *   useful once the menu is already open (e.g. the game picker drops the
   *   move count AND the searched user's own name/elo - js/main.js's
   *   opponentLabel). icon, if given (a small
   *   HTML snippet - trusted, always a hardcoded caller string, never user
   *   input), takes over both roles instead: shown alone on the collapsed
   *   button, and alongside label (in its own fixed-width column, so labels
   *   across options line up) in the open menu - see js/main.js's time-range
   *   filter for the pie-icon example this was built for. The open menu's
   *   own items always show the full label either way.
   * @param {string} [selectedValue]
   */
  setOptions(options, selectedValue) {
    this.#options = options;
    this.#menu.innerHTML = '';
    for (const opt of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-select-option';
      if (opt.icon) {
        item.innerHTML = `<span class="custom-select-option-icon">${opt.icon}</span><span>${opt.label}</span>`;
      } else {
        item.textContent = opt.label;
      }
      if (opt.color) item.style.color = opt.color;
      item.addEventListener('click', () => this.select(opt.value));
      this.#menu.appendChild(item);
    }
    const initial = options.find((o) => o.value === selectedValue) ?? options[0];
    this.#applySelection(initial);
  }

  /** Selects a value programmatically or via an option click - fires onChange. */
  select(value) {
    const opt = this.#options.find((o) => o.value === value);
    if (!opt) return;
    this.#applySelection(opt);
    this.#menu.classList.add('hidden');
    this.#onChange?.(value);
  }

  #applySelection(opt) {
    this.#value = opt?.value ?? null;
    if (opt?.icon) {
      this.#btnLabel.innerHTML = opt.icon;
    } else {
      this.#btnLabel.textContent = (opt?.shortLabel ?? opt?.label) ?? '';
    }
    this.#btnLabel.style.color = opt?.color ?? '';
  }

  get value() {
    return this.#value;
  }

  set disabled(isDisabled) {
    this.#btn.disabled = isDisabled;
    this.#btn.classList.toggle('opacity-50', isDisabled);
    this.#btn.classList.toggle('cursor-not-allowed', isDisabled);
    if (isDisabled) this.#menu.classList.add('hidden');
  }
}
