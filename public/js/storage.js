// A visitor's remembered choices (theme, layout). Storage can be unavailable (privacy
// modes, embedded views); the choice then lasts for the visit.

/** The stored value for `key` if it's one of `allowed`, else null. */
export function readChoice(key, allowed) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeChoice(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: see above
  }
}
