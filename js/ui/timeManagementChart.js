// Bar chart of time spent per move, colored by that move's own quality
// category (js/analysis/categories.js) - lets a fast move next to a red
// (Blunder/Mistake) bar jump out as a pattern, which a table of numbers
// can't show. Main-line only, same scope as the eval graph/accuracy table
// (js/main.js's dashboard) - a branch move has no PGN clock data anyway.

export class TimeManagementChart {
  #chart;
  #moves = [];
  #onJump;

  /** @param {(ply: number) => void} [onJump] - called with the clicked bar's
   *   move ply (js/main.js's goToPly) - same jump-to-move behavior as the
   *   eval graph's own click handler. */
  constructor(canvasId, onJump) {
    this.#onJump = onJump;
    const ctx = document.getElementById(canvasId).getContext('2d');
    this.#chart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            // A light ring on White's bars, none on Black's - fill color is
            // already spoken for (move quality), so which side played is a
            // second dimension carried by the border rather than a new hue.
            borderColor: [],
            borderWidth: 2,
            borderRadius: 4,
            borderSkipped: false,
            categoryPercentage: 0.85,
            barPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            ticks: { color: '#737373', maxRotation: 0, autoSkip: true, font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#737373', font: { size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            title: { display: true, text: 'Sekunden', color: '#737373', font: { size: 10 } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            // One line total: no separate title, everything in the body's
            // own label callback (time - quality, no move number).
            callbacks: {
              title: () => '',
              label: (item) => {
                const move = this.#moves[item.dataIndex];
                if (!move) return '';
                const seconds = item.raw.toFixed(1);
                return move.categoryLabel ? `${seconds}s – ${move.categoryLabel}` : `${seconds}s`;
              },
            },
          },
        },
        onClick: (evt) => this.#handleClick(evt),
      },
    });
  }

  #handleClick(evt) {
    const points = this.#chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
    if (points.length === 0) return;
    const move = this.#moves[points[0].index];
    if (move) this.#onJump?.(move.ply);
  }

  /**
   * @param {Array<{ply: number, isWhite: boolean, axisLabel: string, categoryLabel: string|null, color: string, secondsSpent: number}>} entries
   *   one per main-line move that actually had clock data - see js/main.js's
   *   computeMoveTimesSpent for how these are derived.
   */
  setData(entries) {
    this.#moves = entries;
    this.#chart.data.labels = entries.map((e) => e.axisLabel);
    this.#chart.data.datasets[0].data = entries.map((e) => e.secondsSpent);
    this.#chart.data.datasets[0].backgroundColor = entries.map((e) => e.color);
    this.#chart.data.datasets[0].borderColor = entries.map((e) => (e.isWhite ? '#f5f5f5' : 'transparent'));
    this.#chart.update();
  }

  /** Chart.js can't measure a canvas that was display:none while data was
   *  set (e.g. the table/chart toggle in js/main.js) - call this right after
   *  making the chart's container visible again. */
  resize() {
    this.#chart.resize();
  }
}
