// Status page configuration. Edit this file, commit, redeploy.
//
// Components come in two kinds:
//   { name, monitor: '<HetrixTools monitor ID>' }  live status + daily uptime from HetrixTools
//   { name, status: 'operational' }                manual: no monitor; incidents drive its history
//     manual statuses: operational | degraded | partial_outage | major_outage | maintenance
//
// Every component has an `id` that incidents refer to. It defaults to the name in
// lowercase-with-dashes ("SE Route" → "se-route"). Set `id` yourself if you plan to
// rename a component, so existing incidents stay attached to it.
//
// Run `npm run monitors` to print your HetrixTools monitor IDs.

export default {
  // Browser tab title, and the heading next to the logo when header.showTitle is true.
  title: 'Forever Rail Status',

  // Optional message inside the status banner. '' to hide.
  notice: 'Live status of Forever Rail servers and services. Having trouble? Let us know in Discord.',

  // 'dark' | 'light' | 'auto' (auto follows the visitor's system setting)
  theme: 'dark',

  // Brand colour for admin buttons and focus rings, e.g. '#e5a00d'. null = neutral.
  accent: null,

  // Days shown in each uptime strip (1–30; HetrixTools reports cover up to 30 days).
  // Resolved incidents stay listed for the same number of days.
  historyDays: 30,

  header: {
    showTitle: true,

    // Image in public/ (e.g. '/logo.png') or a full https:// URL. null = no logo.
    logo: null,
    // logo: { src: '/logo.png', alt: 'Forever Rail', height: 28, href: 'https://your-site' },

    // Pill links in the middle of the header.
    links: [
      // { label: 'Dashboard', href: 'https://your-dashboard.vercel.app' },
    ],

    // Button on the far right. null = none.
    button: null,
    // button: { label: 'Join Discord', href: 'https://discord.gg/your-invite' },
  },

  footer: {
    text: '© Forever Rail Community',
    links: [],
    poweredBy: true, // "Powered by HetrixTools"
  },

  groups: [
    {
      name: 'Run8 Routes',
      description: 'Multiplayer route servers',
      components: [
        // HetrixTools "Service" monitors checking each route's TCP port.
        { id: 'frc-run8', name: 'Run8', monitor: 'd71b93dd7d6de8cc07143d4f4fc48a12', description: 'The server that hosts the communities Run8 routes.' },
        { id: 'frc-railroader', name: 'Railroader', monitor: 'a4060a4edb61bed4a7b5243aeb5b8da1', description: 'The server that hosts the communities Railroader routes.' },
        { id: 'run8-pa', name: 'PA Route', monitor: 'REPLACE_WITH_MONITOR_ID', description: 'Port 15198' },
      ],
    },
    {
      name: 'Railroader',
      components: [
        { id: 'railroader-server', name: 'Railroader server', status: 'operational' },
      ],
    },
    {
      name: 'Community services',
      components: [
        { id: 'ops-dashboard', name: 'Operations dashboard', monitor: 'REPLACE_WITH_MONITOR_ID' },
        { id: 'discord', name: 'Discord server', status: 'operational' },
      ],
    },
  ],
};
