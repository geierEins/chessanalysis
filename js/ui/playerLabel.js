// Shared "username (rating)" rendering: the username is bold, the rating and
// its parentheses are not - used wherever a player's name is shown as text
// (board top/bottom labels, the accuracy table header).

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** @param {{username: string, rating: number|null}} info @returns {string} HTML */
export function formatPlayerLabelHtml(info) {
  const username = `<span class="font-bold">${escapeHtml(info.username)}</span>`;
  return info.rating ? `${username} (${info.rating})` : username;
}
