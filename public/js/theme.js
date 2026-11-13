// Applies the `theme` and `accent` options from status.config.js.

const SCHEMES = { dark: 'dark', light: 'light', auto: 'light dark' };

// Dark text on light accents, white text on dark ones (WCAG relative luminance).
function textColorOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141414' : '#ffffff';
}

export function applyTheme({ theme, accent }) {
  const root = document.documentElement.style;
  root.colorScheme = SCHEMES[theme] ?? SCHEMES.dark;
  if (accent) {
    root.setProperty('--accent', accent);
    root.setProperty('--on-accent', textColorOn(accent));
  }
}
