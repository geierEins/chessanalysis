import { describe, test, expectEqual } from './test-runner.js';
import { buildStream } from '../js/meta/view/openingStream.js';

// A record with one openingPath step per move; the first step is named.
function rec(result, moves, color = 'w') {
  const openingPath = moves.map((m, i) => ({
    key: m,
    name: `N ${m}`,
    label: m,
    move: m,
    line: moves.slice(0, i + 1).join(' '),
    named: i === 0,
    byMe: i % 2 === 0,
  }));
  return { result, color, openingPath };
}
const times = (k, f) => Array.from({ length: k }, f);
const child = (node, key) => node.children.find((c) => c.key === key);

describe('openingStream: buildStream', () => {
  test('counts games along shared paths', () => {
    const root = buildStream([rec('W', ['e4', 'e5']), rec('W', ['e4', 'e5']), rec('L', ['e4', 'c5']), rec('D', ['d4'])]);
    expectEqual(root.n, 4);
    expectEqual(root.children.map((c) => c.key).join(), 'e4,d4');
    const e4 = child(root, 'e4');
    expectEqual(e4.n, 3);
    expectEqual(e4.children.map((c) => c.key).join(), 'e5,c5');
    expectEqual(child(e4, 'e5').ply, 2);
  });

  test('score is the share of points', () => {
    const root = buildStream([rec('W', ['e4']), rec('D', ['e4'])]);
    expectEqual(child(root, 'e4').score, 0.75);
  });

  test('stops at maxPly', () => {
    const moves = times(18, (_, i) => `m${i}`);
    const deepest = (root) => {
      let n = root;
      while (n.children.length) n = n.children[0];
      return n.ply;
    };
    expectEqual(deepest(buildStream([rec('W', moves)])), 16);
    expectEqual(deepest(buildStream([rec('W', moves)], 3)), 3);
  });

  test('games without an opening path are left out', () => {
    const root = buildStream([rec('W', ['e4']), { result: 'W', openingPath: [] }, { result: 'L' }]);
    expectEqual(root.n, 1);
  });

  test('empty input', () => {
    const root = buildStream([]);
    expectEqual(root.n, 0);
    expectEqual(root.children.length, 0);
  });

  test('keeps name, label, line of the step', () => {
    const root = buildStream([rec('W', ['e4', 'e5'])]);
    const e4 = child(root, 'e4');
    const e5 = child(e4, 'e5');
    expectEqual(e5.name, 'N e5');
    expectEqual(e5.label, 'e5');
    expectEqual(e5.line, 'e4 e5');
    expectEqual(e5.named, false);
    expectEqual(e4.named, true);
  });
});

