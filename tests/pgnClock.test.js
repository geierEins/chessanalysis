import { describe, test, expectEqual } from './test-runner.js';
import { parseClockSeconds, parseInitialClockSeconds, parseIncrementSeconds, formatClock } from '../js/analysis/pgnClock.js';

describe('pgnClock: parseClockSeconds', () => {
  test('plain H:MM:SS comments parse in order', () => {
    const pgn = '1. e4 {[%clk 0:09:58]} e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:50]}';
    expectEqual(parseClockSeconds(pgn).join(','), '598,597,590');
  });

  test('fractional seconds (e.g. ".7") are parsed and the ply alignment is not broken', () => {
    // Regression test: before the fractional-seconds fix, a fractional match
    // silently failed, dropping that ply and misaligning every match after it.
    const pgn = '1. e4 {[%clk 0:09:59.7]} e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:50.3]}';
    expectEqual(parseClockSeconds(pgn).join(','), '599,597,590');
  });

  test('hours are included when present', () => {
    const pgn = '1. e4 {[%clk 1:00:00]}';
    expectEqual(parseClockSeconds(pgn).join(','), '3600');
  });

  test('no clock comments returns an empty array', () => {
    expectEqual(parseClockSeconds('1. e4 e5 2. Nf3').length, 0);
  });
});

describe('pgnClock: parseInitialClockSeconds', () => {
  test('"600+5" gives 600 base seconds', () => {
    expectEqual(parseInitialClockSeconds('600+5'), 600);
  });

  test('"600" with no increment gives 600', () => {
    expectEqual(parseInitialClockSeconds('600'), 600);
  });

  test('"-" (untimed) gives null', () => {
    expectEqual(parseInitialClockSeconds('-'), null);
  });

  test('correspondence "1/259200" is not a ticking clock, gives null', () => {
    expectEqual(parseInitialClockSeconds('1/259200'), null);
  });

  test('missing header gives null', () => {
    expectEqual(parseInitialClockSeconds(undefined), null);
  });
});

describe('pgnClock: parseIncrementSeconds', () => {
  test('"600+5" gives 5 increment seconds', () => {
    expectEqual(parseIncrementSeconds('600+5'), 5);
  });

  test('"600" with no increment gives 0', () => {
    expectEqual(parseIncrementSeconds('600'), 0);
  });

  test('missing header gives 0', () => {
    expectEqual(parseIncrementSeconds(undefined), 0);
  });
});

describe('pgnClock: formatClock', () => {
  test('under an hour formats as MM:SS', () => {
    expectEqual(formatClock(65), '01:05');
  });

  test('an hour or more formats as H:MM:SS', () => {
    expectEqual(formatClock(3665), '1:01:05');
  });

  test('null passes through as null', () => {
    expectEqual(formatClock(null), null);
  });

  test('negative seconds clamp to zero instead of going negative', () => {
    expectEqual(formatClock(-5), '00:00');
  });
});
