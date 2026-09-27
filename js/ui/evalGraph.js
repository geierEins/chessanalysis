import { evalToWinPercent } from '../analysis/winProbability.js';
import { formatScore } from './evalBar.js';

// With `tension` set on the dataset, Chart.js's line element pre-computes
// cubic-bezier control points (.cp1x/.cp1y/.cp2x/.cp2y) on each point element
// to draw its own smoothed curve. Reusing those exact control points here -
// instead of straight lineTo segments - keeps the fill's boundary perfectly
// aligned with the visibly curved line above it.
function traceSmoothPath(ctx, points, fromIndex) {
  for (let i = fromIndex + 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (typeof prev.cp2x === 'number' && typeof cur.cp1x === 'number') {
      ctx.bezierCurveTo(prev.cp2x, prev.cp2y, cur.cp1x, cur.cp1y, cur.x, cur.y);
    } else {
      ctx.lineTo(cur.x, cur.y);
    }
  }
}

// Fills the area under the win% curve white and the area above it black/dark,
// following the curve's shape at every point (not a static 50% split).
// Deliberately fills all the way to the canvas's logical edges (chart.width/
// height, not chartArea) rather than just the plotted data range - otherwise
// Chart.js's own small internal layout inset leaves a sliver of unfilled
// canvas at the edges, which then pokes out past the container's rounded
// corners instead of being clipped away cleanly.
const curveFillPlugin = {
  id: 'curveFill',
  beforeDatasetsDraw(chart) {
    const { ctx, width, height } = chart;
    const points = chart.getDatasetMeta(0).data;
    if (points.length === 0) return;

    const firstY = points[0].y;
    const lastY = points[points.length - 1].y;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, firstY);
    ctx.lineTo(points[0].x, points[0].y);
    traceSmoothPath(ctx, points, 0);
    ctx.lineTo(width, lastY);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = '#f5f5f5';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, firstY);
    ctx.lineTo(points[0].x, points[0].y);
    traceSmoothPath(ctx, points, 0);
    ctx.lineTo(width, lastY);
    ctx.lineTo(width, 0);
    ctx.closePath();
    ctx.fillStyle = '#262626';
    ctx.fill();

    // Thin, fixed "equal position" reference line at 50% - independent of
    // the curve itself (which already sits exactly on the white/black fill
    // boundary with no separate stroke needed there), so it's still visible
    // wherever the curve deviates from 50%, not just where it happens to
    // cross it.
    const yMid = chart.scales.y.getPixelForValue(50);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.6)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, yMid);
    ctx.lineTo(width, yMid);
    ctx.stroke();

    ctx.restore();
  },
};

const TOOLTIP_WIDTH_ESTIMATE_PX = 70; // see #renderTooltip's own comment

const KEY_POINT_RADIUS = 3; // 4 * 0.75 - dots 25% smaller
// A bit more than the dot's own diameter (2 * KEY_POINT_RADIUS = 6px), so
// neighboring dots never touch/overlap even at the threshold.
const KEY_POINT_MIN_SPACING_PX = 8;
// A run of this many or more key points at TRULY CONSECUTIVE plies (typically
// a long endgame stretch where every move alike gets "Perfekt"/BEST) gets
// thinned down to just its first and last dot, however much room the graph
// actually has - showing all 10+ in a row added nothing over just seeing
// where the streak started and ended.
const KEY_POINT_STREAK_MIN_LENGTH = 4;

/** Collapses each run of KEY_POINT_STREAK_MIN_LENGTH+ points at consecutive
 *  plies (index differs by exactly 1 from one to the next) down to just its
 *  two endpoints - checked on the real ply index, not just adjacency within
 *  this already-filtered array, so two BEST moves 20 plies apart don't get
 *  mistaken for "the same streak" just because nothing else marked happened
 *  to fall between them. */
function thinConsecutivePlyRuns(sortedByIndex) {
  const thinned = [];
  let i = 0;
  while (i < sortedByIndex.length) {
    let j = i;
    while (j + 1 < sortedByIndex.length && sortedByIndex[j + 1].index === sortedByIndex[j].index + 1) j++;
    if (j + 1 - i >= KEY_POINT_STREAK_MIN_LENGTH) {
      thinned.push(sortedByIndex[i], sortedByIndex[j]);
    } else {
      thinned.push(...sortedByIndex.slice(i, j + 1));
    }
    i = j + 1;
  }
  return thinned;
}

