// Which checkmate pattern a game ended with - from the final position and the
// mating move alone, no engine (see docs/superpowers/specs/2026-11-23-matt-arten-design.md).
// Used by js/meta/metaRecords.js's buildFastRecord for every game ending in "#".

import { Chess } from '../chessLib.js';

const FILES = 'abcdefgh';
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** 'e4' -> [file 0-7, rank 0-7] */
const coords = (sq) => [FILES.indexOf(sq[0]), Number(sq[1]) - 1];
const name = (f, r) => `${FILES[f]}${r + 1}`;
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
/** chess.js board(): row 0 = rank 8. */
const at = (board, f, r) => (onBoard(f, r) ? board[7 - r][f] : null);

/** Does the piece standing on (f, r) attack (tf, tr)? */
function attacks(board, f, r, tf, tr) {
  const p = at(board, f, r);
  if (!p) return false;
  const df = tf - f;
  const dr = tr - r;
  if (p.type === 'p') return Math.abs(df) === 1 && dr === (p.color === 'w' ? 1 : -1);
  if (p.type === 'n') return KNIGHT.some(([a, b]) => a === df && b === dr);
  if (p.type === 'k') return Math.max(Math.abs(df), Math.abs(dr)) === 1;
  const straight = df === 0 || dr === 0;
  const diagonal = Math.abs(df) === Math.abs(dr);
  if (!(df || dr)) return false;
  if ((p.type === 'r' && !straight) || (p.type === 'b' && !diagonal) || (p.type === 'q' && !straight && !diagonal)) return false;
  const sf = Math.sign(df);
  const sr = Math.sign(dr);
  for (let x = f + sf, y = r + sr; x !== tf || y !== tr; x += sf, y += sr) {
    if (at(board, x, y)) return false;
  }
  return true;
}

/** Squares of `byColor`'s pieces attacking `square` (chess.js board()). */
export function checkers(board, square, byColor) {
  const [tf, tr] = coords(square);
  const out = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = at(board, f, r);
      if (p && p.color === byColor && attacks(board, f, r, tf, tr)) out.push(name(f, r));
    }
  }
  return out;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = at(board, f, r);
      if (p && p.type === 'k' && p.color === color) return name(f, r);
    }
  }
  return null;
}

/**
 * @param {string} fen the final (mated) position
 * @param {{from: string, to: string, piece: string, color: string, flags: string, promotion?: string}} move the mating move (chess.js verbose)
 * @param {{standardStart?: boolean, moveNumber?: number}} [opts] standardStart: the game began from the
 *   initial position; moveNumber: the mating side's own move number (both only matter for Schäfermatt)
 * @returns {{type: string, piece: string, doubleCheck: boolean, discovered: boolean, promotion: boolean}|null}
 *   null if the position isn't checkmate
 */
export function detectMate(fen, move, opts = {}) {
  let chess;
  try {
    chess = new Chess(fen);
    if (!chess.in_checkmate()) return null;
  } catch {
    return null;
  }
  const result = { type: 'other', piece: move?.promotion ?? move?.piece ?? 'q', doubleCheck: false, discovered: false, promotion: Boolean(move?.promotion) };
  try {
    const board = chess.board();
    const defender = chess.turn();
    const attacker = defender === 'w' ? 'b' : 'w';
    const kingSq = findKing(board, defender);
    const checks = checkers(board, kingSq, attacker);
    result.doubleCheck = checks.length > 1;
    result.discovered = checks.some((sq) => sq !== move.to);
    const [mf, mr] = coords(result.doubleCheck ? move.to : checks[0]);
    result.piece = at(board, mf, mr).type;
    result.type = classify({ board, chess, defender, attacker, kingSq, checks, move, opts, piece: result.piece }) ?? 'other';
  } catch {
    // Never fails loading a game - an odd position just stays "Sonstiges Matt".
  }
  return result;
}

/** The 12 patterns in checking order - the first one that fits wins - then 'other'. */
export const MATE_TYPES = ['scholars', 'smothered', 'kq', 'kr', 'arabian', 'anastasia', 'epaulette', 'dovetail', 'kiss', 'ladder', 'backrank', 'pawn', 'other'];

const HEAVY = new Set(['r', 'q']);

