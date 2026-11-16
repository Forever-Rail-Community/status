// Database access. Everything else talks to `db.query(text, params) → rows`,
// so tests can swap in any Postgres client.

import { neon } from '@neondatabase/serverless';

let client = null;

export const isDatabaseConfigured = () => Boolean(process.env.DATABASE_URL);

/** Neon over HTTP: no connection pool to manage in serverless functions. */
export function getDb() {
  if (!isDatabaseConfigured()) return null;
  if (!client) {
    const sql = neon(process.env.DATABASE_URL);
    client = { query: (text, params = []) => sql.query(text, params) };
  }
  return client;
}

// Each statement runs separately (Neon's HTTP driver takes one statement per call).
export const SCHEMA = [
  `create table if not exists incidents (
     id          bigserial primary key,
     title       text not null,
     impact      text not null,
     status      text not null,
     components  text[] not null default '{}',
     created_at  timestamptz not null default now(),
     resolved_at timestamptz
   )`,
  `create table if not exists incident_updates (
     id          bigserial primary key,
     incident_id bigint not null references incidents (id) on delete cascade,
     status      text not null,
     message     text not null,
     author      text,
     created_at  timestamptz not null default now()
   )`,
  `create index if not exists incident_updates_incident_idx
     on incident_updates (incident_id, created_at)`,
  // Route states set in /admin (Up / Down / Paused). A row is a Down or Paused period;
  // ended_at null = the route is in that state now. No open row = Up.
  // An earlier version had a pause-only table: it's renamed and its rows kept as Paused.
  `alter table if exists component_pauses rename to route_states`,
  `create table if not exists route_states (
     id           bigserial primary key,
     component_id text not null,
     state        text not null,
     started_at   timestamptz not null default now(),
     ended_at     timestamptz,
     author       text
   )`,
  `alter table route_states add column if not exists state text not null default 'paused'`,
  `drop index if exists component_pauses_open_idx`,
  `create unique index if not exists route_states_open_idx
     on route_states (component_id) where ended_at is null`,
];

export async function migrate(db) {
  for (const statement of SCHEMA) await db.query(statement);
}
