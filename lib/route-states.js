// Route states, set by an admin in /admin: Up, Down or Paused (switched off on purpose).
// Each Down or Paused period is a row; Up is the absence of an open row. Keeping the
// periods (not just the current state) lets the strips and uptime show past days.

import { ValidationError } from './incidents.js';
import { toIso } from './util.js';

export const ROUTE_STATES = ['up', 'down', 'paused'];

const toPeriod = (row) => ({
  component: row.component_id,
  state: row.state,
  startedAt: toIso(row.started_at),
  endedAt: toIso(row.ended_at),
});

/** Down / Paused periods still going, or that ended within the last `days`, oldest first. */
export async function listRouteStates(db, { days }) {
  const rows = await db.query(
    `select component_id, state, started_at, ended_at from route_states
      where ended_at is null or ended_at > now() - make_interval(days => $1)
      order by started_at`,
    [days],
  );
  return rows.map(toPeriod);
}

/** id → { state, since } for routes that are Down or Paused now (absent = Up). */
export async function currentRouteStates(db) {
  const rows = await db.query(`select component_id, state, started_at from route_states where ended_at is null`);
  return Object.fromEntries(rows.map((r) => [r.component_id, { state: r.state, since: toIso(r.started_at) }]));
}

/**
 * Set a route's state. Setting the state it's already in changes nothing (keeps its "since").
 * @param routeIds  ids of route components (from routeComponents)
 */
export async function setRouteState(db, { component, state, author }, routeIds) {
  if (typeof component !== 'string' || !routeIds.has(component)) throw new ValidationError('That component isn\'t a route.');
  if (!ROUTE_STATES.includes(state)) throw new ValidationError(`State must be one of: ${ROUTE_STATES.join(', ')}.`);

  // End the current period if the state changes (setting the same state keeps its "since").
  await db.query(
    `update route_states set ended_at = now() where component_id = $1 and ended_at is null and state <> $2`,
    [component, state],
  );
  // Then start the new one, unless it's Up. The unique index allows one open period per
  // route, so a double click can't create two.
  if (state !== 'up') {
    await db.query(
      `insert into route_states (component_id, state, author) values ($1, $2, $3)
       on conflict (component_id) where ended_at is null do nothing`,
      [component, state, author],
    );
  }
}
