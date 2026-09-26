import { CATEGORIES, CATEGORY_ORDER } from '../analysis/categories.js';
import { setAvatar } from './avatar.js';
import { formatPlayerLabelHtml } from './playerLabel.js';

// FORCED isn't a quality judgment (see classification.js) - just a fact
// about the position ("only legal reply to check") - so it doesn't get its
// own row in this per-category count table, unlike CATEGORY_ORDER's other
// entries. Board badges still show it on the move itself.
const TABLE_CATEGORY_ORDER = CATEGORY_ORDER.filter((id) => id !== 'FORCED');

export class Dashboard {
  #accuracyWhiteEl;
  #accuracyBlackEl;
  #tableBody;
  #avatarEl = { w: document.getElementById('avatar-white'), b: document.getElementById('avatar-black') };
  #usernameEl = { w: document.getElementById('username-white'), b: document.getElementById('username-black') };

  constructor(accuracyWhiteId, accuracyBlackId, tableId) {
    this.#accuracyWhiteEl = document.getElementById(accuracyWhiteId);
    this.#accuracyBlackEl = document.getElementById(accuracyBlackId);
    this.#tableBody = document.querySelector(`#${tableId} tbody`);
  }

  /**
   * @param {{white: {username: string, rating: number|null, avatar: string|null}, black: {...}}} players
   */
  setPlayers(players) {
    for (const [color, info] of [['w', players.white], ['b', players.black]]) {
      this.#usernameEl[color].innerHTML = formatPlayerLabelHtml(info);
      setAvatar(this.#avatarEl[color], info.avatar, color);
    }
  }

  /** @param {{moves: Array<{color:'w'|'b', category:{id:string}}>, accuracy: {white:number, black:number}}} analysis */
  render(analysis) {
    this.#accuracyWhiteEl.textContent = formatAccuracy(analysis.accuracy.white);
    this.#accuracyBlackEl.textContent = formatAccuracy(analysis.accuracy.black);

    const counts = {};
    for (const id of TABLE_CATEGORY_ORDER) counts[id] = { w: 0, b: 0 };
    for (const move of analysis.moves) {
      if (!counts[move.category.id]) continue;
      counts[move.category.id][move.color] += 1;
    }

    this.#tableBody.innerHTML = '';
    for (const id of TABLE_CATEGORY_ORDER) {
      const category = CATEGORIES[id];
      const row = document.createElement('tr');
      row.className = 'border-t border-neutral-800';
      row.innerHTML = `
        <td class="py-2 flex items-center gap-2" style="color:${category.color}">
          <img src="${category.icon}" alt="" class="w-5 h-5"><span>${category.label}</span>
        </td>
        <td class="text-center font-medium" style="color:${category.color}">${counts[id].w}</td>
        <td class="text-center font-medium" style="color:${category.color}">${counts[id].b}</td>
      `;
      this.#tableBody.appendChild(row);
    }
  }
}

function formatAccuracy(value) {
  return value === null || value === undefined ? '–' : `${value.toFixed(1)}%`;
}
