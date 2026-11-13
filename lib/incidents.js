// Incidents: validation and storage.
// An incident has an impact, a current status, the components it affects,
// and a timeline of updates. It's open until an update sets status "resolved".

import { STATUS } from './statuses.js';
import { isPlainObject } from './util.js';

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

export function parseNewIncident(input, knownIds) {
  if (!isPlainObject(input)) invalid('expected a JSON object');
  return {
    title: text(input.title, 'title', MAX_TITLE),
    impact: oneOf(input.impact, 'impact', IMPACTS),
    status: oneOf(input.status, 'status', INCIDENT_STATUSES),
    components: componentIds(input.components ?? [], knownIds),
    message: text(input.message, 'message', MAX_MESSAGE),
  };
}

export function parseIncidentEdit(input, knownIds) {
  if (!isPlainObject(input)) invalid('expected a JSON object');
  const edit = {};
  if ('title' in input) edit.title = text(input.title, 'title', MAX_TITLE);
  if ('impact' in input) edit.impact = oneOf(input.impact, 'impact', IMPACTS);
  if ('components' in input) edit.components = componentIds(input.components, knownIds);
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

const toIso = (value) => (value == null ? null : new Date(value).toISOString());

const SELECT_WITH_UPDATES = `
  select i.id, i.title, i.impact, i.status, i.components, i.created_at, i.resolved_at,
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

function toIncident(row, { withAuthors }) {
  return {
    id: Number(row.id),
    title: row.title,
    impact: row.impact,
    status: row.status,
    components: row.components ?? [],
    createdAt: toIso(row.created_at),
    resolvedAt: toIso(row.resolved_at),
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
 * Open incidents plus those resolved within `days`, newest first.
 * Authors (Discord usernames) are only included for the admin area.
 */
export async function listIncidents(db, { days, withAuthors = false }) {
  const rows = await db.query(
    `${SELECT_WITH_UPDATES}
      where i.resolved_at is null or i.resolved_at > now() - make_interval(days => $1)
      group by i.id
      order by i.created_at desc`,
    [days],
  );
  return rows.map((row) => toIncident(row, { withAuthors }));
}

/** Creates the incident and its first update in one statement. Returns the new id. */
export async function createIncident(db, incident, author) {
  const rows = await db.query(
    `with created as (
       insert into incidents (title, impact, status, components, resolved_at)
       values ($1, $2, $3, $4, case when $3 = 'resolved' then now() end)
       returning id
     )
     insert into incident_updates (incident_id, status, message, author)
     select id, $3, $5, $6 from created
     returning incident_id`,
    [incident.title, incident.impact, incident.status, incident.components, incident.message, author],
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

export async function editIncident(db, id, edit) {
  const rows = await db.query(
    `update incidents
        set title = coalesce($2, title),
            impact = coalesce($3, impact),
            components = coalesce($4::text[], components)
      where id = $1
      returning id`,
    [id, edit.title ?? null, edit.impact ?? null, edit.components ?? null],
  );
  if (rows.length === 0) throw new NotFoundError('incident not found');
}

export async function deleteIncident(db, id) {
  const rows = await db.query('delete from incidents where id = $1 returning id', [id]);
  if (rows.length === 0) throw new NotFoundError('incident not found');
}
