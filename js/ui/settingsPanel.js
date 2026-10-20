// The small gear button at the end of the top bar (#settings-btn) and its
// floating options popover (#settings-menu) - a home for small standing
// preferences that don't deserve their own top-bar control. Behaves like a
// regular GUI popover: anchored to the gear, flips above it / shifts left
// whenever it wouldn't fit the viewport, follows window resizes, and closes
// on an outside click or Escape (returning focus to the gear).

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

const SOUND_TITLE_ON = 'Brettgeräusche an - klicken zum Ausschalten';
const SOUND_TITLE_OFF = 'Brettgeräusche aus - klicken zum Einschalten';

/**
 * @param {{
 *   soundEnabled: boolean,
 *   bestMoveTiming: 'before'|'after'|'off',
 *   onSoundChange: (enabled: boolean) => void,
 *   onBestMoveTimingChange: (timing: 'before'|'after'|'off') => void,
 *   appMode: 'game'|'meta',
 *   onAppModeChange: (mode: 'game'|'meta') => boolean,
 * }} options onAppModeChange returns false to refuse the switch (e.g. while an analysis runs)
 * @returns {{setAppMode: (mode: 'game'|'meta') => void}} for switches made elsewhere (e.g. opening a game from the Meta-Analyse)
 */
export function initSettingsPanel({ soundEnabled, bestMoveTiming, onSoundChange, onBestMoveTimingChange, appMode, onAppModeChange }) {
  const picker = document.getElementById('settings-picker');
  const btn = document.getElementById('settings-btn');
  const menu = document.getElementById('settings-menu');
  const soundToggle = document.getElementById('settings-sound-toggle');
  const timingButtons = [...menu.querySelectorAll('[data-best-move-timing]')];
  const modeButtons = [...menu.querySelectorAll('[data-app-mode]')];

  const isOpen = () => !menu.classList.contains('hidden');

  // Prefers right-aligned under the gear (it sits at the row's far end), but
  // clamps into the viewport horizontally and opens upwards instead if
  // there's no room below.
  function position() {
    const rect = btn.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    let left = rect.right - menuWidth;
    left = Math.min(left, window.innerWidth - menuWidth - VIEWPORT_MARGIN);
    left = Math.max(left, VIEWPORT_MARGIN);

    let top = rect.bottom + ANCHOR_GAP;
    if (top + menuHeight > window.innerHeight - VIEWPORT_MARGIN && rect.top - ANCHOR_GAP - menuHeight >= VIEWPORT_MARGIN) {
      top = rect.top - ANCHOR_GAP - menuHeight;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function open() {
    menu.style.position = 'fixed';
    menu.classList.remove('hidden');
    position(); // after un-hiding - offsetWidth/Height are 0 while display:none
    btn.classList.add('menu-open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function close({ restoreFocus = false } = {}) {
    if (!isOpen()) return;
    menu.classList.add('hidden');
    btn.classList.remove('menu-open');
    btn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) btn.focus();
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close({ restoreFocus: true });
  });
  window.addEventListener('resize', () => {
    if (isOpen()) position();
  });

  function renderSound() {
    soundToggle.classList.toggle('is-off', !soundEnabled);
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.title = soundEnabled ? SOUND_TITLE_ON : SOUND_TITLE_OFF;
    soundToggle.setAttribute('aria-label', soundToggle.title);
  }

  function renderTiming() {
    for (const b of timingButtons) {
      const active = b.dataset.bestMoveTiming === bestMoveTiming;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    }
  }

  soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    renderSound();
    onSoundChange(soundEnabled);
  });

  for (const b of timingButtons) {
    b.addEventListener('click', () => {
      if (b.dataset.bestMoveTiming === bestMoveTiming) return;
      bestMoveTiming = b.dataset.bestMoveTiming;
      renderTiming();
      onBestMoveTimingChange(bestMoveTiming);
    });
  }

  function renderMode() {
    for (const b of modeButtons) {
      const active = b.dataset.appMode === appMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    }
  }

  for (const b of modeButtons) {
    b.addEventListener('click', () => {
      if (b.dataset.appMode === appMode) return;
      if (onAppModeChange(b.dataset.appMode) === false) return;
      appMode = b.dataset.appMode;
      renderMode();
      close();
    });
  }

  renderSound();
  renderTiming();
  renderMode();

  return {
    setAppMode(mode) {
      appMode = mode;
      renderMode();
    },
  };
}
