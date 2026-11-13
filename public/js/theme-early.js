// Loaded as a plain (blocking) script in <head>, before the page draws, so a visitor
// who picked Light or Dark doesn't see a flash of the other theme. theme.js does the rest.
(function () {
  try {
    var theme = localStorage.getItem('status-theme');
    if (theme === 'light' || theme === 'dark' || theme === 'auto') {
      document.documentElement.style.colorScheme = theme === 'auto' ? 'light dark' : theme;
    }
  } catch (e) {
    // storage unavailable: the configured theme applies once the page loads
  }
})();
