// Shared fallback avatar used wherever a Chess.com player has no profile
// picture set, so the layout never shows an empty gap.
const DEFAULT_AVATAR = 'icons/png/no-user-picture.png';

/**
 * @param {HTMLImageElement} img
 * @param {string|null|undefined} avatarUrl
 * @param {'w'|'b'} [color] - which side this player played, shown as a
 *   matching ring around the avatar so it's clear at a glance without
 *   reading the username/rating text next to it.
 */
export function setAvatar(img, avatarUrl, color) {
  img.src = avatarUrl || DEFAULT_AVATAR;
  img.classList.remove('hidden');
  img.classList.toggle('avatar-ring-white', color === 'w');
  img.classList.toggle('avatar-ring-black', color === 'b');
}
