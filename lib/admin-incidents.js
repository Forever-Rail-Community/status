// Admin API handlers for incidents (wired up in api/admin/*.js).

import { componentIds } from './config.js';
import { json } from './admin.js';
import {
  INCIDENT_STATUSES,
  IMPACTS,
  addIncidentUpdate,
  createIncident,
  deleteIncident,
  editIncident,
  listIncidents,
  parseIncidentEdit,
  parseIncidentId,
  parseIncidentUpdate,
  parseNewIncident,
} from './incidents.js';

// The admin list reaches further back than the public page.
const ADMIN_HISTORY_DAYS = 90;

const idParam = (url) => parseIncidentId(url.searchParams.get('id'));

/** GET /api/admin/session: who's signed in, plus what the incident form needs. */
export const sessionHandlers = {
  GET: ({ user, config }) =>
    json({
      user,
      page: { title: config.title, theme: config.theme, accent: config.accent },
      impacts: IMPACTS,
      statuses: INCIDENT_STATUSES,
      groups: config.groups.map((g) => ({
        name: g.name,
        components: g.components.map((c) => ({ id: c.id, name: c.name ?? c.id })),
      })),
    }),
};

/** /api/admin/incidents */
export const incidentHandlers = {
  GET: async ({ db }) =>
    json({ incidents: await listIncidents(db, { days: ADMIN_HISTORY_DAYS, withAuthors: true }) }),

  POST: async ({ db, config, body, user }) => {
    const id = await createIncident(db, parseNewIncident(body, componentIds(config)), user.name);
    return json({ id }, 201);
  },

  PATCH: async ({ db, config, body, url }) => {
    await editIncident(db, idParam(url), parseIncidentEdit(body, componentIds(config)));
    return json({ ok: true });
  },

  DELETE: async ({ db, url }) => {
    await deleteIncident(db, idParam(url));
    return json({ ok: true });
  },
};

/** /api/admin/incident-updates?id=… */
export const updateHandlers = {
  POST: async ({ db, body, url, user }) => {
    await addIncidentUpdate(db, idParam(url), parseIncidentUpdate(body), user.name);
    return json({ ok: true }, 201);
  },
};
