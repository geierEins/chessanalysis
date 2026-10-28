// Shared "[title] username (rating) [flag] [status] [league]" rendering: the
// username is bold, the rating and its parentheses are not - used wherever a
// player's name is shown as text (board top/bottom labels, the accuracy table
// header).

export function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Chess.com's pseudo-codes for regions without an ISO code, mapped to
// flag-icons names. "XX" (International) and other unknown X-codes get no flag.
const PSEUDO_COUNTRY_FLAGS = { XE: 'gb-eng', XS: 'gb-sct', XW: 'gb-wls', XC: 'es-ct', XG: 'es-ga', XB: 'es-pv' };
const PSEUDO_COUNTRY_NAMES = { XE: 'England', XS: 'Schottland', XW: 'Wales', XC: 'Katalonien', XG: 'Galicien', XB: 'Baskenland' };

let regionNames;
export function countryName(code) {
  if (PSEUDO_COUNTRY_NAMES[code]) return PSEUDO_COUNTRY_NAMES[code];
  try {
    regionNames ??= new Intl.DisplayNames(['de'], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

// An image rather than a flag emoji - Windows doesn't render flag emoji (it
// shows just the two letters instead).
export function flagHtml(code) {
  if (!code) return '';
  const flag = PSEUDO_COUNTRY_FLAGS[code] ?? (/^[A-WYZ][A-Z]$/.test(code) ? code.toLowerCase() : null);
  if (!flag) return '';
  const name = escapeHtml(countryName(code));
  return ` <img class="player-flag" src="https://cdn.jsdelivr.net/npm/flag-icons@7/flags/4x3/${flag}.svg"`
    + ` alt="${name}" title="${name}" onerror="this.remove()">`;
}

function titleHtml(title) {
  return title ? `<span class="player-title" title="Titel: ${escapeHtml(title)}">${escapeHtml(title)}</span>` : '';
}

// Inline 16x16 SVGs, so the badges need no extra requests and can't break.
function badgeSvg(tooltip, body) {
  const t = escapeHtml(tooltip);
  return ` <svg class="player-badge" viewBox="0 0 16 16" role="img" aria-label="${t}"><title>${t}</title>${body}</svg>`;
}

const STATUS_BADGES = {
  premium: ['Premium-Mitglied',
    '<path fill="#f5b301" d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.3 6l4.7-.5z"/>'],
  staff: ['Chess.com-Mitarbeiter',
    '<circle fill="#81b64c" cx="8" cy="4.2" r="2.4"/><path fill="#81b64c" d="M5.6 7.2h4.8l-.8 4H6.4zM3.8 12.2h8.4v2.3H3.8z"/>'],
  mod: ['Moderator',
    '<path fill="#3b82f6" d="M8 1l6 2.2v4.3c0 3.6-2.5 6.3-6 7.5-3.5-1.2-6-3.9-6-7.5V3.2z"/>'
    + '<path fill="none" stroke="#fff" stroke-width="1.6" d="M5.3 8l1.9 1.9 3.5-3.6"/>'],
};
const CLOSED_BADGE_BODY = '<path fill="#dc2626" d="M8 1.5l7 12.5H1z"/><path fill="#fff" d="M7.3 6h1.4v4H7.3zM7.3 11h1.4v1.4H7.3z"/>';

function statusHtml(status) {
  if (!status) return '';
  if (STATUS_BADGES[status]) return badgeSvg(...STATUS_BADGES[status]);
  if (status === 'closed:fair_play_violations') return badgeSvg('Konto gesperrt (Fair-Play-Verstoß)', CLOSED_BADGE_BODY);
  if (status.startsWith('closed')) return badgeSvg('Konto geschlossen', CLOSED_BADGE_BODY);
  return ''; // "basic" - nothing worth flagging
}

const LEAGUES = {
  Wood: ['Holz', '#8b5a2b'],
  Stone: ['Stein', '#8a8f98'],
  Bronze: ['Bronze', '#cd7f32'],
  Silver: ['Silber', '#aeb6c1'],
  Crystal: ['Kristall', '#5bc0de'],
  Elite: ['Elite', '#9b59b6'],
  Champion: ['Champion', '#e74c3c'],
  Legend: ['Legende', '#f1c40f'],
};

function leagueHtml(league) {
  if (!league) return '';
  const [name, color] = LEAGUES[league] ?? [league, '#8a8f98'];
  return badgeSvg(`Liga: ${name}`,
    `<path fill="${color}" d="M4 2h8v1.5h2.2v1.3c0 1.7-1.2 3-2.9 3.2A4 4 0 0 1 9 10.3V12h2.2v2H4.8v-2H7v-1.7A4 4 0 0 1 4.7 8C3 7.8 1.8 6.5 1.8 4.8V3.5H4z"/>`);
}

/**
 * @param {{username: string, rating: number|null, country?: string|null, title?: string|null,
 *   status?: string|null, league?: string|null}} info
 * @returns {string} HTML
 */
export function formatPlayerLabelHtml(info) {
  const username = `<span class="font-bold">${escapeHtml(info.username)}</span>`;
  const label = info.rating ? `${username} (${info.rating})` : username;
  return titleHtml(info.title) + label + flagHtml(info.country) + statusHtml(info.status) + leagueHtml(info.league);
}
