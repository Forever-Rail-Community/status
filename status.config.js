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
  title: 'Forever Rail Community Status',

  // Optional message inside the status banner. '' to hide.
  notice: 'This page provides real-time updates on the status of Forever Rail Community’s servers and services, including any issues that may affect normal activity. If you’re experiencing problems, please let us know in Discord!',

  // 'dark' | 'light' | 'auto' (auto follows the visitor's system setting)
  theme: 'auto',

  // Brand colour for admin buttons and focus rings, e.g. '#e5a00d'. null = neutral.
  accent: null,

  // Days shown in each uptime strip (1–30; HetrixTools reports cover up to 30 days).
  // Resolved incidents stay listed for the same number of days.
  historyDays: 30,

  header: {
    showTitle: false,

    // Image in public/ (e.g. '/logo.png') or a full https:// URL. null = no logo.
    logo: { src: '/images/frc-logo-orange-text-brandmark.png', alt: 'Forever Rail Community logo in brand purple', height: 28, href: 'https://status.foreverrail.com' },
    // logo: { src: '/logo.png', alt: 'Forever Rail', height: 28, href: 'https://your-site' },

    // Pill links in the middle of the header.
    links: [
      // { label: 'Dashboard', href: 'https://your-dashboard.vercel.app' },
    ],

    // Button on the far right. null = none.
    button: { label: 'Discord', href: 'https://discord.gg/jFVVCJVbuh' },
    // button: { label: 'Join Discord', href: 'https://discord.gg/your-invite' },
  },

  site: {
    url: 'https://your-status-domain',  // needed for the preview image to show
    description: 'Live status of Forever Rail servers and services.',
    image: '/preview.png',              // 1200×630, in public/
    favicon: '/favicon.png',            // in public/
  },
  timezone: 'America/Chicago',
  incidentTemplates: [
    { name: 'Route down', title: 'SE route server unreachable', impact: 'major_outage',
      components: ['frc-run8'], message: "Players can't connect. We're looking into it." },
  ],

  footer: {
    text: '2021-2026 © Forever Rail Community',
    links: [],
    poweredBy: false, // "Powered by HetrixTools"
  },

  groups: [
    {
      name: 'Community servers',
      description: "Servers that host and offer access to Forever Rail's community game servers.",
      components: [
        // HetrixTools "Service" monitors checking each route's TCP port.
        { id: 'frc-run8', name: 'Run8', monitor: 'd71b93dd7d6de8cc07143d4f4fc48a12', description: '…', components: [
            { id: 'run8-se',  name: 'SE route',  route: true, description: '' },
            { id: 'run8-ags', name: 'AGS route', route: true, description: '' },
            { id: 'run8-pa',  name: 'PA route',  route: true, description: '' },
            { id: 'run8-ne',  name: 'NE route',  route: true, description: '' },
            { id: 'run8-sw',  name: 'SW route',  route: true, description: '' },
          ] },
        { id: 'frc-railroader', name: 'Railroader', monitor: 'a4060a4edb61bed4a7b5243aeb5b8da1', description: 'Server that hosts and provides Railroader instances for community use. Note: This is currently not available to the community at this time as it is still going through testing.' },
      ],
    },
    {
      name: 'External support',
      description: "",
      components: [
        { id: 'discord', name: 'Discord server', status: 'operational' }
      ],
    },
    {
      name: 'External services',
      description: "",
      components: [
        { id: 'vercel', name: 'Vercel', status: 'operational' },
        { id: 'cloudflare', name: 'Cloudflare', status: 'operational' },
        { id: 'neon', name: 'Neon', status: 'operational' },
      ],
    },
  ],
};
