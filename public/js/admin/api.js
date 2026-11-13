// Admin API calls. Errors carry the HTTP status and the server's message.

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data; // the response body, e.g. page settings on a 401
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data);
  return data;
}

export const api = {
  session: () => request('GET', '/api/admin/session'),
  incidents: () => request('GET', '/api/admin/incidents').then((d) => d.incidents),
  createIncident: (incident) => request('POST', '/api/admin/incidents', incident),
  editIncident: (id, edit) => request('PATCH', `/api/admin/incidents?id=${id}`, edit),
  deleteIncident: (id) => request('DELETE', `/api/admin/incidents?id=${id}`),
  postUpdate: (id, update) => request('POST', `/api/admin/incident-updates?id=${id}`, update),
  logout: () => request('POST', '/api/auth/logout'),
};
