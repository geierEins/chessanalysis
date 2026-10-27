// The site-wide color scheme (gear menu "Themes"). A theme is just
// html[data-site-theme] - css/styles.css re-points the neutral ramp, the
// accent and the fonts for it, and Tailwind's classes follow through
// tailwind.config in index.html. The inline script there applies the saved
// theme before first paint; this keeps it in sync afterwards.

import { loadSiteTheme, saveSiteTheme } from '../persistence.js';

// themeColor: the browser/PWA chrome color (<meta name="theme-color">) - each theme's --n-900.
export const SITE_THEMES = [
  { id: 'standard', label: 'Standard', title: 'Standard: schlichtes Dunkelgrau mit blauem Akzent', themeColor: '#171717' },
  { id: 'cyberpunk', label: 'Cyberpunk', title: 'Cyberpunk: 8-Bit-Neon in Violett, Cyan und Magenta', themeColor: '#14082a' },
  { id: 'nordlicht', label: 'Nordlicht', title: 'Nordlicht: kühles Schiefergrau mit Polarlicht-Schimmer', themeColor: '#181f2d' },
];

const byId = (id) => SITE_THEMES.find((t) => t.id === id) ?? SITE_THEMES[0];

/** @returns {string} the saved theme's id, 'standard' if none (or an unknown one) is saved */
export function currentSiteTheme() {
  return byId(loadSiteTheme()).id;
}

/** Switches the page to the theme and remembers it. */
export function setSiteTheme(id) {
  const theme = byId(id);
  if (theme.id === 'standard') delete document.documentElement.dataset.siteTheme;
  else document.documentElement.dataset.siteTheme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor);
  saveSiteTheme(theme.id);
}
