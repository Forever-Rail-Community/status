const isEmpty = (value) => value == null || value === false;

/**
 * Tiny element builder. Children may be nodes, strings (inserted as text,
 * never HTML), arrays, or null/false (skipped). null/false props and
 * dataset entries are skipped too.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (isEmpty(value)) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') Object.assign(el.style, value);
    else if (key === 'dataset') {
      for (const [name, v] of Object.entries(value)) if (!isEmpty(v)) el.dataset[name] = v;
    } else el.setAttribute(key, value === true ? '' : value);
  }

  el.append(...children.flat(Infinity).filter((c) => !isEmpty(c)));
  return el;
}

export const byId = (id) => document.getElementById(id);
