// Colors/icons for Chess.com's time classes, used to mark game types in
// dropdowns (native <select>/<option> can't embed real SVG icons, so a
// Unicode glyph is used as the closest reliable stand-in).
export const TIME_CLASS_STYLE = {
  daily: { color: '#f2c94c', emoji: '☀️' },
  rapid: { color: '#4ade80', emoji: '🕐' },
  blitz: { color: '#60a5fa', emoji: '⚡' },
  bullet: { color: '#f87171', emoji: '🚀' },
};

export function timeClassStyle(timeClass) {
  return TIME_CLASS_STYLE[timeClass] ?? { color: '#a3a3a3', emoji: '' };
}
