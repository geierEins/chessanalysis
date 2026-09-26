// Move history as a tree (main line + variations), so the user can branch
// off at any point during review (js/main.js's onUserDrop) without losing or
// overwriting the real game's move list. A MoveNode has the same
// move-record shape gameAnalyzer.js already produces (san, piece, flags,
// from, to, fenBefore, fenAfter, color, moveNumber, ply, plus the
// classification fields once known), with `parent`/`children`/`isMainLine`
// added on top.

let nextId = 1;

/** @param {string} fen - the starting position (the root has no move of its own). */
export function createRootNode(fen) {
  return {
    id: nextId++,
    parent: null,
    children: [],
    isMainLine: true,
    ply: 0,
    fenAfter: fen,
  };
}

/**
 * Chains gameAnalyzer.js's existing flat move records as children[0] of each
 * other under the root, tagging every node isMainLine - this is how the
 * existing (unchanged) analysis output becomes the tree's spine.
 * @param {object} rootNode
 * @param {object[]} moveRecords - analysis.moves, unchanged shape
 * @returns {object[]} the created main-line nodes, same order as moveRecords
 */
export function buildMainLineFromMoves(rootNode, moveRecords) {
  const nodes = [];
  let parent = rootNode;
  for (const move of moveRecords) {
    const node = { id: nextId++, parent, children: [], isMainLine: true, ...move };
    parent.children.push(node);
    nodes.push(node);
    parent = node;
  }
  return nodes;
}

/**
 * Appends a new child under parentNode, or returns an already-existing child
 * with the same from/to/san (re-dragging a previously-explored variation
 * reuses that node instead of duplicating it).
 * @param {object} parentNode
 * @param {object} moveData - san, piece, flags, from, to, fenBefore, fenAfter,
 *   color, moveNumber, ply (classification fields filled in later, once the
 *   background engine evaluation resolves - see js/main.js)
 */
export function addOrReuseChild(parentNode, moveData) {
  const existing = parentNode.children.find(
    (c) => c.from === moveData.from && c.to === moveData.to && c.san === moveData.san
  );
  if (existing) return existing;

  // isCollapsed only has visible meaning on a node that's actually the START
  // of a variation (parentNode.children[1+]) - js/ui/moveList.js's collapse
  // toggle only reads/writes it there, but every node gets the field so it's
  // always a plain boolean, never undefined.
  const node = { id: nextId++, parent: parentNode, children: [], isMainLine: false, isCollapsed: false, ...moveData };
  parentNode.children.push(node);
  return node;
}

/** Nearest ancestor (including the node itself) that's on the main line -
 *  the "Abzweigungspunkt" the "Zurück zur Hauptpartie" button jumps to. */
export function mainLineAncestor(node) {
  let n = node;
  while (n && !n.isMainLine) n = n.parent;
  return n;
}

/**
 * The child that continues the SAME line `node` is already on - never just
 * children[0], which is merely "whichever child was added first" and, for a
 * main-line node, is not necessarily the real game continuation. A user can
 * branch off the game's actual final position (after resignation/timeout/
 * draw - anywhere the game ended without a forced-empty move list, unlike
 * checkmate/stalemate), and since that node had zero children beforehand,
 * their invented move becomes children[0] by pure array-push happenstance -
 * without this check, that would make it render inline as if it had really
 * been played, and survive "remove all variations" entirely.
 *   - node.isMainLine: only a child that is ALSO isMainLine counts (there's
 *     at most one - the move actually played in the real game); every other
 *     child, in whatever position, is a variation - including one sitting at
 *     children[0].
 *   - otherwise (node is itself inside some variation): there's no "real
 *     game" move to distinguish, so children[0] - whichever child was
 *     explored/added first - continues this variation's own line by
 *     convention, exactly as before.
 * @returns {object|null}
 */
export function continuationChild(node) {
  if (node.isMainLine) return node.children.find((c) => c.isMainLine) ?? null;
  return node.children[0] ?? null;
}

/**
 * The node where the variation `node` belongs to actually starts (the
 * nearest ancestor, including itself, that's an "alternative" - i.e. NOT its
 * own parent's children[0]) - null if `node` is on the main line. This is
 * what the bottom "Abzweigung entfernen" button and per-row delete icon
 * operate on: deleting is scoped to the whole variation, not just one move
 * within it.
 */
export function variationStartAncestor(node) {
  let n = node;
  while (n?.parent) {
    if (n.parent.children.indexOf(n) > 0) return n;
    n = n.parent;
  }
  return null;
}

/** Removes `node` (a variation start, see variationStartAncestor) from its
 *  parent's children entirely - the whole variation, and anything the user
 *  branched off it in turn, goes with it. */
export function deleteVariation(node) {
  if (!node?.parent) return;
  node.parent.children = node.parent.children.filter((c) => c !== node);
}

/** Strips every variation from the whole tree in one go, leaving only the
 *  real main line - the bulk counterpart of deleteVariation() above (a
 *  single variation row's own ✕ icon still uses that one; this is the bottom
 *  "Alle Abzweigungen entfernen" button's). Walks via continuationChild (not
 *  blindly children[0]) specifically so a user-invented move tacked onto the
 *  game's real final position - which has no genuine isMainLine child to
 *  keep - gets discarded too, instead of being mistaken for part of the main
 *  line and left behind. */
export function deleteAllVariations(rootNode) {
  let node = rootNode;
  while (node) {
    const next = continuationChild(node);
    node.children = next ? [next] : [];
    node = next;
  }
}

/** @returns {object[]} nodes from the root down to (and including) `node`. */
export function pathFromRoot(node) {
  const path = [];
  let n = node;
  while (n) {
    path.unshift(n);
    n = n.parent;
  }
  return path;
}
