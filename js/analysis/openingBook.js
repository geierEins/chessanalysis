// Opening book, backed by Lichess's published chess-openings ECO database
// (openingBookData.js, ~3800 named variations): flags early moves as "Book"
// for move classification, and separately looks up the opening's name for
// display (openingNameForLine()) - both read the same trie, since "is this
// still book" and "what's it called" are really the same underlying data.

import { ECO_LINES } from './openingBookData.js';

function buildTrie() {
  const root = {};
  for (const { moves, name } of ECO_LINES) {
    let node = root;
    for (const san of moves.split(' ')) {
      node = node[san] ?? (node[san] = {});
    }
    // A SAN move never happens to be literally "name", so this can't collide
    // with a child-move key.
    node.name = name;
  }
  return root;
}

const BOOK_TRIE = buildTrie();
// The deepest named variations in the ECO data run to 36 plies - a generous
// cap here is still cheap since the trie itself ends recognition the moment
// a played move diverges from every known line, well before this is reached.
const MAX_BOOK_PLY = 40;

/**
 * Tracks book membership move-by-move through a single game.
 */
export function createBookTracker() {
  let node = BOOK_TRIE;
  let ply = 0;
  return {
    /** @param {string} san - move in SAN as returned by chess.js */
    feed(san) {
      ply += 1;
      if (!node || ply > MAX_BOOK_PLY) {
        node = null;
        return false;
      }
      const next = node[san];
      if (!next) {
        node = null;
        return false;
      }
      node = next;
      return true;
    },
  };
}

/**
 * The name of the opening reached so far along a line of SAN moves - the
 * deepest named node along that exact path, which "sticks" once the game
 * goes off-book (the last known name just stops updating, matching how
 * chess.com/lichess display it) and comes back null only once nothing on
 * the path was ever named at all (e.g. still at the start position).
 * @param {string[]} sanMoves - SAN moves in order, from the game/line's start
 * @returns {string|null}
 */
export function openingNameForLine(sanMoves) {
  let node = BOOK_TRIE;
  let lastKnownName = null;
  for (const san of sanMoves) {
    const next = node?.[san];
    if (!next) break;
    node = next;
    if (node.name) lastKnownName = node.name;
  }
  return lastKnownName;
}

let linesByName = null;

/**
 * The move sequence that defines a named opening - the shortest ECO line
 * carrying exactly that name (some names label several transpositions), or,
 * for a family name with no entry of its own, the shortest of its variations.
 * Used by the meta mode's opening-board tooltips.
 * @param {string} name
 * @returns {string[]|null} SAN moves, or null if the name is unknown
 */
export function openingLine(name) {
  if (!name) return null;
  if (!linesByName) {
    linesByName = new Map();
    for (const { moves, name: n } of ECO_LINES) {
      const prev = linesByName.get(n);
      if (!prev || moves.split(' ').length < prev.split(' ').length) linesByName.set(n, moves);
    }
  }
  let moves = linesByName.get(name);
  if (!moves) {
    const prefix = `${name}:`;
    for (const [n, m] of linesByName) {
      if (n.startsWith(prefix) && (!moves || m.split(' ').length < moves.split(' ').length)) moves = m;
    }
  }
  return moves ? moves.split(' ') : null;
}
