// Minimal in-browser test harness - no Node/npm available in this project,
// so this runs as plain ES modules loaded directly by tests/index.html via
// the same local dev server the app itself uses.

const results = [];
let currentSuite = '';

export function describe(name, fn) {
  currentSuite = name;
  fn();
}

export function test(name, fn) {
  const suite = currentSuite;
  try {
    fn();
    results.push({ suite, name, pass: true });
  } catch (err) {
    results.push({ suite, name, pass: false, error: err.message });
  }
}

export function expectEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function expectClose(actual, expected, tolerance = 0.01, label = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label ? label + ': ' : ''}expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

export function expectTrue(actual, label = '') {
  if (!actual) throw new Error(`${label ? label + ': ' : ''}expected truthy, got ${JSON.stringify(actual)}`);
}

export function render(rootEl) {
  const passCount = results.filter((r) => r.pass).length;
  rootEl.innerHTML =
    `<h1>${passCount} / ${results.length} Tests bestanden</h1>` +
    results
      .map(
        (r) =>
          `<div style="color:${r.pass ? '#4ade80' : '#f87171'}">${r.pass ? '✓' : '✗'} [${r.suite}] ${r.name}` +
          (r.error ? `<div style="color:#f87171;margin-left:1.5em">${r.error}</div>` : '') +
          `</div>`
      )
      .join('');
}
