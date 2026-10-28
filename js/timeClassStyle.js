// Colors/icons for Chess.com's time classes, used to mark game types in the
// filter, the game picker and the Meta-Analyse. icon: a one-color SVG drawn
// in currentColor, so it takes the time class's color wherever it's placed
// with `color: ...` (trusted, hardcoded markup - safe to put into innerHTML).

// viewBox: cropped to the drawn shape (plus the stroke), so every icon sits
// edge to edge in its box and side-by-side icons get equal gaps; the width
// follows from it (css .tc-icon sets only the height).
const svg = (body, viewBox) =>
  `<svg class="tc-icon" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

// A rocket flying up and to the right: body with a window, two fins, a flame.
const ROCKET = svg(`<g transform="rotate(45 12 12)" fill="currentColor">
  <path fill-rule="evenodd" d="M12 1.5c3.1 2.6 4.6 6.2 4.6 10.8v3.9H7.4v-3.9C7.4 7.7 8.9 4.1 12 1.5zM12 6.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 1 0 0-3.8z"/>
  <path d="M7.4 11.8 4.3 15v4.2l3.1-1.9zM16.6 11.8l3.1 3.2v4.2l-3.1-1.9z"/>
  <path d="M9.6 17.4h4.8L12 22.5z"/></g>`, '1.4 4.4 18.4 18.3');
// The lightning bolt of the emoji, just one color.
const BOLT = svg('<path fill="currentColor" d="M14.2 1.5 4.5 13.6h6.4l-1.4 8.9 10-12.6h-6.6z"/>', '4.4 1.4 15.4 21.2');
// A clock face with hands at about ten past twelve.
const CLOCK = svg(`<g fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9.2"/><path d="M12 6.8V12l3.6 2.2"/></g>`, '1.6 1.6 20.8 20.8');
// A sun: a disc with eight rays.
const SUN = svg(`<g fill="currentColor" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
  <circle cx="12" cy="12" r="4.4" stroke="none"/>
  <path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/></g>`, '0.7 0.7 22.6 22.6');

export const TIME_CLASS_STYLE = {
  daily: { color: '#f2c94c', icon: SUN },
  rapid: { color: '#4ade80', icon: CLOCK },
  blitz: { color: '#60a5fa', icon: BOLT },
  bullet: { color: '#f87171', icon: ROCKET },
};

export function timeClassStyle(timeClass) {
  return TIME_CLASS_STYLE[timeClass] ?? { color: '#a3a3a3', icon: '' };
}
