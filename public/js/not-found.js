// 404 page: the message is in the HTML; this adds the site's header, footer and theme.
import { renderChrome } from './chrome.js';
import { getJson } from './data.js';

getJson('/api/status')
  .then((status) => renderChrome(status, { current: null }))
  .catch((err) => console.error('Loading page settings failed:', err));
