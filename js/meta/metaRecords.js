// Per-game records for the Meta-Analyse mode. Every statistic in that mode is
// aggregated on the fly from these records, so changing a filter never needs
// a re-analysis. Two halves per game:
//  - the "fast" record: everything derivable from the Chess.com game object
//    and its PGN alone (result, opening, clocks, ...) - built right after
//    loading, no engine involved;
//  - the "engine" record: what only a Stockfish pass can tell (accuracy,
//    blunders, phases, eval swings) - cached per engine + depth (metaStore.js).

import { Chess } from '../chessLib.js';
import { summarizeGame } from '../api/chesscom.js';
import { createBookTracker, namedNodesForLine } from '../analysis/openingBook.js';
import { parseClockSeconds, parseInitialClockSeconds, parseIncrementSeconds } from '../analysis/pgnClock.js';
import { MATE_CP_EQUIVALENT } from '../analysis/gameAnalyzer.js';
import { computeGameAccuracy } from '../analysis/accuracy.js';
import { detectMate } from '../analysis/mateType.js';

const LOSS_REASONS = { checkmated: 'checkmate', resigned: 'resign', timeout: 'timeout', abandoned: 'abandon' };
// "aborted": both sides gave up (Chess.com's "Double forfeit") - scored 1/2-1/2.
const DRAW_REASONS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient', 'aborted']);

/** Checkmate patterns (js/analysis/mateType.js's MATE_TYPES) - the "Matt" tab's names. */
export const MATE_LABEL = {
  scholars: 'Schäfermatt',
  fools: 'Narrenmatt',
  smothered: 'Ersticktes Matt',
  kq: 'Grundmatt K+D gegen K',
  kr: 'Grundmatt K+T gegen K',
  kbn: 'Grundmatt K+L+S gegen K',
  kbb: 'Grundmatt K+L+L gegen K',
  arabian: 'Arabisches Matt',
  hook: 'Hakenmatt',
  corner: 'Eckmatt',
  anastasia: 'Anastasia-Matt',
  morphy: 'Morphy-Matt',
  greco: 'Greco-Matt',
  boden: 'Boden-Matt',
  opera: 'Opera-Matt',
  epaulette: 'Epaulettenmatt',
  dovetail: 'Schwalbenschwanzmatt',
  gueridon: 'Guéridon-Matt',
  damiano: 'Damiano-Matt',
  lolli: 'Lolli-Matt',
  kiss: 'Damenkuss',
  ladder: 'Treppenmatt',
  backrank: 'Grundreihenmatt',
  pawn: 'Bauernmatt',
  other: 'Sonstiges Matt',
};

export const TERMINATION_LABEL = {
  checkmate: 'Schachmatt',
  resign: 'Aufgabe',
  timeout: 'Zeit',
  abandon: 'Abbruch',
  agreed: 'Vereinbart',
  repetition: 'Stellungswiederholung',
  stalemate: 'Patt',
  insufficient: 'Ungenügendes Material',
  '50move': '50-Züge-Regel',
  timevsinsufficient: 'Zeit vs. ungenügendes Material',
  aborted: 'Beidseitig verfallen',
  other: 'Sonstiges',
};

export const PIECE_LABEL = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };

/** Games against Chess.com's coach bots (Coach-Dante, Coach-Nadia, ...) - left
 *  out of the meta mode entirely: no stats, no engine analysis. */
export const isCoachGame = (r) => /^coach-/i.test(r.opponent);
// A game ended before the first move (aborted, resigned at once) has nothing an
// engine could evaluate - it never counts as "missing engine values".
export const hasMoves = (r) => r.plies > 0;

/** What a click on a game in the Meta-Analyse does: 'open' it in the game
 *  mode (it has engine values), or explain why not - 'nomoves' (nothing to
 *  analyze), 'running' / 'queued' (its analysis is under way) or 'analyze'.
 *  engine: its engine record or null; queue: 'running' | 'queued' | null. */
export function gameOpenState(r, engine, queue) {
  if (engine) return 'open';
  if (!hasMoves(r)) return 'nomoves';
  return queue ?? 'analyze';
}

/** Only the parts of a Chess.com game object the meta mode needs - also what
 *  the auto-analysis master files store, so they run through the exact same
 *  buildFastRecord() path as a fresh download. */
