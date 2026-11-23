// The game mode's board options, right in the top bar (#settings-picker):
// a sound toggle, the best-move arrow's timing as a small dropdown
// (#best-move-btn/#best-move-menu) and an "upcoming moves" eye toggle.
// The dropdown behaves like the bar's other menus: anchored under its
// button, closes on an outside click or Escape (returning focus to it).

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

const SOUND_TITLE_ON = 'Brettgeräusche an - klicken zum Ausschalten';
const SOUND_TITLE_OFF = 'Brettgeräusche aus - klicken zum Einschalten';
const FUTURE_TITLE_SHOWN = 'Kommende Züge werden gezeigt - klicken zum Verbergen (Zugliste und Ergebnis enden beim aktuellen Zug)';
const FUTURE_TITLE_HIDDEN = 'Kommende Züge sind verborgen - klicken zum Zeigen';
const TIMING_LABEL = { before: 'Vorher', after: 'Nachher', off: 'Aus' };

/**
 * @param {{
 *   soundEnabled: boolean,
 *   bestMoveTiming: 'before'|'after'|'off',
 *   onSoundChange: (enabled: boolean) => void,
 *   onBestMoveTimingChange: (timing: 'before'|'after'|'off') => void,
 *   hideFutureMoves: boolean,
 *   onHideFutureMovesChange: (hide: boolean) => void,
 * }} options
 */
export function initSettingsPanel({ soundEnabled, bestMoveTiming, onSoundChange, onBestMoveTimingChange, hideFutureMoves, onHideFutureMovesChange }) {
  const soundToggle = document.getElementById('settings-sound-toggle');
  const futureToggle = document.getElementById('future-moves-toggle');
  const timingPicker = document.getElementById('best-move-picker');
  const timingBtn = document.getElementById('best-move-btn');
  const timingLabel = document.getElementById('best-move-btn-label');
  const timingMenu = document.getElementById('best-move-menu');
  const timingOptions = [...timingMenu.querySelectorAll('[data-best-move-timing]')];

  const isOpen = () => !timingMenu.classList.contains('hidden');

  // Left-aligned under its button, clamped into the viewport, flipped above
  // it if there's no room below.
  function position() {
    const rect = timingBtn.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = timingMenu;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - w - VIEWPORT_MARGIN));
    let top = rect.bottom + ANCHOR_GAP;
    if (top + h > window.innerHeight - VIEWPORT_MARGIN && rect.top - ANCHOR_GAP - h >= VIEWPORT_MARGIN) top = rect.top - ANCHOR_GAP - h;
    timingMenu.style.left = `${left}px`;
    timingMenu.style.top = `${top}px`;
  }

  function open() {
    timingMenu.style.position = 'fixed';
    timingMenu.classList.remove('hidden');
    position(); // after un-hiding - offsetWidth/Height are 0 while display:none
    timingBtn.classList.add('menu-open');
    timingBtn.setAttribute('aria-expanded', 'true');
  }

  function close({ restoreFocus = false } = {}) {
    if (!isOpen()) return;
    timingMenu.classList.add('hidden');
    timingBtn.classList.remove('menu-open');
    timingBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) timingBtn.focus();
  }

  timingBtn.addEventListener('click', () => (isOpen() ? close() : open()));
  document.addEventListener('click', (e) => {
    if (!timingPicker.contains(e.target)) close();
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
    timingLabel.textContent = TIMING_LABEL[bestMoveTiming];
    timingBtn.classList.toggle('is-off', bestMoveTiming === 'off');
    timingBtn.title = `Bester Zug: ${TIMING_LABEL[bestMoveTiming]} - wann der Pfeil mit dem besten Engine-Zug angezeigt wird`;
    for (const b of timingOptions) {
      const active = b.dataset.bestMoveTiming === bestMoveTiming;
      b.classList.toggle('custom-select-option-selected', active);
      b.setAttribute('aria-checked', String(active));
    }
  }

  function renderFutureMoves() {
    futureToggle.classList.toggle('is-off', hideFutureMoves);
    futureToggle.setAttribute('aria-pressed', String(!hideFutureMoves));
    futureToggle.title = hideFutureMoves ? FUTURE_TITLE_HIDDEN : FUTURE_TITLE_SHOWN;
    futureToggle.setAttribute('aria-label', futureToggle.title);
  }

  soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    renderSound();
    onSoundChange(soundEnabled);
  });

  for (const b of timingOptions) {
    b.addEventListener('click', () => {
      close({ restoreFocus: true });
      if (b.dataset.bestMoveTiming === bestMoveTiming) return;
      bestMoveTiming = b.dataset.bestMoveTiming;
      renderTiming();
      onBestMoveTimingChange(bestMoveTiming);
    });
  }

  futureToggle.addEventListener('click', () => {
    hideFutureMoves = !hideFutureMoves;
    renderFutureMoves();
    onHideFutureMovesChange(hideFutureMoves);
  });

  renderSound();
  renderTiming();
  renderFutureMoves();
}
