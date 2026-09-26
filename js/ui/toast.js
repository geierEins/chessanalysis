// Lightweight toast notifications - replaces the old #loader-message inline
// text in the top bar. Toasts float over the page (fixed position) instead
// of taking up flow space, so they can never push the top bar into a second
// line no matter how long the message is.

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/**
 * @param {string} message
 * @param {'error'|'info'|'success'} [type]
 * @param {number} [duration] ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 4000) {
  const root = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  // Next frame, so the transition (opacity/transform, see styles.css) has a
  // starting state to animate from instead of the toast just popping in.
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  const dismiss = () => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };
  setTimeout(dismiss, duration);
  toast.addEventListener('click', dismiss);
}

/**
 * Briefly outlines a required GUI element in red (see .field-error in
 * styles.css) - for when a button needing this element's value was pressed
 * while it's still empty/unfilled, alongside a showToast() error message
 * explaining what's missing (not instead of it).
 * @param {HTMLElement} el
 * @param {number} [duration] ms before the outline is removed again
 */
export function flashFieldError(el, duration = 2000) {
  el.classList.add('field-error');
  clearTimeout(el._fieldErrorTimer);
  el._fieldErrorTimer = setTimeout(() => el.classList.remove('field-error'), duration);
}
