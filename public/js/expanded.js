// Remembers which collapsible sections the visitor opened or closed, so the
// once-a-minute re-render doesn't undo their choice. Each <details> carries a
// data-key; sections nobody has touched use their own default.

export function createExpandedState() {
  const choices = new Map(); // data-key → open?

  return {
    isOpen: (key, fallback) => choices.get(key) ?? fallback,

    /** Track toggles inside `container` (`toggle` doesn't bubble, so listen in the capture phase). */
    track(container) {
      container.addEventListener('toggle', ({ target }) => {
        const { key } = target.dataset ?? {};
        if (key) choices.set(key, target.open);
      }, true);
    },
  };
}
