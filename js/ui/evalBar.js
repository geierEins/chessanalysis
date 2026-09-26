import { evalToWinPercent } from '../analysis/winProbability.js';

export class EvalBar {
  #whiteEl;
  #blackEl;
  #labelEl;

  constructor(whiteId, blackId, labelId) {
    this.#whiteEl = document.getElementById(whiteId);
    this.#blackEl = document.getElementById(blackId);
    this.#labelEl = document.getElementById(labelId);
  }

  /** @param {{cp?: number, mate?: number}} whitePerspectiveScore */
  update(whitePerspectiveScore) {
    // evalToWinPercent() deliberately never reaches a flat 100/0 on mate (it
    // matches Lichess's accuracy-model formula, which treats mate as merely
    // "very winning"). The bar, though, should visibly bottom/top out on any
    // forced mate - so it saturates fully here, without touching the shared
    // win% math other things (accuracy, eval graph) rely on.
    const winPercent = whitePerspectiveScore.mate !== undefined && whitePerspectiveScore.mate !== null
      ? (whitePerspectiveScore.mate > 0 ? 100 : 0)
      : evalToWinPercent(whitePerspectiveScore);
    this.#whiteEl.style.height = `${winPercent}%`;
    this.#blackEl.style.height = `${100 - winPercent}%`;

    // Anchored a fixed distance from whichever end of the bar belongs to the
    // side currently ahead (bottom/white, top/black), with matching text
    // contrast - not positioned relative to the black/white boundary itself,
    // which used to leave it unreadable (dark text landing on the black
    // portion, or straddling both) whenever one side was heavily/fully
    // ahead and its own region shrank toward the boundary. The leading
    // side's region is always >= 50% of the bar, so a small fixed margin
    // comfortably fits the label inside it no matter how extreme the eval.
    const whiteLeading = winPercent >= 50;
    this.#labelEl.style.top = whiteLeading ? '' : '4px';
    this.#labelEl.style.bottom = whiteLeading ? '4px' : '';
    this.#labelEl.style.color = whiteLeading ? '#171717' : '#f5f5f5';
    this.#labelEl.textContent = formatScore(whitePerspectiveScore);
  }
}

/** @param {{cp?: number, mate?: number}} score - White's perspective */
export function formatScore(score) {
  if (score.mate !== undefined) {
    return `M${Math.abs(score.mate)}`;
  }
  const pawns = score.cp / 100;
  const clamped = Math.max(-9.9, Math.min(9.9, pawns));
  const sign = clamped > 0 ? '+' : '';
  return `${sign}${clamped.toFixed(1)}`;
}
