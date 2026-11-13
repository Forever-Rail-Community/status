// Creates the incident tables (safe to run repeatedly).
// Usage: npm run db:migrate   (reads DATABASE_URL from .env)
import { getDb, migrate } from '../lib/db.js';

const db = getDb();
if (!db) {
  console.error('Set DATABASE_URL in .env first.');
  process.exit(1);
}

await migrate(db);
console.log('Incident tables are ready.');
