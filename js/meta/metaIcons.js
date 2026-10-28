// One-color line icons for the Meta-Analyse's card titles and stat tiles,
// in place of the (multi-colored) emoji the titles and labels are written
// with. Drawn in currentColor, so css/styles.css gives them the tile's accent
// color (or the theme accent on a card without one). Trusted, hardcoded markup.

const svg = (body) =>
  `<svg class="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const ICONS = {
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  bars: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-1.3-1.2-1.6-1.2-2.7 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trendUp: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5V20"/>',
  medal: '<path d="M8 3l3 6M16 3l-3 6"/><circle cx="12" cy="15" r="5"/><path d="M12 13v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5c1.8.8 3 2.9 3 5.5"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5 18 3h3v3l-3.5 8.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M12 3l-1 4h2z"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-7 0-3-1.8-5.3-3.4-7-.3 2-1.4 3.1-2.6 3.6C13.2 8.2 12 5 9 2c0 4-4 6.2-4 11.5C5 18.6 8 22 12 22z"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  skull: '<path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><path d="M10.5 20v-2.5M13.5 20v-2.5"/>',
  signal: '<path d="M5 20v-3M10 20v-7M15 20V9M20 20V4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  burst: '<path d="M12 2l2 6 6-2-4 5 5 3-6 1 1 6-4-4-4 4 1-6-6-1 5-3-4-5 6 2z"/>',
  stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 1.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6v4H9z"/>',
  heartCrack: '<path d="M12 20s-8-4.9-8-10.6A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.4C20 15.1 12 20 12 20z"/><path d="M12 7l-1.5 4 3 2-1.5 3.5"/>',
  handshake: '<path d="M2 11l4-4 3.5 1.5L12 7l3.5 1.5L18 7l4 4"/><path d="M6 7l-2 8 4 3M18 7l2 8-4 3"/><path d="M9 12l3 3M11.5 10.5l3 3M8 15l2 2M16 18l-3-3"/>',
  alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M4 4 2 6M20 4l2 2M6.5 20 5 21.5M17.5 20l1.5 1.5"/>',
  ruler: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/>',
  king: '<path d="M12 2v4M10 4h4"/><path d="M6 21h12M7 21l-1-6h12l-1 6"/><path d="M6 15c-2.5-3 0-7 3-5.5L12 8l3 1.5c3-1.5 5.5 2.5 3 5.5"/>',
  hourglass: '<path d="M6 2h12M6 22h12"/><path d="M7 2c0 5 10 5.5 10 10s-10 5-10 10M17 2c0 5-10 5.5-10 10s10 5 10 10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  pawn: '<circle cx="12" cy="6" r="3"/><path d="M10 9.5 8.5 15h7L14 9.5"/><path d="M6 21h12v-2.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 6 18.5z"/>',
  gauge: '<path d="M3.5 18a9 9 0 1 1 17 0"/><path d="M12 14l4-5"/><circle cx="12" cy="14" r="1.3"/>',
  lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M14.8 9.2l3.6-3.6M5.6 18.4l3.6-3.6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  puzzle: '<path d="M4 7h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4z"/>',
};

// The emoji the titles and labels are written with -> their icon.
const BY_EMOJI = {
  '⚙️': 'gear', '🧾': 'receipt', '📊': 'bars', '🎨': 'palette', '🕑': 'clock', '🕒': 'clock',
  '📈': 'trendUp', '📉': 'trendDown', '📖': 'book', '🏅': 'medal', '👥': 'users', '⚔️': 'swords',
  '🌍': 'globe', '🗺️': 'map', '🔁': 'repeat', '💪': 'scale', '🎯': 'target', '🔥': 'flame',
  '🧮': 'calculator', '📍': 'pin', '💀': 'skull', '📶': 'signal', '🧭': 'compass', '🏁': 'flag',
  '💥': 'burst', '⏱️': 'stopwatch', '🏆': 'trophy', '💔': 'heartCrack', '🤝': 'handshake',
  '⏰': 'alarm', '📏': 'ruler', '⚡': 'zap', '👑': 'crown', '⌛': 'hourglass', '⏳': 'hourglass',
  '📅': 'calendar', '📋': 'list', '♟️': 'pawn', '🧠': 'gauge', '♛': 'crown', '♚': 'king',
  '🛟': 'lifebuoy', '🛡️': 'shield', '🎁': 'gift', '💸': 'money', '🧩': 'puzzle',
};

/** @returns {string} the icon for one of the emoji above ('' if unknown) */
export function metaIcon(emoji) {
  const name = BY_EMOJI[emoji];
  return name ? svg(ICONS[name]) : '';
}

/** A label written as "<emoji> text": the emoji swapped for its icon. */
export function iconLabel(label) {
  const space = label.indexOf(' ');
  const icon = space > 0 ? metaIcon(label.slice(0, space)) : '';
  return icon ? `${icon}${label.slice(space)}` : label;
}
