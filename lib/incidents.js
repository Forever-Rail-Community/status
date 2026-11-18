// Incidents: validation and storage.
// An incident has an impact, a current status, the components it affects,
// and a timeline of updates. It's open until an update sets status "resolved".
//
// Scheduled maintenance is an incident with a window (startsAt, endsAt). Its phase comes
// from the clock when it's read, so nothing has to run at the start or end: before the
// window it's "scheduled", during it "in progress", and after it (or once an update
// resolves it early) it's resolved.

import { STATUS } from './statuses.js';
import { isPlainObject, toIso } from './util.js';

export const IMPACTS = Object.freeze([
  STATUS.DEGRADED,
  STATUS.PARTIAL_OUTAGE,
  STATUS.MAJOR_OUTAGE,
  STATUS.MAINTENANCE,
]);

export const INCIDENT_STATUSES = Object.freeze([
  'investigating',
  'identified',
  'monitoring',
  'scheduled', // planned maintenance that hasn't started: shown, but doesn't change status
  'in_progress',
  'resolved',
]);

const MAX_TITLE = 200;
const MAX_WINDOW_DAYS = 14;
const MAX_MESSAGE = 5000;

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

/** Open and not merely scheduled: raises the status of the components it affects. */
export const affectsStatus = (incident) =>
  incident.resolvedAt === null && incident.status !== 'scheduled';

// ---------- validation ----------

const invalid = (message) => {
  throw new ValidationError(message);
};