export function slimRawGame(raw) {
  const side = (p) => ({ username: p?.username, rating: p?.rating, result: p?.result });
  return {
    url: raw.url,
    pgn: raw.pgn,
    time_class: raw.time_class,
    time_control: raw.time_control,
    end_time: raw.end_time,
    rated: raw.rated,
    white: side(raw.white),
    black: side(raw.black),
  };
}

function terminationCode(whiteResult, blackResult) {
  if (DRAW_REASONS.has(whiteResult)) return whiteResult;
  if (DRAW_REASONS.has(blackResult)) return blackResult;
  const loser = whiteResult === 'win' ? blackResult : whiteResult;
  return LOSS_REASONS[loser] ?? 'other';
}

/** "Italian Game: Two Knights Defense" -> "Italian Game" - stats group by the
 *  family name, the full variation name is kept for tooltips. */
export function openingFamily(name) {
  return name ? name.split(':')[0].trim() : null;
}

// Names Lichess already gives after 1.e4 / 1.d4 - who played that says nothing,
// so for these the variation ("King's Pawn Game: Wayward Queen Attack") counts.
const UMBRELLA_FAMILIES = new Set(["King's Pawn Game", "Queen's Pawn Game"]);

/**
 * Who chose the game's opening, and the name it is grouped under: the player
 * whose move first produced the opening's family name (odd ply = white). For
 * the umbrella names above, the variation (up to its first comma) instead.
 * @param {Array<{ply: number, name: string}>} named openingBook's namedNodesForLine()
 * @param {'w'|'b'} color the user's color
 * @returns {{group: string|null, byMe: boolean|null}}
 */
export function openingChoice(named, color) {
  const g = openingGroupOf(named);
  return g ? { group: g.group, byMe: byColor(g.ply, color) } : { group: null, byMe: null };
}

const byColor = (ply, color) => (ply % 2 === 1) === (color === 'w');

/** openingChoice()'s group and the ply that decides it; null without a named position. */
function openingGroupOf(named) {
  const last = named.at(-1)?.name;
  if (!last) return null;
  const family = openingFamily(last);
  let group = family;
  let first = named.find((n) => openingFamily(n.name) === family);
  if (UMBRELLA_FAMILIES.has(family) && last !== family) {
    group = `${family}: ${last.slice(last.indexOf(':') + 1).split(',')[0].trim()}`;
    first = named.find((n) => n.name === group || n.name.startsWith(`${group},`)) ?? first;
  }
  return { group, ply: first.ply };
}

/**
 * The game's path through the Eröffnungen tab's opening tree: one level per
 * ply, up to its last named position - so level n is always the n-th ply.
 * A ply that produced a new name is a named step ("King's Knight Opening"
 * after 2.Nf3, `label` without its parent's prefix); one that didn't (1…e5
 * is "King's Pawn Game" again, or a move without any name) is labelled by
 * the move itself. `name` is the opening's name at that point (for the
 * tooltip), `line` the moves up to it, `byMe` whether the user played it.
 * @param {Array<{ply: number, name: string}>} named openingBook's namedNodesForLine()
 * @param {'w'|'b'} color the user's color
 * @param {string[]} sans the game's moves (SAN)
 * @returns {Array<{key: string, name: string, label: string, move: string, line: string, named: boolean, byMe: boolean}>}
 */
export function openingTreePath(named, color, sans) {
  const byPly = new Map(named.map((n) => [n.ply, n.name]));
  const steps = [];
  let current = null; // the name in force at this ply
  for (let ply = 1; ply <= (named.at(-1)?.ply ?? 0); ply++) {
    const move = `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}${sans[ply - 1]}`;
    const name = byPly.get(ply);
    const isNew = name != null && name !== current;
    const label = isNew ? stripParent(name, current) : move;
    if (isNew) current = name;
    steps.push({ key: isNew ? name : move, name: current, label, move, line: sans.slice(0, ply).join(' '), named: isNew, byMe: byColor(ply, color) });
  }
  return steps;
}

/** "Italian Game: Two Knights Defense, Knight Attack" under "Italian Game: Two Knights Defense" -> "Knight Attack";
 *  "Italian Game: Giuoco Piano" under "Italian Game" -> "Giuoco Piano"; a new family keeps its full name. */
