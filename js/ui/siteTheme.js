// The site-wide color scheme (appearance dropdown "Theme", js/ui/appearancePicker.js). A theme is just
// html[data-site-theme] - css/styles.css re-points the neutral ramp, the
// accent and the fonts for it, and Tailwind's classes follow through
// tailwind.config in index.html. The inline script there applies the saved
// theme before first paint; this keeps it in sync afterwards.

import { loadSiteTheme, saveSiteTheme } from '../persistence.js';

// themeColor: the browser/PWA chrome color (<meta name="theme-color">) - each theme's --n-900;
// swatch/ring: the round gradient in front of its name in the appearance dropdown and its border.
export const SITE_THEMES = [
  { id: 'standard', label: 'Graphit', title: 'Graphit: schlichtes Dunkelgrau mit blauem Akzent', themeColor: '#171717', swatch: 'linear-gradient(135deg, #a3a3a3, #404040 55%, #171717)', ring: '#8a8a8a' },
  { id: 'nordlicht', label: 'Nordlicht', title: 'Nordlicht: kühles Schiefergrau mit Polarlicht-Schimmer', themeColor: '#181f2d', swatch: 'linear-gradient(135deg, #4c2a85, #2a3f6b 50%, #1a6b55)', ring: '#48d2aa' },
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
