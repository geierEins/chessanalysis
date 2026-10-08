// Move sound effects, triggered from js/main.js's goToNode() whenever
// navigation lands on a different node (i.e. a move was actually "played" or
// stepped back to), and playIllegalMoveSound() from handleUserDrop whenever
// a dragged move is rejected as illegal.

const SOUND_FILES = {
  moveSelf: 'sounds/move-self.mp3',
  moveOpponent: 'sounds/move-opponent.mp3',
  capture: 'sounds/capture.mp3',
  castle: 'sounds/castle.mp3',
  check: 'sounds/move-check.mp3',
  gameEnd: 'sounds/game-end.mp3',
  illegal: 'sounds/illegal.mp3',
};

// Eagerly created up front (not lazily on first play) with explicit preload,
// so the browser has already fetched/buffered every sound well before any of
// them are actually needed - matters most for illegal.mp3, which has to play
// with no perceptible delay right as a rejected drag snaps back.
const audioByKey = Object.fromEntries(
  Object.entries(SOUND_FILES).map(([key, src]) => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    return [key, audio];
  })
);

// Toggled from the settings popover (js/ui/settingsPanel.js) - muting just
// skips playback, the preloaded Audio objects above stay as they are.
let soundEnabled = true;

/** @param {boolean} enabled */
export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}

function play(key) {
  if (!soundEnabled) return;
  const audio = audioByKey[key];
  // Restarts from the top even if still playing from a moment ago - matters
  // for illegal.mp3 especially, when several rejected attempts land in
  // quick succession.
  audio.currentTime = 0;
  // Autoplay/rapid-navigation rejections are expected sometimes and harmless
  // to ignore - a missed sound effect isn't worth surfacing as an error.
  audio.play().catch(() => {});
}

/**
 * Picks and plays the single sound for one played move, in priority order:
 * reaching the game's actual final ply always wins (checkmate, timeout,
 * resignation, draw - any way the game could have ended), then check, then
 * castling, then a plain capture, then a plain move. Castle/capture are read
 * from chess.js's own move `flags` ("k"/"q" castle, "c"/"e" capture/en
 * passant) rather than parsed out of `san`'s text - san's exact formatting
 * isn't something to depend on when a flag exists for the same thing.
 * @param {{san: string, flags: string, color: 'w'|'b'}} move
 * @param {{isFinalPly: boolean, isOwnMove: boolean}} context
 */
export function playMoveSound(move, { isFinalPly, isOwnMove }) {
  let key;
  if (isFinalPly) key = 'gameEnd';
  else if (move.san.includes('+')) key = 'check';
  else if (move.flags.includes('k') || move.flags.includes('q')) key = 'castle';
  else if (move.flags.includes('c') || move.flags.includes('e')) key = 'capture';
  else key = isOwnMove ? 'moveSelf' : 'moveOpponent';
  play(key);
}

/** A dragged move chess.js rejected as illegal (pinned piece, moving into/
 *  staying in check, wrong movement pattern for that piece, etc.) - the
 *  piece has already snapped back to its origin square by the time this is
 *  called (js/main.js's handleUserDrop). */
export function playIllegalMoveSound() {
  play('illegal');
}
