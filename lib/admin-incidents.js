// Admin API handlers for incidents (wired up in api/admin/*.js).

import { componentIds } from './config.js';
import { json, pageSettings } from './admin.js';
import { announceIncident, readWebhookUrl } from './announcements.js';
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

// Posts to Discord unless the admin unticked "Announce in Discord" (body.announce === false).
const announce = ({ db, config, body, url, env, fetchImpl }, id, isNew) =>
  announceIncident({ db, config, id, isNew, announce: body.announce !== false, siteUrl: url.origin, env, fetchImpl });

/** GET /api/admin/session: who's signed in, plus what the incident form needs. */
export const sessionHandlers = {
  GET: ({ user, config, env }) =>
    json({
      user,
      page: pageSettings(config),
      discord: readWebhookUrl(env) !== null,
      impacts: IMPACTS,
      statuses: INCIDENT_STATUSES,
      groups: config.groups.map((g) => ({
        name: g.name,
        components: g.components.map((c) => ({ id: c.id, name: c.name ?? c.id })),
      })),
      templates: config.incidentTemplates,
    }),
};

/** /api/admin/incidents */
export const incidentHandlers = {
  GET: async ({ db }) =>
    json({ incidents: await listIncidents(db, { days: ADMIN_HISTORY_DAYS, withAuthors: true }) }),

  POST: async (ctx) => {
    const { db, config, body, user } = ctx;
    const id = await createIncident(db, parseNewIncident(body, componentIds(config)), user.name);
    return json({ id, discord: await announce(ctx, id, true) }, 201);
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
  POST: async (ctx) => {
    const { db, body, url, user } = ctx;
    const id = idParam(url);
    await addIncidentUpdate(db, id, parseIncidentUpdate(body), user.name);
    return json({ ok: true, discord: await announce(ctx, id, false) }, 201);
  },
};