function stripParent(name, parent) {
  if (!parent) return name;
  for (const sep of [', ', ': ']) if (name.startsWith(parent + sep)) return name.slice(parent.length + sep.length);
  const colon = name.indexOf(':');
  return colon >= 0 && openingFamily(name) === openingFamily(parent) ? name.slice(colon + 1).trim() : name;
}

const MATERIAL_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function fenMaterialBalance(fen) {
  let balance = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = MATERIAL_VALUE[ch.toLowerCase()];
    if (v) balance += ch === ch.toUpperCase() ? v : -v;
  }
  return balance;
}

/**
 * Biggest material lead and deficit (pawn units, the user's point of view)
 * during the game, from its captures and promotions. A lead only counts if it
 * survived the opponent's next move, so the middle of an exchange (capture,
 * then recapture) isn't mistaken for one.
 * @returns {{max: number, min: number}}
 */
function materialSwing(verboseMoves, color, startFen) {
  let balance = startFen ? fenMaterialBalance(startFen) : 0; // White's point of view
  const after = [];
  for (const m of verboseMoves) {
    const sign = m.color === 'w' ? 1 : -1;
    if (m.captured) balance += sign * MATERIAL_VALUE[m.captured];
    if (m.promotion) balance += sign * (MATERIAL_VALUE[m.promotion] - 1);
    after.push(color === 'w' ? balance : -balance);
  }
  let max = 0;
  let min = 0;
  for (let i = 0; i < after.length; i++) {
    const next = after[i + 1] ?? after[i];
    max = Math.max(max, Math.min(after[i], next));
    min = Math.min(min, Math.max(after[i], next));
  }
  return { max, min };
}

/**
 * Every capture of the game as "<square><own piece><opponent's piece>", for
 * the Heatmap tab - the own piece always third, so "the user's queen" filters
 * the same way in both directions:
 *  - taken: the user captured; own = the capturing piece, then the captured one
 *    (e.g. "h8qr": the user's queen took a rook on h8);
 *  - lost: the opponent captured; own = the user's captured piece, then the
 *    capturing one (e.g. "e4pn": a knight took the user's pawn on e4).
 * The square is where the captured piece stood - for en passant that's beside
 * the target square, not on it.
 * @returns {{taken: string[], lost: string[]}}
 */
function captureSquares(verbose, color) {
  const taken = [];
  const lost = [];
  for (const m of verbose) {
    if (!m.captured) continue;
    const square = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
    if (m.color === color) taken.push(square + m.piece + m.captured);
    else lost.push(square + m.captured + m.piece);
  }
  return { taken, lost };
}

/** The checkmate pattern of a game ending in "#" (js/analysis/mateType.js), plus
 *  byMe: set by the user - from the result, or where that doesn't fit a mate
 *  (bad data), from the mating move's color. null without a mate. */
function mateOf(parser, verbose, sans, color, result) {
  const last = verbose[verbose.length - 1];
  if (!last || !sans[sans.length - 1].endsWith('#')) return null;
  // The parser already stands on the final position - no second parse of its FEN.
  const mate = detectMate(parser, last, { standardStart: !parser.header().FEN, moveNumber: Math.ceil(sans.length / 2) });
  if (!mate) return null;
  return { ...mate, byMe: result === 'W' ? true : result === 'L' ? false : last.color === color };
}

/**
 * @param {object} raw a Chess.com game object (or slimRawGame() of one)
 * @param {string} username the searched user
 * @returns {object|null} null if the user didn't play in this game or the PGN is unreadable
 */
