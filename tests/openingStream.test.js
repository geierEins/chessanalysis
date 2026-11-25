import { describe, test, expectEqual, expectClose, expectTrue } from './test-runner.js';
import { buildStream, layoutStream, visibleBands, streamSvg, streamCard } from '../js/meta/view/openingStream.js';
import { esc } from '../js/meta/view/format.js';

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


describe('openingStream: layout', () => {
  const SIZE = { W: 1200, H: 460 };

  test('bands are exactly proportional', () => {
    const root = buildStream([rec('W', ['e4', 'e5']), rec('W', ['e4', 'e5']), rec('L', ['e4', 'c5']), rec('D', ['d4'])]);
    const { k } = layoutStream(root, SIZE);
    const e4 = child(root, 'e4');
    expectClose((e4.n * k) / (root.n * k), 3 / 4, 0.001);
    expectClose(root.children.reduce((a, c) => a + c.n * k, 0), root.n * k, 0.001);
  });

  test('children stack inside the parent from its top', () => {
    const root = buildStream([rec('W', ['e4', 'e5']), rec('W', ['e4', 'e5']), rec('L', ['e4', 'c5']), rec('D', ['d4'])]);
    const L = layoutStream(root, SIZE);
    const e4 = child(root, 'e4');
    const d4 = child(root, 'd4');
    expectClose(L.srcTop.get(e4), L.top.get(root), 0.001);
    expectClose(L.srcTop.get(d4), L.srcTop.get(e4) + e4.n * L.k, 0.001);
  });

  test('thin bands become a stub', () => {
    const root = buildStream([...times(199, () => rec('W', ['e4'])), rec('W', ['d4'])]);
    const L = layoutStream(root, SIZE);
    const d4 = child(root, 'd4');
    const at1 = visibleBands(root, L, 1);
    expectTrue(!at1.bands.includes(d4), 'd4 hidden at 1x');
    expectEqual(at1.stubs.find((s) => s.node === root)?.n, 1);
    const at3 = visibleBands(root, L, 3);
    expectTrue(at3.bands.includes(d4), 'd4 shown at 3x');
    expectEqual(at3.stubs.find((s) => s.node === root), undefined);
  });

  test('games leaving the book end in a stub', () => {
    const root = buildStream([rec('W', ['e4', 'e5']), rec('W', ['e4'])]);
    const L = layoutStream(root, SIZE);
    const e4 = child(root, 'e4');
    const stub = visibleBands(root, L, 1).stubs.find((s) => s.node === e4);
    expectEqual(stub?.n, 1);
    expectClose(stub.top, L.top.get(e4) + 1 * L.k, 0.001);
  });

  test('start view shows at least 6 columns', () => {
    expectEqual(layoutStream(buildStream([rec('W', ['e4'])]), SIZE).cols0, 6);
    const line = (k) => times(k, (_, i) => `m${i}`);
    expectEqual(layoutStream(buildStream(times(50, () => rec('W', line(12)))), SIZE).cols0, 12);
    expectEqual(layoutStream(buildStream(times(50, () => rec('W', line(20)))), SIZE).cols0, 16);
  });
});

describe('openingStream: svg', () => {
  const SIZE = { W: 1200, H: 460 };
  const step = (key, move, name, named) => ({ key, move, name, label: name, line: key, named, byMe: true });
  const e4 = () => ({ result: 'W', openingPath: [step('e4', '1.e4', "King's Pawn Game", true)] });
  const d4 = () => ({ result: 'W', openingPath: [step('d4', '1.d4', "Queen's Pawn Game", true)] });
  const root = buildStream([...times(97, e4), ...times(3, d4)]);
  const L = layoutStream(root, SIZE);
  const svg = (zoom, y = 0) => streamSvg(root, L, { zoom, x: 0, y }, SIZE);

  test('bands carry the board-preview attributes', () => {
    const s = svg(1);
    expectTrue(s.includes('data-line="e4"'), 'data-line');
    expectTrue(s.includes(`data-opening="${esc("King's Pawn Game")}"`), 'data-opening');
  });

  test('thick bands are labelled at once', () => {
    const s = svg(1);
    expectTrue(s.includes('1.e4'), 'move');
    expectTrue(s.includes('Pawn Game'), 'name');
  });

  test('labels appear only when readable', () => {
    // y = 300: the d4 band (near the bottom) is inside the zoomed view.
    expectTrue(svg(2.2, 300).includes('1.d4'), 'readable at 2.2x');
    expectTrue(!svg(1.2, 300).includes('1.d4'), 'too small at 1.2x');
  });

  test('stubs fade out', () => {
    expectEqual(svg(1).split('mask="url(#ostream-fade)"').length - 1, 2);
  });

  test('colors follow the score', () => {
    expectTrue(svg(1).includes('fill="hsl(125, 68%, 52%)"'));
  });

  test('a name too long for its band falls back to the move', () => {
    const narrow = { W: 600, H: 460 };
    const s = streamSvg(root, layoutStream(root, narrow), { zoom: 1, x: 0, y: 0 }, narrow);
    expectTrue(s.includes('1.e4'), 'move shown');
    expectTrue(!s.includes('Pawn Game</tspan>'), 'name left out');
  });

  // #meta-panel svg text (css/styles.css) sets fill and font-size, which beat SVG attributes.
  test('labels set size and color inline', () => {
    expectTrue(/<text style="font-size:13px;fill:#141414"/.test(svg(1)));
  });

  test('narrow columns get short ply labels', () => {
    const narrow = { W: 360, H: 280 };
    const s = streamSvg(root, layoutStream(root, narrow), { zoom: 1, x: 0, y: 0 }, narrow);
    expectTrue(!s.includes('Zug Weiß'), 'no long labels');
    expectTrue(s.includes('>1.</text>') && s.includes('>1…</text>'), 'short labels');
    expectTrue(svg(1).includes('1. Zug Weiß'), 'wide keeps long labels');
  });
});

describe('openingStream: card', () => {
  test('a color without games says so', () => {
    expectTrue(streamCard([], 'w').includes('Keine Partien mit dieser Farbe.'));
  });

  test('a color with games gets a drawing box and a reset button', () => {
    const s = streamCard([rec('W', ['e4'])], 'w');
    expectTrue(s.includes('data-fit='), 'fit box');
    expectTrue(s.includes('meta-zoom-reset'), 'reset button');
  });
});
