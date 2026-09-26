import { describe, test, expectClose, expectTrue } from './test-runner.js';
import { evalToWinPercent, evalToWinPercentForRating } from '../js/analysis/winProbability.js';

describe('winProbability: evalToWinPercent', () => {
  test('equal position (cp=0) is 50%', () => {
    expectClose(evalToWinPercent({ cp: 0 }), 50);
  });

  test('positive cp favors White (>50%)', () => {
    expectTrue(evalToWinPercent({ cp: 300 }) > 50, 'white should be favored');
  });

  test('negative cp favors Black (<50%)', () => {
    expectTrue(evalToWinPercent({ cp: -300 }) < 50, 'black should be favored');
  });

  test('symmetric around 0', () => {
    const up = evalToWinPercent({ cp: 250 });
    const down = evalToWinPercent({ cp: -250 });
    expectClose(up + down, 100);
  });

  test('extreme cp is clamped, not >100 or <0', () => {
    const w = evalToWinPercent({ cp: 100000 });
    expectTrue(w <= 100 && w > 90, `expected clamped high win%, got ${w}`);
  });

  test('mate for White is treated as strongly winning, not flat 100', () => {
    const w = evalToWinPercent({ mate: 3 });
    expectTrue(w < 100 && w > 95, `expected near-100 but not exactly 100, got ${w}`);
  });

  test('mate for Black is treated as strongly losing, not flat 0', () => {
    const w = evalToWinPercent({ mate: -3 });
    expectTrue(w > 0 && w < 5, `expected near-0 but not exactly 0, got ${w}`);
  });

  test('missing cp defaults to 0 (even position)', () => {
    expectClose(evalToWinPercent({}), 50);
  });
});

describe('winProbability: evalToWinPercentForRating', () => {
  test('midpoint rating (1500) matches the unadjusted formula', () => {
    const base = evalToWinPercent({ cp: 200 });
    const adjusted = evalToWinPercentForRating({ cp: 200 }, 1500);
    expectClose(adjusted, base);
  });

  test('missing rating falls back to the unadjusted formula', () => {
    const base = evalToWinPercent({ cp: 200 });
    const adjusted = evalToWinPercentForRating({ cp: 200 }, null);
    expectClose(adjusted, base);
  });

  test('higher-rated games produce a steeper (more decisive) curve', () => {
    const strong = evalToWinPercentForRating({ cp: 200 }, 2500);
    const base = evalToWinPercent({ cp: 200 });
    expectTrue(strong > base, `expected steeper curve for strong players, got ${strong} vs base ${base}`);
  });

  test('lower-rated games produce a flatter (less decisive) curve', () => {
    const weak = evalToWinPercentForRating({ cp: 200 }, 500);
    const base = evalToWinPercent({ cp: 200 });
    expectTrue(weak < base, `expected flatter curve for weak players, got ${weak} vs base ${base}`);
  });

  test('still symmetric around 50 for a rating-adjusted curve', () => {
    const up = evalToWinPercentForRating({ cp: 250 }, 2200);
    const down = evalToWinPercentForRating({ cp: -250 }, 2200);
    expectClose(up + down, 100);
  });
});
