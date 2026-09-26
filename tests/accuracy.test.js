import { describe, test, expectClose, expectTrue, expectEqual } from './test-runner.js';
import { computeDeltaW, moveAccuracyFromWinPercents, computeGameAccuracy } from '../js/analysis/accuracy.js';

describe('accuracy: computeDeltaW', () => {
  test('win% drop gives a positive deltaW', () => {
    expectClose(computeDeltaW(70, 50), 20);
  });

  test('win% improvement is clamped to 0, not negative', () => {
    expectEqual(computeDeltaW(40, 60), 0);
  });

  test('no change gives deltaW 0', () => {
    expectEqual(computeDeltaW(55, 55), 0);
  });
});

describe('accuracy: moveAccuracyFromWinPercents', () => {
  test('an improving or unchanged move is always 100% accurate', () => {
    expectEqual(moveAccuracyFromWinPercents(50, 70), 100);
    expectEqual(moveAccuracyFromWinPercents(50, 50), 100);
  });

  test('a small win% loss stays close to 100', () => {
    const acc = moveAccuracyFromWinPercents(55, 53);
    expectTrue(acc > 90, `expected high accuracy for a tiny slip, got ${acc}`);
  });

  test('a huge win% loss (blunder) is close to 0, never negative', () => {
    const acc = moveAccuracyFromWinPercents(90, 5);
    expectTrue(acc >= 0 && acc < 20, `expected near-0 accuracy for a blunder, got ${acc}`);
  });

  test('accuracy is monotonically decreasing as win% loss grows', () => {
    const a1 = moveAccuracyFromWinPercents(80, 70);
    const a2 = moveAccuracyFromWinPercents(80, 50);
    const a3 = moveAccuracyFromWinPercents(80, 20);
    expectTrue(a1 > a2 && a2 > a3, `expected strictly decreasing accuracy, got ${a1}, ${a2}, ${a3}`);
  });
});

describe('accuracy: computeGameAccuracy', () => {
  test('mismatched array lengths return nulls instead of throwing', () => {
    const result = computeGameAccuracy([50, 50], ['w', 'b', 'w']);
    expectEqual(result.white, null);
    expectEqual(result.black, null);
  });

  test('empty game (no moves) returns nulls instead of throwing', () => {
    const result = computeGameAccuracy([50], []);
    expectEqual(result.white, null);
    expectEqual(result.black, null);
  });

  test('a perfectly-played game scores each side near 100', () => {
    const winPercents = [50, 52, 55, 58, 60, 63, 66, 69, 72, 75, 78];
    const colors = ['w', 'b', 'w', 'b', 'w', 'b', 'w', 'b', 'w', 'b'];
    const result = computeGameAccuracy(winPercents, colors);
    expectTrue(result.white > 95, `expected near-perfect white accuracy, got ${result.white}`);
    expectTrue(result.black > 95, `expected near-perfect black accuracy, got ${result.black}`);
  });

  test('one side blundering scores lower than the side that did not', () => {
    // White always improves its own win%; Black gives almost all of it back each move.
    const winPercents = [50, 55, 90, 95, 98, 99];
    const colors = ['w', 'b', 'w', 'b', 'w'];
    const result = computeGameAccuracy(winPercents, colors);
    expectTrue(result.black < result.white, `expected black (the blunderer) to score lower: white=${result.white}, black=${result.black}`);
  });
});