export function buildFastRecord(raw, username) {
  const me = username.trim().toLowerCase();
  const color = raw.white?.username?.toLowerCase() === me ? 'w' : raw.black?.username?.toLowerCase() === me ? 'b' : null;
  if (!color || !raw.pgn) return null;

  const parser = new Chess();
  if (!parser.load_pgn(raw.pgn, { sloppy: true })) return null;
  const verbose = parser.history({ verbose: true });
  const sans = verbose.map((m) => m.san);
  const material = materialSwing(verbose, color, parser.header().FEN);

  const ownSide = color === 'w' ? raw.white : raw.black;
  const oppSide = color === 'w' ? raw.black : raw.white;
  const ownResult = ownSide.result;
  const result = ownResult === 'win' ? 'W' : DRAW_REASONS.has(ownResult) ? 'D' : 'L';

  const book = createBookTracker();
  let bookPlies = 0;
  for (const san of sans) {
    if (!book.feed(san)) break;
    bookPlies++;
  }
  const named = namedNodesForLine(sans);
  const opening = named.at(-1)?.name ?? null;
  const choice = openingChoice(named, color);

  const timeControl = raw.time_control ?? parser.header().TimeControl;
  const initialClock = raw.time_class === 'daily' ? null : parseInitialClockSeconds(timeControl);
  const clocks = parseClockSeconds(raw.pgn);
  let ownClockEnd = null;
  for (let i = clocks.length - 1; i >= 0; i--) {
    if ((i % 2 === 0) === (color === 'w')) {
      ownClockEnd = clocks[i];
      break;
    }
  }
  // Seconds spent on each own move (index 0 = move 1) and the game's length
  // on both clocks together - like the single-game time chart
  // (js/analysis/moveTimes.js). Only with a clock comment on every ply.
  const increment = parseIncrementSeconds(timeControl);
  const ownMoveSeconds = [];
  let duration = null;
  if (initialClock && clocks.length && clocks.length === sans.length) {
    const last = [initialClock, initialClock];
    duration = 0;
    clocks.forEach((c, i) => {
      const spent = Math.max(0, last[i % 2] - c + increment);
      last[i % 2] = c;
      duration += spent;
      if ((i % 2 === 0) === (color === 'w')) ownMoveSeconds.push(spent);
    });
  }

  return {
    url: raw.url,
    endTime: (raw.end_time ?? 0) * 1000,
    timeClass: raw.time_class ?? '?',
    rated: raw.rated !== false,
    color,
    opponent: oppSide.username ?? '?',
    oppRating: oppSide.rating ?? null,
    ownRating: ownSide.rating ?? null,
    result,
    termination: terminationCode(raw.white?.result, raw.black?.result),
    plies: sans.length,
    moves: Math.ceil(sans.length / 2),
    opening,
    family: openingFamily(opening),
    openingGroup: choice.group, // the Eröffnungen tab's grouping (family, or variation of an umbrella name)
    openingByMe: choice.byMe, // who chose the opening (null: no named position)
    openingPath: openingTreePath(named, color, sans), // the Eröffnungen tab's tree path
    firstMove: sans[0] ?? null,
    bookPlies,
    initialClock,
    ownClockEnd: initialClock ? ownClockEnd : null,
    duration,
    ownMoveSeconds,
    // Own pawns that reached the last rank, whatever they turned into.
    promotions: verbose.filter((m) => m.color === color && m.promotion).length,
    captures: captureSquares(verbose, color),
    // Own king moves, castling included ("Längste Königsreisen").
    kingMoves: verbose.filter((m) => m.color === color && m.piece === 'k').length,
    maxMaterial: material.max,
    minMaterial: material.min,
    firstMover: parser.header().FEN?.split(' ')[1] === 'b' ? 'b' : 'w',
    endsInMate: Boolean(sans[sans.length - 1]?.endsWith('#')),
    mate: mateOf(parser, verbose, sans, color, result),
    raw: slimRawGame(raw),
    summary: summarizeGame(raw),
  };
}

/** Sum of both sides' non-pawn, non-king material (Q=9, R=5, B/N=3) - used
 *  to tell the endgame apart: 20 or less means at most e.g. two rooks and
 *  two minor pieces left on the whole board. */
export function nonPawnMaterial(fen) {
  const VALUES = { q: 9, r: 5, b: 3, n: 3 };
  let total = 0;
  for (const ch of fen.split(' ')[0]) total += VALUES[ch.toLowerCase()] ?? 0;
  return total;
}

export const ENDGAME_MATERIAL = 20;
export const OPENING_LAST_MOVE = 12;

/** 'opening' | 'middlegame' | 'endgame' for a move, by the position it was played from. */
export function phaseOf(move) {
  if (nonPawnMaterial(move.fenBefore) <= ENDGAME_MATERIAL) return 'endgame';
  return move.moveNumber <= OPENING_LAST_MOVE ? 'opening' : 'middlegame';
}

