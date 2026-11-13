// Fake HetrixTools API for tests: routes by path, records calls.

export function fakeHetrix({ monitors = [], reports = {}, fail = {} } = {}) {
  const calls = [];

  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    calls.push({ url, auth: init?.headers?.Authorization });

    const failure = Object.entries(fail).find(([path]) => url.pathname.endsWith(path));
    if (failure) return new Response('upstream detail', { status: failure[1] });

    const report = url.pathname.match(/\/uptime-monitors\/([^/]+)\/report$/);
    if (report) return Response.json(reports[report[1]] ?? { data: {} });

    if (url.pathname.endsWith('/uptime-monitors')) {
      return Response.json({ monitors, meta: { pagination: { next: null } } });
    }
    return new Response('not found', { status: 404 });
  };

  return { fetchImpl, calls };
}

/** Run fn with console.error/warn silenced (expected-failure tests). */
export async function quietly(fn) {
  const { error, warn } = console;
  console.error = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { error, warn });
  }
}

export const baseConfig = (groups) => ({
  title: 'Test',
  groups: groups ?? [
    {
      name: 'Web',
      components: [
        { name: 'Site', monitor: 'm1' },
        { name: 'Support', status: 'operational' },
      ],
    },
  ],
});

/** Admin-login environment for tests (user 111 and 222 are admins). */
export const authEnv = {
  DISCORD_CLIENT_ID: 'client',
  DISCORD_CLIENT_SECRET: 'secret',
  SESSION_SECRET: 's'.repeat(32),
  ADMIN_DISCORD_IDS: '111, 222',
};