function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${field} is required`);
  if (value.length > max) invalid(`${field} must be at most ${max} characters`);
  return value.trim();
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) invalid(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function componentIds(value, knownIds) {
  if (!Array.isArray(value)) invalid('components must be a list');
  const unknown = value.filter((id) => !knownIds.has(id));
  if (unknown.length) invalid(`unknown components: ${unknown.join(', ')}`);
  return [...new Set(value)];
}

function time(value, field) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) invalid(`${field} must be a date and time`);
  return new Date(ms).toISOString();
}

/** A maintenance window: both ends, end after start, at most two weeks long. */
function maintenanceWindow(input) {
  const startsAt = time(input.startsAt, 'start');
  const endsAt = time(input.endsAt, 'end');
  const length = Date.parse(endsAt) - Date.parse(startsAt);
  if (length <= 0) invalid('end must be after the start');
  if (length > MAX_WINDOW_DAYS * 86_400_000) invalid(`a maintenance window can be at most ${MAX_WINDOW_DAYS} days`);
  return { startsAt, endsAt };
}

/**
 * A new incident, or with startsAt/endsAt, scheduled maintenance (impact maintenance; its
 * status follows the window).
 */
export function parseNewIncident(input, knownIds, now = Date.now()) {
  if (!isPlainObject(input)) invalid('expected a JSON object');
  const common = {
    title: text(input.title, 'title', MAX_TITLE),
    components: componentIds(input.components ?? [], knownIds),
    message: text(input.message, 'message', MAX_MESSAGE),
  };
  if ('startsAt' in input || 'endsAt' in input) {
    const window = maintenanceWindow(input);
    if (Date.parse(window.endsAt) <= now) invalid('that window has already ended');
    const status = Date.parse(window.startsAt) > now ? 'scheduled' : 'in_progress';
    return { ...common, impact: STATUS.MAINTENANCE, status, window };
  }
  return {
    ...common,
    impact: oneOf(input.impact, 'impact', IMPACTS),
    status: oneOf(input.status, 'status', INCIDENT_STATUSES),
    window: null,
  };
}

export function parseIncidentEdit(input, knownIds) {
  if (!isPlainObject(input)) invalid('expected a JSON object');
  const edit = {};
  if ('title' in input) edit.title = text(input.title, 'title', MAX_TITLE);
  if ('impact' in input) edit.impact = oneOf(input.impact, 'impact', IMPACTS);
  if ('components' in input) edit.components = componentIds(input.components, knownIds);
  // Moving or extending a window (only on scheduled maintenance; see editIncident).
  if ('startsAt' in input || 'endsAt' in input) edit.window = maintenanceWindow(input);
  if (Object.keys(edit).length === 0) invalid('nothing to change');
  return edit;
}

export function parseIncidentUpdate(input) {
  if (!isPlainObject(input)) invalid('expected a JSON object');
  return {
    status: oneOf(input.status, 'status', INCIDENT_STATUSES),
    message: text(input.message, 'message', MAX_MESSAGE),
  };
}

export function parseIncidentId(raw) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new NotFoundError('incident not found');
  return id;
}

// ---------- storage ----------


const SELECT_WITH_UPDATES = `
  select i.id, i.title, i.impact, i.status, i.components, i.created_at, i.resolved_at,
         i.starts_at, i.ends_at,
         coalesce(
           json_agg(
             json_build_object('id', u.id, 'status', u.status, 'message', u.message,
                               'author', u.author, 'createdAt', u.created_at)
             order by u.created_at desc, u.id desc
           ) filter (where u.id is not null),
           '[]'
         ) as updates
    from incidents i
    left join incident_updates u on u.incident_id = i.id`;

/**
 * Status and resolution as of `now`. A maintenance window that has ended counts as resolved
 * at its end; before its start it's scheduled. Ordinary incidents are as stored.
 */
function phase(row, now) {
  if (!row.starts_at) return { status: row.status, resolvedAt: toIso(row.resolved_at) };
  const endsAt = new Date(row.ends_at).getTime();
  const resolvedAt = row.resolved_at ?? (endsAt <= now ? row.ends_at : null);
  if (resolvedAt) return { status: 'resolved', resolvedAt: toIso(resolvedAt) };
  if (new Date(row.starts_at).getTime() > now) return { status: 'scheduled', resolvedAt: null };
  return { status: row.status === 'scheduled' ? 'in_progress' : row.status, resolvedAt: null };
}

function toIncident(row, { withAuthors, now }) {
  const window = row.starts_at ? { startsAt: toIso(row.starts_at), endsAt: toIso(row.ends_at) } : null;
  return {
    id: Number(row.id),
    title: row.title,
    impact: row.impact,
    ...phase(row, now),
    components: row.components ?? [],
    createdAt: toIso(row.created_at),
    // When it began affecting things: the window's start for maintenance (strips and uptime use this).
    startedAt: window?.startsAt ?? toIso(row.created_at),
    window,
    updates: row.updates.map((u) => ({
      id: Number(u.id),
      status: u.status,
      message: u.message,
      ...(withAuthors ? { author: u.author } : {}),
      createdAt: toIso(u.createdAt),
    })),
  };
}

/**
 * Open incidents plus those resolved within `days` (a maintenance window counts as resolved
 * at its end), newest first. Authors (Discord usernames) are only included for the admin area.
 */
export async function listIncidents(db, { days, withAuthors = false, now = Date.now() }) {
  const rows = await db.query(
    `${SELECT_WITH_UPDATES}
      where coalesce(i.resolved_at, i.ends_at) is null
         or coalesce(i.resolved_at, i.ends_at) > to_timestamp($2 / 1000.0) - make_interval(days => $1)
      group by i.id
      order by coalesce(i.starts_at, i.created_at) desc`,
    [days, now],
  );
  return rows.map((row) => toIncident(row, { withAuthors, now }));
}

export async function getIncident(db, id, { now = Date.now() } = {}) {
  const rows = await db.query(`${SELECT_WITH_UPDATES} where i.id = $1 group by i.id`, [id]);
  if (rows.length === 0) throw new NotFoundError('incident not found');
  return toIncident(rows[0], { withAuthors: false, now });
}

/** Creates the incident and its first update in one statement. Returns the new id. */
export async function createIncident(db, incident, author) {
  const rows = await db.query(
    `with created as (
       insert into incidents (title, impact, status, components, resolved_at, starts_at, ends_at)
       values ($1, $2, $3, $4, case when $3 = 'resolved' then now() end, $7, $8)
       returning id
     )
     insert into incident_updates (incident_id, status, message, author)
     select id, $3, $5, $6 from created
     returning incident_id`,
    [incident.title, incident.impact, incident.status, incident.components, incident.message, author,
      incident.window?.startsAt ?? null, incident.window?.endsAt ?? null],
  );
  return Number(rows[0].incident_id);
}

/** Posts an update and moves the incident to its status (resolving or reopening it). */
export async function addIncidentUpdate(db, id, update, author) {
  const rows = await db.query(
    `with changed as (
       update incidents
          set status = $2,
              resolved_at = case when $2 = 'resolved' then coalesce(resolved_at, now()) end
        where id = $1
        returning id
     )
     insert into incident_updates (incident_id, status, message, author)
     select id, $2, $3, $4 from changed
     returning incident_id`,
    [id, update.status, update.message, author],
  );
  if (rows.length === 0) throw new NotFoundError('incident not found');
}

/** A new window only applies to scheduled maintenance (an incident that already has one). */
export async function editIncident(db, id, edit) {
  const rows = await db.query(
    `update incidents
        set title = coalesce($2, title),
            impact = coalesce($3, impact),
            components = coalesce($4::text[], components),
            starts_at = coalesce($5, starts_at),
            ends_at = coalesce($6, ends_at)
      where id = $1 and ($5::timestamptz is null or starts_at is not null)
      returning id`,
    [id, edit.title ?? null, edit.impact ?? null, edit.components ?? null,
      edit.window?.startsAt ?? null, edit.window?.endsAt ?? null],
  );
  if (rows.length === 0) {
    const exists = edit.window && (await db.query('select 1 from incidents where id = $1', [id])).length > 0;
    if (exists) throw new ValidationError('only scheduled maintenance has a window to change');
    throw new NotFoundError('incident not found');
  }
}

export async function deleteIncident(db, id) {
  const rows = await db.query('delete from incidents where id = $1 returning id', [id]);
  if (rows.length === 0) throw new NotFoundError('incident not found');
}
