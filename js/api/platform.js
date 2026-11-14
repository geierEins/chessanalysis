// Which site games are loaded from - Chess.com (default) or Lichess - and the
// API calls of whichever is selected. js/api/lichess.js delivers Chess.com-
// shaped game objects, so summarizeGame() stays the one from chesscom.js.

import * as chesscom from './chesscom.js';
import * as lichess from './lichess.js';

export const PLATFORMS = {
  chesscom: { label: 'Chess.com', api: chesscom },
  lichess: { label: 'Lichess', api: lichess },
};

let current = 'chesscom';

/** @returns {'chesscom'|'lichess'} */
export function getPlatform() {
  return current;
}

export function setPlatform(platform) {
  current = PLATFORMS[platform] ? platform : 'chesscom';
}

export const platformLabel = () => PLATFORMS[current].label;

export const fetchRecentGames = (...args) => PLATFORMS[current].api.fetchRecentGames(...args);
export const fetchGame = (...args) => PLATFORMS[current].api.fetchGame(...args);
export const fetchPlayerProfile = (...args) => PLATFORMS[current].api.fetchPlayerProfile(...args);

/** The site a game URL belongs to - a loaded game keeps its site even after the toggle was switched. */
export const platformOfUrl = (url) => (/^https:\/\/lichess\.org\//.test(url ?? '') ? 'lichess' : 'chesscom');
export const fetchPlayerProfileFor = (gameUrl, username) => PLATFORMS[platformOfUrl(gameUrl)].api.fetchPlayerProfile(username);