/** The pattern's id, or null for "Sonstiges Matt". c: what detectMate found out. */
function classify(c) {
  const { board, defender, attacker, kingSq, checks, move, opts, piece } = c;
  const [kf, kr] = coords(kingSq);
  // The checking piece - in a double check the moved one.
  const [cf, cr] = coords(checks.length > 1 ? move.to : checks[0]);
  const own = (f, r) => at(board, f, r)?.color === defender;
  const pieces = (color) => {
    const out = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = at(board, f, r);
      if (p?.color === color) out.push({ ...p, f, r });
    }
    return out;
  };
  const att = pieces(attacker);
  const def = pieces(defender);
  // Defended by another attacking piece (the king included).
  const guarded = (f, r, by = null) => att.some((p) => (p.f !== f || p.r !== r) && (!by || by.includes(p.type)) && attacks(board, p.f, p.r, f, r));
  const adjacent = Math.max(Math.abs(cf - kf), Math.abs(cr - kr)) === 1;
  const diagonal = Math.abs(cf - kf) === Math.abs(cr - kr);
  const edgeFile = kf === 0 || kf === 7;
  const edgeRank = kr === 0 || kr === 7;
  const onlyKingAnd = (t) => def.length === 1 && att.length === 2 && att.some((p) => p.type === t);
  const neighbours = KING.map(([a, b]) => [kf + a, kr + b]);

  const tests = {
    scholars: () => opts.standardStart && (opts.moveNumber ?? 99) <= 10 && piece === 'q' && move.flags?.includes('c')
      && name(cf, cr) === (defender === 'b' ? 'f7' : 'f2') && guarded(cf, cr, ['b']),
    smothered: () => piece === 'n' && neighbours.every(([f, r]) => !onBoard(f, r) || own(f, r)),
    kq: () => onlyKingAnd('q'),
    kr: () => onlyKingAnd('r'),
    arabian: () => edgeFile && edgeRank && piece === 'r' && adjacent && !diagonal && guarded(cf, cr, ['n']),
    anastasia: () => {
      if (!edgeFile || !HEAVY.has(piece) || cf !== kf) return false;
      const inner = kf === 0 ? 1 : 6;
      const besides = [kr - 1, kr, kr + 1].filter((r) => r >= 0 && r < 8);
      return besides.some((r) => own(inner, r)) && att.some((p) => p.type === 'n' && besides.some((r) => attacks(board, p.f, p.r, inner, r)));
    },
    epaulette: () => {
      if (piece !== 'q' || adjacent) return false;
      if (cf === kf) return onBoard(kf - 1, kr) && onBoard(kf + 1, kr) && own(kf - 1, kr) && own(kf + 1, kr);
      if (cr === kr) return onBoard(kf, kr - 1) && onBoard(kf, kr + 1) && own(kf, kr - 1) && own(kf, kr + 1);
      return false;
    },
    dovetail: () => {
      if (piece !== 'q' || !adjacent || !diagonal || !guarded(cf, cr)) return false;
      const sf = Math.sign(kf - cf); // away from the queen
      const sr = Math.sign(kr - cr);
      return onBoard(kf + sf, kr) && onBoard(kf, kr + sr) && own(kf + sf, kr) && own(kf, kr + sr);
    },
    kiss: () => piece === 'q' && adjacent && guarded(cf, cr),
    ladder: () => {
      if (!HEAVY.has(piece)) return false;
      const helper = (onLine) => att.some((p) => HEAVY.has(p.type) && (p.f !== cf || p.r !== cr) && onLine(p));
      if (edgeRank && cr === kr) return helper((p) => p.r === (kr === 7 ? 6 : 1));
      if (edgeFile && cf === kf) return helper((p) => p.f === (kf === 7 ? 6 : 1));
      return false;
    },
    backrank: () => {
      const home = defender === 'w' ? 0 : 7;
      if (kr !== home || !HEAVY.has(piece) || cr !== kr) return false;
      const front = home === 0 ? 1 : 6;
      return [kf - 1, kf, kf + 1].filter((f) => onBoard(f, front)).every((f) => own(f, front));
    },
    pawn: () => piece === 'p' && !move.promotion,
  };
  return MATE_TYPES.find((t) => tests[t]?.()) ?? null;
}
