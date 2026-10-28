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
import { createBookTracker, openingNameForLine } from '../analysis/openingBook.js';
import { parseClockSeconds, parseInitialClockSeconds, parseIncrementSeconds } from '../analysis/pgnClock.js';
import { MATE_CP_EQUIVALENT } from '../analysis/gameAnalyzer.js';
import { computeGameAccuracy } from '../analysis/accuracy.js';

const LOSS_REASONS = { checkmated: 'checkmate', resigned: 'resign', timeout: 'timeout', abandoned: 'abandon' };
const DRAW_REASONS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

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
  other: 'Sonstiges',
};

export const PIECE_LABEL = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };

/** Games against Chess.com's coach bots (Coach-Dante, Coach-Nadia, ...) - left
 *  out of the meta mode entirely: no stats, no engine analysis. */
export const isCoachGame = (r) => /^coach-/i.test(r.opponent);

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
  const opening = openingNameForLine(sans);

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
    firstMove: sans[0] ?? null,
    bookPlies,
    initialClock,
    ownClockEnd: initialClock ? ownClockEnd : null,
    duration,
    ownMoveSeconds,
    // Own pawns that reached the last rank, whatever they turned into.
    promotions: verbose.filter((m) => m.color === color && m.promotion).length,
    captures: captureSquares(verbose, color),
    maxMaterial: material.max,
    minMaterial: material.min,
    firstMover: parser.header().FEN?.split(' ')[1] === 'b' ? 'b' : 'w',
    endsInMate: Boolean(sans[sans.length - 1]?.endsWith('#')),
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
