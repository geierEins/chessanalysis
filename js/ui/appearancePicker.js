// The appearance dropdown in the top bar (#appearance-btn, palette icon):
// board colors, piece set and the site theme in one place. The board and
// piece sections fill themselves (js/ui/boardThemePicker.js,
// js/ui/pieceThemePicker.js); this opens/closes the menu and holds the theme
// list. The Meta-Analyse has no board, so it shows just the theme section.

import { SITE_THEMES, currentSiteTheme, setSiteTheme } from './siteTheme.js';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

/** @returns {{setMetaMode: (isMeta: boolean) => void}} */
export function initAppearancePicker() {
  const picker = document.getElementById('appearance-picker');
  const btn = document.getElementById('appearance-btn');
  const menu = document.getElementById('appearance-menu');
  const boardSection = document.getElementById('appearance-board-section');
  const pieceSection = document.getElementById('appearance-piece-section');
  const themeList = document.getElementById('site-theme-options');

  const isOpen = () => !menu.classList.contains('hidden');

  // position: fixed (not CSS `absolute`) so #filter-row's horizontal-scroll
  // container doesn't clip it - see CustomSelect#openMenu in js/ui/customSelect.js.
  // Right-aligned under the button, clamped into the viewport.
  function position() {
    const rect = btn.getBoundingClientRect();
    let left = rect.right - menu.offsetWidth;
    left = Math.min(left, window.innerWidth - menu.offsetWidth - VIEWPORT_MARGIN);
    menu.style.left = `${Math.max(left, VIEWPORT_MARGIN)}px`;
    menu.style.top = `${rect.bottom + ANCHOR_GAP}px`;
  }

  function open() {
    menu.style.position = 'fixed';
    menu.classList.remove('hidden');
    position(); // after un-hiding - offsetWidth is 0 while display:none
    btn.setAttribute('aria-expanded', 'true');
  }

  function close({ restoreFocus = false } = {}) {
    if (!isOpen()) return;
    menu.classList.add('hidden');
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

  // Themes: one row each, with its gradient swatch.
  let siteTheme = currentSiteTheme();
  setSiteTheme(siteTheme); // the <head> script set the attribute, this also the theme-color
  themeList.innerHTML = SITE_THEMES.map(
    (t) => `<button type="button" role="radio" class="site-theme-option" data-site-theme="${t.id}" title="${t.title}">`
      + `<span class="site-theme-swatch" style="background:${t.swatch};border-color:${t.ring}"></span>${t.label}</button>`
  ).join('');
  const themeButtons = [...themeList.querySelectorAll('[data-site-theme]')];

  function renderTheme() {
    for (const b of themeButtons) {
      const active = b.dataset.siteTheme === siteTheme;
      b.classList.toggle('custom-select-option-selected', active);
      b.setAttribute('aria-checked', String(active));
    }
  }

  for (const b of themeButtons) {
    b.addEventListener('click', () => {
      if (b.dataset.siteTheme === siteTheme) return;
      siteTheme = b.dataset.siteTheme;
      setSiteTheme(siteTheme);
      renderTheme();
      position(); // the theme's fonts can change the menu's width
    });
  }
  renderTheme();

  return {
    setMetaMode(isMeta) {
      boardSection.classList.toggle('hidden', isMeta);
      pieceSection.classList.toggle('hidden', isMeta);
      if (isOpen()) position();
    },
  };
}