/**
 * Drops "Perfekt"/BEST key points ONLY (js/main.js's kp.thinnable) that would
 * render too close together to read as distinct dots, or that are part of a
 * long consecutive-ply streak (thinConsecutivePlyRuns above) - every OTHER
 * category (Brillant/Großartig/Fehler/Verpasst/Patzer) always renders in
 * full, unfiltered, exactly as before this declutter logic existed; BEST is
 * by far the most common of these in a long game (an entire endgame stretch
 * can be nothing but BEST moves), so it's the only one that ever needed it.
 * @param {Array<{index: number, color: string, thinnable: boolean}>} keyPoints
 * @param {Array<{x: number, y: number}>} points - Chart.js's own per-ply pixel positions
 */
function declutterKeyPoints(keyPoints, points) {
  const resolved = keyPoints
    .map((kp) => ({ ...kp, ...points[kp.index] }))
    .filter((kp) => kp.x != null)
    .sort((a, b) => a.x - b.x);

  const always = resolved.filter((kp) => !kp.thinnable);
  const thinnable = resolved.filter((kp) => kp.thinnable);
  const streaked = thinConsecutivePlyRuns(thinnable);

  // Everything left here is BEST (the only thinnable category), so ties
  // don't need breaking by category - just keep the earlier dot of any pair
  // still too close together after streak-thinning.
  const kept = [];
  for (const kp of streaked) {
    const last = kept[kept.length - 1];
    if (last && kp.x - last.x < KEY_POINT_MIN_SPACING_PX) continue;
    kept.push(kp);
  }
  return [...always, ...kept];
}

/** Draws permanent, colored key-point markers on top of the line (e.g. own
 *  Brilliant/Great/Miss/Blunder moves) - same look as the on-hover point. */
