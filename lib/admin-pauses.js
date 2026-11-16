// Admin API for pausing routes (wired up in api/admin/pauses.js).

import { pausableComponents } from './config.js';
import { json } from './admin.js';
import { listPauses, pauseComponent, resumeComponent } from './pauses.js';

const pausableIds = (config) => new Set(pausableComponents(config).map((c) => c.id));

/** /api/admin/pauses */
export const pauseHandlers = {
  /** Which components are paused right now, and since when. */
  GET: async ({ db }) => {
    const open = (await listPauses(db, { days: 0 })).filter((p) => p.endedAt === null);
    return json({ paused: Object.fromEntries(open.map((p) => [p.component, p.startedAt])) });
  },

  /** { component } → paused. */
  POST: async ({ db, config, body, user }) => {
    await pauseComponent(db, body.component, user.name, pausableIds(config));
    return json({ ok: true }, 201);
  },

  /** ?component=… → resumed. */
  DELETE: async ({ db, config, url }) => {
    await resumeComponent(db, url.searchParams.get('component'), pausableIds(config));
    return json({ ok: true });
  },
};
