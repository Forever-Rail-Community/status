// Admin login settings from environment variables.

const list = (value) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const MIN_SECRET_LENGTH = 32;

/** Returns the settings, or null when admin login isn't configured. */
export function readAuthSettings(env = process.env) {
  const settings = {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    // Who may sign in: listed user IDs, and/or members holding a listed role in the guild.
    adminIds: list(env.ADMIN_DISCORD_IDS),
    guildId: env.DISCORD_GUILD_ID || null,
    adminRoleIds: list(env.DISCORD_ADMIN_ROLE_IDS),
  };

  const complete =
    settings.clientId &&
    settings.clientSecret &&
    (settings.sessionSecret?.length ?? 0) >= MIN_SECRET_LENGTH &&
    (settings.adminIds.length > 0 || (settings.guildId && settings.adminRoleIds.length > 0));

  return complete ? settings : null;
}