function createKeyPointsPlugin(getKeyPoints) {
  return {
    id: 'keyPoints',
    afterDatasetsDraw(chart) {
      const points = chart.getDatasetMeta(0).data;
      const keyPoints = getKeyPoints();
      if (points.length === 0 || keyPoints.length === 0) return;

      const { ctx } = chart;
      ctx.save();
      for (const { x, y, color } of declutterKeyPoints(keyPoints, points)) {
        ctx.beginPath();
        ctx.arc(x, y, KEY_POINT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

export class EvalGraph {
  #chart;
  #onJump;
  #keyPoints = [];
  #moves = [];
  #evalScores = []; // White-perspective {cp|mate} per ply, index 0 = start position - see setData()
  #indicatorEl;
  #hoverIndicatorEl;
  #tooltipEl;

  /**
   * @param {string} canvasId
   * @param {(plyIndex: number) => void} onJump - called with 0 for start position, 1..N for move N
   */
  constructor(canvasId, onJump) {
    this.#onJump = onJump;
    const canvasEl = document.getElementById(canvasId);
    const ctx = canvasEl.getContext('2d');
    this.#chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: [0],
        datasets: [
          {
            data: [50],
            borderColor: '#8e8e8e',
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#8e8e8e',
            pointHoverBorderWidth: 0,
            tension: 0.35,
            fill: false,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        // Top/bottom padding keeps the line (and its hover point) a few px
        // away from the canvas edge even at 0%/100%, so the hover circle
        // never gets clipped there. The curveFillPlugin still fills flush to
        // the true canvas edges regardless, so the solid color still bleeds
        // all the way to 100%/0% - only the line/point itself is inset.
        layout: { padding: { top: 4, bottom: 4, left: 0, right: 0 } },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { display: false },
          y: { min: 0, max: 100, display: false },
        },
        plugins: {
          legend: { display: false },
          // Shows the move number and the eval at that point next to the
          // hover dot, e.g. "Zug 14" / "+3.3" on two lines - otherwise the
          // graph only ever showed the dot itself with no indication of
          // which move it was or what the position was actually worth.
          // Rendered as our own DOM element (external, below), fixed above
          // the whole graph, rather than Chart.js's own canvas-drawn tooltip
          // - that one is positioned right at the hovered point, which on
          // this short a graph covered exactly the dot/area being aimed at.
          tooltip: {
            enabled: false,
            external: (context) => this.#renderTooltip(context),
            callbacks: {
              title: () => '',
              label: (context) => [this.#moveLabel(context.dataIndex), this.#evalLabel(context.dataIndex)],
            },
          },
        },
        onClick: (evt) => this.#handleClick(evt),
      },
      plugins: [curveFillPlugin, createKeyPointsPlugin(() => this.#keyPoints)],
    });

    // Current-position indicator (js/main.js's goToNode, via setActivePly) -
    // a DOM overlay rather than a canvas-drawn line, so its horizontal move
    // between moves can use a plain CSS transition (see styles.css) instead
    // of hand-rolled per-frame animation. #eval-graph-wrap is already
    // position:relative, so this positions directly against the canvas.
    this.#indicatorEl = document.createElement('div');
    this.#indicatorEl.className = 'eval-graph-indicator hidden';
    canvasEl.parentElement.appendChild(this.#indicatorEl);

    // Hover indicator - thin red vertical line at mouse position
    this.#hoverIndicatorEl = document.createElement('div');
    this.#hoverIndicatorEl.style.cssText = 'position: absolute; top: 0; width: 1.5px; height: 100%; background: #ff4444; pointer-events: none; display: none; z-index: 10;';
    canvasEl.parentElement.appendChild(this.#hoverIndicatorEl);

    // Own DOM tooltip (see the plugins.tooltip.external option above) -
    // fixed above the graph instead of drawn at the hovered point.
    this.#tooltipEl = document.createElement('div');
    this.#tooltipEl.className = 'eval-graph-tooltip hidden';
    canvasEl.parentElement.appendChild(this.#tooltipEl);
  }

  #handleClick(evt) {
    const points = this.#chart.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
    if (points.length > 0) {
      this.#onJump(points[0].index);
    }
  }

  /** Chart.js's "external" tooltip callback - draws nothing itself, just
   *  hands us the same title/label callbacks' output (tooltipModel.body),
   *  which we show in our own DOM element (css/styles.css pins it to the
   *  graph's bottom-right corner by default) instead of Chart.js's own
   *  canvas-drawn one. Flips to the bottom-LEFT corner instead once the
   *  hovered point gets close enough to the right edge that the
   *  (right-corner) tooltip would sit right under/near the cursor rather
   *  than staying clear of it. */
  #renderTooltip(context) {
    const { chart, tooltip: tooltipModel } = context;
    if (tooltipModel.opacity === 0) {
      this.#tooltipEl.classList.add('hidden');
      this.#hoverIndicatorEl.style.display = 'none';
      return;
    }
    const lines = tooltipModel.body?.flatMap((b) => b.lines) ?? [];
    this.#tooltipEl.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
    this.#tooltipEl.classList.remove('hidden');
    // TOOLTIP_WIDTH_ESTIMATE_PX: the tooltip's own DOM width isn't reliable
    // to measure here (still mid-layout on the same frame it's unhidden), so
    // this is a generous estimate of how wide it ever gets (short move-number
    // + eval strings) rather than an exact measurement.
    const nearRightEdge = tooltipModel.caretX > chart.width - TOOLTIP_WIDTH_ESTIMATE_PX;
    this.#tooltipEl.classList.toggle('eval-graph-tooltip-left', nearRightEdge);

    // Position hover indicator at the hovered x position
    this.#hoverIndicatorEl.style.display = 'block';
    this.#hoverIndicatorEl.style.left = `${tooltipModel.caretX}px`;
  }

  /** @param {number} ply - 0 for the start position, 1..N for move N */
  #moveLabel(ply) {
    if (ply === 0) return 'Start';
    const move = this.#moves[ply - 1];
    return move ? `Zug ${move.moveNumber}` : '';
  }

  /** @param {number} ply - 0 for the start position, 1..N for move N */
  #evalLabel(ply) {
    const score = this.#evalScores[ply];
    return score ? formatScore(score) : '';
  }

  /**
   * @param {Array<{evalAfterWhite: {cp?:number, mate?:number}, moveNumber: number}>} moves
   * @param {{cp?: number, mate?: number}} startEvalWhite
   */
  setData(moves, startEvalWhite) {
    this.#moves = moves;
    this.#evalScores = [startEvalWhite ?? { cp: 0 }, ...moves.map((m) => m.evalAfterWhite)];
    const winPercents = this.#evalScores.map(evalToWinPercent);
    this.#chart.data.labels = winPercents.map((_, i) => i);
    this.#chart.data.datasets[0].data = winPercents;
    this.#chart.update();
  }

  /** @param {Array<{index: number, color: string}>} keyPoints */
  setKeyPoints(keyPoints) {
    this.#keyPoints = keyPoints;
    this.#chart.update();
  }

  setActiveIndex(index) {
    this.#chart.setActiveElements([{ datasetIndex: 0, index }]);
    this.#chart.update();
  }

  /** Moves the vertical position-indicator line (+ its dot on the curve) to
   *  the given ply, or hides it entirely.
   *  @param {number|null} ply - 0 for the start position, 1..N for move N;
   *    null/undefined hides the indicator (e.g. while viewing a variation -
   *    the graph itself stays main-line-only, see setData()). */
  setActivePly(ply) {
    const point = ply == null ? null : this.#chart.getDatasetMeta(0).data[ply];
    if (!point) {
      this.#indicatorEl.classList.add('hidden');
      return;
    }
    this.#indicatorEl.classList.remove('hidden');
    this.#indicatorEl.style.transform = `translateX(${point.x}px)`;
  }

  /** Forces Chart.js to re-measure its (possibly just-unhidden/resized) container. */
  resize() {
    this.#chart.resize();
  }
}
