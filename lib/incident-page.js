// Builds the /api/incident?id=… payload for an incident's own page.
// A missing incident still returns the page settings (with incident: null),
// so the page can show its header and footer around a "not found" message.

import { componentIds, componentNames } from './config.js';
import { NotFoundError, getIncident, parseIncidentId } from './incidents.js';
import { loginEnabled, publicPage, withKnownComponents } from './page.js';

async function findIncident(db, rawId) {
  try {
    return await getIncident(db, parseIncidentId(rawId));
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

export async function loadIncidentPage({ config, db, request }) {
  const base = {
    page: publicPage(config),
    features: { history: Boolean(db), login: loginEnabled(db) },
  };
  const found = db ? await findIncident(db, new URL(request.url).searchParams.get('id')) : null;
  if (!found) return { ...base, incident: null, componentNames: {} };

  const incident = withKnownComponents(found, componentIds(config)); // getIncident leaves out admin names
  const names = componentNames(config);
  return {
    ...base,
    incident,
    componentNames: Object.fromEntries(incident.components.map((id) => [id, names.get(id)])),
  };
}
