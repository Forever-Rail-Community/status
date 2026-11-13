// Discord OAuth2 (authorization code flow) for admin sign-in.

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const API = 'https://discord.com/api/v10';

export class DiscordError extends Error {}

const scopes = (settings) => (settings.guildId ? 'identify guilds.members.read' : 'identify');

export const redirectUri = (request) => new URL('/api/auth/callback', request.url).href;

export function authorizeUrl(settings, request, state) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(request),
    scope: scopes(settings),
    state,
    prompt: 'none',
  });
  return url.href;
}

async function discordJson(res, what) {
  if (!res.ok) throw new DiscordError(`${what} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function exchangeCode(settings, request, code, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(request),
    }),
  });
  const body = await discordJson(res, 'Token exchange');
  return body.access_token;
}

/** The Discord user, plus their role IDs in the configured guild (if any). */
export async function fetchIdentity(settings, accessToken, fetchImpl = fetch) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const user = await discordJson(await fetchImpl(`${API}/users/@me`, { headers }), 'User lookup');

  let roles = [];
  if (settings.guildId) {
    const res = await fetchImpl(`${API}/users/@me/guilds/${settings.guildId}/member`, { headers });
    // 404 = not in the guild: no roles, but the user ID allowlist may still apply.
    if (res.status !== 404) roles = (await discordJson(res, 'Guild member lookup')).roles ?? [];
  }

  return { id: user.id, name: user.global_name || user.username, roles };
}

export function isAdmin(identity, settings) {
  return (
    settings.adminIds.includes(identity.id) ||
    identity.roles.some((role) => settings.adminRoleIds.includes(role))
  );
}
