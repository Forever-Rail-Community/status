// Prints your HetrixTools monitors so you can copy IDs into status.config.js.
// Usage: npm run monitors   (reads HETRIX_API_KEY from .env)
import { fetchAllMonitors } from '../lib/hetrix.js';

const apiKey = process.env.HETRIX_API_KEY;
if (!apiKey) {
  console.error('Set HETRIX_API_KEY in .env first.');
  process.exit(1);
}

const monitors = await fetchAllMonitors({ apiKey });
for (const m of monitors) {
  console.log(`${m.id}  ${String(m.uptime_status ?? '?').padEnd(4)}  ${m.name}`);
}
console.log(`\n${monitors.length} monitor(s)`);
