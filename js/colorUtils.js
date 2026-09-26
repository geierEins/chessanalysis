// Small color-space helper, currently used only to derive a board-annotation
// highlight color that's guaranteed to contrast with whichever board theme
// (js/main.js's board-theme picker) is active, instead of a fixed color that
// might barely show up against some themes.

/** @param {string} hex - e.g. "#4B7399" @returns {number} hue in [0, 360) */
function hueOf(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0; // achromatic (gray) - no defined hue, falls back below

  let h;
  switch (max) {
    case r: h = ((g - b) / d) % 6; break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const VIVID_SATURATION = 85;
const VIVID_LIGHTNESS = 55;

/**
 * A color guaranteed to contrast with the given board-theme color: its
 * complementary hue (180° around the color wheel, plus an optional further
 * offset - e.g. to derive a second contrasting color that's still
 * distinguishable from the first), at a fixed, vivid saturation/lightness
 * rather than the source's own (which might be muted or dark) - so it reads
 * clearly no matter how subdued the active theme is. Used as-is for the
 * best-move arrow, which wants exactly this boldness - see
 * mutedComplementaryHighlight() below for the softer variant the last-move
 * square highlight uses instead.
 * @param {string} hex - e.g. "#4B7399"
 * @param {number} [extraHueOffset] - degrees added past the 180° complement
 * @returns {string} e.g. "hsl(30.0 85% 55%)"
 */
export function complementaryHighlight(hex, extraHueOffset = 0) {
  const complementaryHue = (hueOf(hex) + 180 + extraHueOffset) % 360;
  return `hsl(${complementaryHue.toFixed(1)} ${VIVID_SATURATION}% ${VIVID_LIGHTNESS}%)`;
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** @param {number} h [0,360) @param {number} s [0,100] @param {number} l [0,100] */
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

function mixRgb(a, b, weightA) {
  return {
    r: a.r * weightA + b.r * (1 - weightA),
    g: a.g * weightA + b.g * (1 - weightA),
    b: a.b * weightA + b.b * (1 - weightA),
  };
}

/** Blends an rgb color toward its own grayscale value - a cheap desaturation
 *  that doesn't shift the hue. */
function desaturate(rgb, amount) {
  const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return mixRgb(rgb, { r: luma, g: luma, b: luma }, 1 - amount);
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * A softer counterpart to complementaryHighlight(), for the last-move square
 * veil (.lastmove-highlight) - the same vivid contrasting color read as too
 * loud/saturated painted across a whole square (unlike the thin arrow, which
 * it still suits fine). Built by mixing the theme's own light+dark square
 * colors together, then blending that 2:1 with the vivid complementary color
 * (so it leans toward the board's own palette rather than an unrelated bold
 * hue), then desaturating the result a bit further.
 * @param {string} light - e.g. "#EAE9D2"
 * @param {string} dark - e.g. "#4B7399"
 * @param {number} [extraHueOffset] - same meaning as complementaryHighlight's
 * @returns {string} e.g. "#7a8a6f"
 */
export function mutedComplementaryHighlight(light, dark, extraHueOffset = 0) {
  const complementaryHue = (hueOf(dark) + 180 + extraHueOffset) % 360;
  const vivid = hslToRgb(complementaryHue, VIVID_SATURATION, VIVID_LIGHTNESS);
  const boardMix = mixRgb(hexToRgb(light), hexToRgb(dark), 0.5);
  const blended = mixRgb(boardMix, vivid, 2 / 3);
  return rgbToHex(desaturate(blended, 0.18));
}
