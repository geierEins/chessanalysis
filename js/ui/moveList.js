import { setAvatar } from './avatar.js';
import { continuationChild } from '../analysis/moveTree.js';

export class MoveList {
  #container;
  #strip;
  #onSelect;
  #onDeleteVariation;
  #itemsByNodeId = new Map();
  #stripItemsByNodeId = new Map();
  #avatarEl = {
    w: document.getElementById('move-list-avatar-white'),
    b: document.getElementById('move-list-avatar-black'),
  };

  /**
   * @param {string} containerId - the desktop vertical list (<ol>)
   * @param {(node: object) => void} onSelect - called with the clicked MoveNode (js/analysis/moveTree.js)
   * @param {string} [stripId] - the mobile horizontal strip (<ol>), if present
   * @param {(node: object) => void} [onDeleteVariation] - called with a variation's start MoveNode
   */
  constructor(containerId, onSelect, stripId, onDeleteVariation) {
    this.#container = document.getElementById(containerId);
    this.#strip = stripId ? document.getElementById(stripId) : null;
    this.#onSelect = onSelect;
    this.#onDeleteVariation = onDeleteVariation;
  }

  /** @param {{white: {avatar: string|null}, black: {avatar: string|null}}} players */
  setPlayers(players) {
    // No color argument - unlike every other setAvatar() call in this app,
    // this one shouldn't get the white/black ring (just the plain avatar).
    for (const [color, info] of [['w', players.white], ['b', players.black]]) {
      setAvatar(this.#avatarEl[color], info.avatar);
    }
  }

  #newRow(container, numberText, includeEmptyWhiteColumn) {
    const row = document.createElement('li');
    row.className = 'grid grid-cols-[2.25rem_1fr_1fr] gap-2';
    const numberSpan = document.createElement('span');
    numberSpan.className = 'text-neutral-500 text-right';
    numberSpan.textContent = numberText;
    row.appendChild(numberSpan);
    if (includeEmptyWhiteColumn) row.appendChild(document.createElement('span'));
    container.appendChild(row);
    return row;
  }

  #appendStripNumber(numberText) {
    if (!this.#strip) return;
    const numberSpan = document.createElement('li');
    numberSpan.className = 'move-strip-number';
    numberSpan.textContent = numberText;
    this.#strip.appendChild(numberSpan);
  }

  #createMoveItem(node, className, iconClassName) {
    const item = document.createElement(className === 'move-strip-item' ? 'li' : 'span');
    item.className = className;
    item.style.color = node.category?.color ?? '';
    item.title = node.category?.label ?? '';
    const icon = node.category
      ? `<img src="${node.category.icon}" alt="${node.category.label}" class="${iconClassName}"> `
      : '';
    item.innerHTML = `${icon}${node.san}`;
    item.addEventListener('click', () => this.#onSelect(node));
    return item;
  }

  /**
   * Renders one grid-row-per-move-pair line (the main line, or a single
   * variation's own body) into `container`, walking continuationChild() from
   * `startNode` to continue it - identical row mechanism for both, so a
   * variation's moves look exactly like the main line's, just inside its own
   * indented block. Every OTHER child found along the way (not just
   * children[1+] by position - see continuationChild's own comment) becomes
   * its OWN flat sibling block (#renderVariationBlock, always appended to the
   * single top-level #move-list, never nested inside `container`) - this is
   * what keeps indentation at exactly one level no matter how deep the
   * branch actually is in the tree, AND what makes a user-invented move
   * tacked onto the game's real final position (after resignation/timeout/
   * draw) render as its own indented variation too, instead of inline as if
   * it had really been played.
   */
  #renderLineRows(container, startNode) {
    let node = startNode;
    let currentRow = null;
    while (node) {
      if (node.color === 'w') {
        currentRow = this.#newRow(container, `${node.moveNumber}.`, false);
        if (container === this.#container) this.#appendStripNumber(`${node.moveNumber}.`);
      } else if (!currentRow) {
        // Line starts with Black to move (custom position, or a variation
        // that itself starts on Black) - the white column stays empty.
        currentRow = this.#newRow(container, `${node.moveNumber}…`, true);
        if (container === this.#container) this.#appendStripNumber(`${node.moveNumber}…`);
      }

      const item = this.#createMoveItem(node, 'move-list-item', 'move-list-icon');
      currentRow.appendChild(item);
      this.#itemsByNodeId.set(node.id, item);

      if (container === this.#container && this.#strip) {
        const stripItem = this.#createMoveItem(node, 'move-strip-item', 'move-strip-icon');
        this.#strip.appendChild(stripItem);
        this.#stripItemsByNodeId.set(node.id, stripItem);
      }

      const next = continuationChild(node);
      for (const child of node.children) {
        if (child !== next) this.#renderVariationBlock(child);
      }

      node = next;
    }
  }

  /**
   * A variation's own block: its body (grid rows, #renderLineRows), always
   * appended directly to the top-level #move-list so nesting depth in the
   * tree never compounds into deeper indentation. The collapse toggle and
   * delete icon are NOT a separate header line above the body - they're
   * placed (absolutely, so they don't disturb the row's own number/move
   * grid columns) directly into the body's own first row, next to the move
   * number that row already has - there's no other row left over just to
   * hold two icons with nothing else in it.
   */
  #renderVariationBlock(startNode) {
    const wrapper = document.createElement('li');
    wrapper.className = 'move-variation';

    const body = document.createElement('ol');
    body.className = 'move-variation-body';
    wrapper.appendChild(body);

    this.#renderLineRows(body, startNode);
    const firstRow = body.firstElementChild;
    firstRow.classList.add('move-variation-first-row');
    const otherRows = [...body.children].slice(1);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'move-variation-toggle';
    firstRow.appendChild(toggle);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'move-variation-delete';
    deleteBtn.title = 'Abzweigung entfernen';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#onDeleteVariation?.(startNode);
    });
    firstRow.appendChild(deleteBtn);

    // Shown after the first row's own move(s) while collapsed, in place of
    // the rest of the variation's body (otherRows) - same "there's more,
    // collapsed" signal the old separate preview line gave, just folded
    // into this row instead of its own.
    const collapsedMarker = document.createElement('span');
    collapsedMarker.className = 'move-variation-collapsed-marker';
    collapsedMarker.textContent = '(…)';
    firstRow.appendChild(collapsedMarker);

    const applyCollapsed = () => {
      toggle.textContent = startNode.isCollapsed ? '►' : '▼';
      for (const row of otherRows) row.classList.toggle('hidden', startNode.isCollapsed);
      collapsedMarker.classList.toggle('hidden', !startNode.isCollapsed);
    };
    toggle.addEventListener('click', () => {
      startNode.isCollapsed = !startNode.isCollapsed;
      applyCollapsed();
    });
    applyCollapsed();

    this.#container.appendChild(wrapper);
  }

  /** @param {object} rootNode - the move tree's root (js/analysis/moveTree.js) */
  render(rootNode) {
    this.#container.innerHTML = '';
    this.#itemsByNodeId.clear();
    if (this.#strip) {
      this.#strip.innerHTML = '';
      this.#stripItemsByNodeId.clear();
    }
    // Every OTHER node's own variations get checked inside #renderLineRows's
    // loop - but the walk there always starts AT rootNode's own continuation,
    // so rootNode itself (no move/row of its own) never goes through that
    // loop. Without this, branching on the very first move (replacing move 1
    // entirely, e.g. e5 instead of the game's real e4) created the node
    // correctly but rendered no variation block for it at all - not even the
    // indentation, despite the same tree shape as any other branch point.
    const firstMove = continuationChild(rootNode);
    for (const child of rootNode.children) {
      if (child !== firstMove) this.#renderVariationBlock(child);
    }
    if (firstMove) {
      this.#renderLineRows(this.#container, firstMove);
    }
  }

  /** @param {object|null} node - the currently-active MoveNode, or null/root for the start position */
  setActive(node) {
    for (const item of this.#itemsByNodeId.values()) item.classList.remove('active');
    const active = node && this.#itemsByNodeId.get(node.id);
    if (active) {
      active.classList.add('active');
      active.scrollIntoView({ block: 'nearest' });
    }

    if (!this.#strip) return;
    for (const item of this.#stripItemsByNodeId.values()) item.classList.remove('active');
    const activeStrip = node && this.#stripItemsByNodeId.get(node.id);
    if (activeStrip) {
      activeStrip.classList.add('active');
      activeStrip.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }
}