function ownCp(evalWhite, color) {
  if (!evalWhite) return 0;
  const cp = evalWhite.mate !== undefined ? (evalWhite.mate > 0 ? MATE_CP_EQUIVALENT : -MATE_CP_EQUIVALENT) : evalWhite.cp ?? 0;
  return color === 'w' ? cp : -cp;
}

// Version of what buildEngineRecord() computes - raised when a stat changes,
// so stored records get redone (scripts/auto-analysis/analyze.mjs) and
// replaced in the browser (js/meta/autoAnalysis.js). 2: per-phase accuracy
// with the game formula instead of a plain mean.
export const ENGINE_RECORD_VERSION = 2;

/**
 * Condenses gameAnalyzer.js's full per-move result into the few numbers the
 * meta stats need, from the searched user's point of view.
 * @param {object} analysis analyzeGame()'s result
 * @param {'w'|'b'} color the searched user's color
 * @param {number|null} initialClock starting time in seconds (for "Zeitnot")
 */
export function buildEngineRecord(analysis, color, initialClock) {
  const own = analysis.moves.filter((m) => m.color === color);
  const counts = {};
  const oppCounts = {};
  for (const m of analysis.moves) {
    const target = m.color === color ? counts : oppCounts;
    target[m.category.id] = (target[m.category.id] ?? 0) + 1;
  }
  // Same Lichess formula as the game's own accuracy, over each phase's moves
  // (js/analysis/accuracy.js) - a plain mean of the per-move values would sit
  // far above the total, since it hardly feels a single blunder.
  const phases = computeGameAccuracy(analysis.winPercentsWhite, analysis.moves.map((m) => m.color), analysis.moves.map(phaseOf)).byGroup[color];

  let maxCp = 0;
  let minCp = 0;
  for (const m of analysis.moves) {
    const cp = ownCp(m.evalAfterWhite, color);
    maxCp = Math.max(maxCp, cp);
    minCp = Math.min(minCp, cp);
  }

  const blunders = own
    .filter((m) => m.category.id === 'BLUNDER')
    .map((m) => ({
      move: m.moveNumber,
      piece: m.piece,
      timeTrouble: Boolean(initialClock && m.clockSeconds != null && m.clockSeconds < initialClock * 0.1),
    }));

  const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return {
    v: ENGINE_RECORD_VERSION,
    accuracy: round1(color === 'w' ? analysis.accuracy.white : analysis.accuracy.black),
    oppAccuracy: round1(color === 'w' ? analysis.accuracy.black : analysis.accuracy.white),
    counts,
    oppCounts,
    phaseAccuracy: {
      opening: round1(phases.opening),
      middlegame: round1(phases.middlegame),
      endgame: round1(phases.endgame),
    },
    maxCp,
    minCp,
    blunders,
  };
}

const mateInOneCache = new WeakMap(); // engine record -> mateInOne() result

/**
 * The user's mate-in-1 chances and how many of them weren't played, read from
 * the engine record's per-move log (js/analysis/evalLog.js): entry i is the
 * engine's answer for the position before ply i, scored for the side to move,
 * so "#1" there means the mover had a mate in one. Only the game's last move
 * can actually be mate, so any other chance was missed.
 * @param {object} engineRec buildEngineRecord() + `evals`
 * @param {object} r the game's fast record
 * @returns {{chances: number, missed: number}|null} null without a log
 */
export function mateInOne(engineRec, r) {
  if (!engineRec?.evals) return null;
  if (mateInOneCache.has(engineRec)) return mateInOneCache.get(engineRec);
  const entries = engineRec.evals.split(',');
  const ownParity = r.color === r.firstMover ? 0 : 1;
  let chances = 0;
  let missed = 0;
  for (let i = ownParity; i < Math.min(entries.length, r.plies); i += 2) {
    if (entries[i].split(' ')[1] !== '#1') continue;
    chances++;
    if (!(i === r.plies - 1 && r.endsInMate)) missed++;
  }
  const result = { chances, missed };
  mateInOneCache.set(engineRec, result);
  return result;
}
