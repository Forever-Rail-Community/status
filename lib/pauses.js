// Pausing a route: an admin marks a pausable component as switched off on purpose.
// While paused it shows "Not running" whatever its monitor says, and paused days
// don't count toward uptime. Each pause is a row; ended_at is null while it lasts.

import { NotFoundError, ValidationError } from './incidents.js';
import { toIso } from './util.js';

const toPause = (row) => ({
  component: row.component_id,
  startedAt: toIso(row.started_at),
  endedAt: toIso(row.ended_at),
});

/** Pauses still going, or that ended within the last `days`, oldest first. */
export async function listPauses(db, { days }) {
  const rows = await db.query(
    `select component_id, started_at, ended_at from component_pauses
      where ended_at is null or ended_at > now() - make_interval(days => $1)
      order by started_at`,
    [days],
  );
  return rows.map(toPause);
}

/** `id` must be a pausable component (pass the set from pausableComponents). */
function assertPausable(id, pausableIds) {
  if (typeof id !== 'string' || !pausableIds.has(id)) throw new ValidationError('That component can\'t be paused.');
}

/** Pause a component. Pausing one that's already paused is a no-op. */
export async function pauseComponent(db, id, author, pausableIds) {
  assertPausable(id, pausableIds);
  await db.query(
    `insert into component_pauses (component_id, author) values ($1, $2)
     on conflict (component_id) where ended_at is null do nothing`,
    [id, author],
  );
}

/** Resume a paused component; NotFoundError when it isn't paused. */
export async function resumeComponent(db, id, pausableIds) {
  assertPausable(id, pausableIds);
  const rows = await db.query(
    `update component_pauses set ended_at = now() where component_id = $1 and ended_at is null returning id`,
    [id],
  );
  if (rows.length === 0) throw new NotFoundError('That component isn\'t paused.');
}
