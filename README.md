# Forever Rail Status

A status page for Forever Rail Community, styled after status.railway.com. It shows live
status and daily uptime from HetrixTools, plus incidents that admins post from a built-in
`/admin` page (Discord sign-in). Runs entirely on Vercel.

```
status.config.js       ← groups, components, title, logo, header, footer
public/                status page (index.html, styles.css, js/)
public/history/        /history: resolved incidents by month
public/incident/       /incidents/:id: one incident's page (vercel.json rewrites to it)
public/admin/          admin page for incidents
api/status.js          GET  live status + incidents        (CDN cache 60s)
api/history.js         GET  daily uptime from HetrixTools  (CDN cache 1h)
api/incident.js        GET  one incident, for its page      (CDN cache 30s)
api/auth/*.js          Discord sign-in / sign-out
api/admin/*.js         incident management (signed-in admins only)
lib/announcements.js   Discord channel announcements (Components V2)
lib/                   all the logic; api/ files are thin wrappers
scripts/               npm run monitors, npm run db:migrate
test/                  npm test (and npm run test:db against a real Postgres)
```

## Deploying to Vercel

Everything runs on Vercel: static pages plus serverless functions. Incidents need a
Postgres database, because Vercel functions can't save files.

1. **Database.** Add a Neon Postgres database to the Vercel project (Storage → Neon), or use
   a new database in your existing Neon account. Vercel sets `DATABASE_URL` for you.
   Create the tables once: put `DATABASE_URL` in `.env` and run `npm run db:migrate`.
2. **Discord app.** In the Discord Developer Portal, use an existing application or create
   one. Under OAuth2, add the redirect URL `https://<your-status-domain>/api/auth/callback`
   (plus `http://localhost:3000/api/auth/callback` for `vercel dev`). Copy the client ID
   and secret.
3. **HetrixTools.** Create a read-only API key. For the Run8 routes, add **Service**
   monitors that check each route's TCP port (SE 15199, AGS 15197, PA 15198).
   `npm run monitors` prints monitor IDs to put in `status.config.js`.
4. **Environment variables.** Set everything from `.env.example` in Vercel.
5. **Deploy** with the framework preset **Other** and no build command.

Then visit `/admin`, sign in with Discord, and post incidents.

## Incidents

- An incident has a **title**, an **impact** (degraded, partial outage, major outage or
  maintenance), the **components** it affects, and a timeline of **updates**
  (investigating → identified → monitoring → resolved).
- While open, it raises the affected components to its impact, so a manual component can
  show "Major outage" with no monitor behind it. An incident with no components affects
  only the page banner.
- **Scheduled** is for planned maintenance: it's shown on the page but doesn't change any
  status until you post an update moving it to *In progress*.
- Posting an update with status **Resolved** closes it. Posting any other status on a
  resolved incident reopens it.
- Open incidents appear under the banner. Resolved ones are listed on `/history` for
  `historyDays`, and show in the uptime strip tooltips for the days they covered.
- New incidents reach visitors within about a minute (the status response is cached for 60s).

## Pages and navigation

- `/`: live status, open incidents and uptime strips.
- `/history`: resolved incidents from the last `historyDays`, grouped by month.
- `/incidents/<id>`: an incident's own page with its full timeline. Linked from open
  incidents on `/` and from `/history`. Needs `vercel.json` (it maps these URLs to one page).
- Top right of the header: **History** (shown when incidents are set up), your
  `header.button`, and **Log in** → `/admin` (shown when admin sign-in is set up).
- Footer: a **Light / Dark / Auto** switcher. Each visitor's choice is remembered in their
  browser and wins over the `theme` setting, and it applies before the page draws.
  `/admin` has the same switcher.

## Discord announcements

Set `DISCORD_WEBHOOK_URL` to a channel webhook (Discord channel → Edit Channel →
Integrations → Webhooks → New Webhook → Copy Webhook URL) and redeploy. From then on,
posting an incident or an update also posts it to that channel. No bot is needed.

- Messages use Discord's **Components V2** layout: a sidebar coloured by impact (green once
  resolved), the title, status, the update text, affected components, a timestamp shown in
  each reader's timezone, and a link to the incident's page.
- Each new incident and each update is its own message, so people get notified.
- **Announce in Discord** on the admin forms (ticked by default) lets you skip a post,
  e.g. for a typo fix. Editing details or deleting an incident never posts.
- Messages can't ping: `@everyone` and role mentions in incident text are not triggered.
- If Discord is unreachable, the incident is still saved and the admin page says the
  announcement failed; the reason is in the Vercel logs.
- Admin names are not included, same as on the status page.

## Admin access

Sign-in is Discord only. A user can sign in if their ID is in `ADMIN_DISCORD_IDS`, **or**
they hold one of `DISCORD_ADMIN_ROLE_IDS` in the server `DISCORD_GUILD_ID` (checked at
sign-in). Sessions last 7 days in a signed, HttpOnly cookie. To remove someone's access
straight away, change `SESSION_SECRET`, which signs everyone out.

The admin page isn't linked from the status page and is marked `noindex`.

## Configuration (`status.config.js`)

| Option | What it does |
| --- | --- |
| `title` | Browser tab title and header heading |
| `notice` | Optional message inside the status banner |
| `theme` | `'dark'`, `'light'` or `'auto'` |
| `accent` | Hex colour for admin buttons and focus rings (`null` = neutral) |
| `historyDays` | Days in each uptime strip and the past-incidents list, 1–30 |
| `header.showTitle` | `false` hides the heading (it stays available to screen readers) |
| `header.logo` | `{ src, alt, height, href }` or `null`. Put the image in `public/` |
| `header.links` | `[{ label, href }]` pill links in the middle of the header |
| `header.button` | `{ label, href }` button on the right (e.g. Discord), or `null` |
| `footer.text` / `footer.links` | Footer line and links |
| `footer.poweredBy` | `false` hides "Powered by HetrixTools" |
| `groups` | `[{ name, description?, components: [...] }]` |

Components:

```js
{ id: 'run8-se', name: 'SE Route', monitor: '<monitor id>' }   // live from HetrixTools
{ id: 'discord', name: 'Discord server', status: 'operational' } // manual; incidents drive it
```

`id` is how incidents refer to a component. It defaults to the name in lowercase with
dashes. Set it explicitly if you might rename the component, so past incidents stay attached.

## How status is worked out

- **From the monitor:** `down` → Major outage. Up overall but failing from some locations →
  Degraded. HetrixTools maintenance → Under maintenance. Paused or disabled monitors are
  ignored in rollups.
- **Open incidents** raise the components they affect. The worse of the monitor and the
  incident wins.
- **Groups** show their worst component. The **page banner** shows the worst overall, except
  that one component fully down while others are fine reads as *Partial* outage.
- **Strips** colour each day by the worse of that day's uptime (≥ 99.9% green, ≥ 99% yellow,
  ≥ 95% orange, lower red, grey = no data) and any incident that day. Days run in the
  visitor's timezone.

Monitor IDs, targets (URLs/IPs) and admin names never reach the public page.

## Tests

`npm test` runs everything that doesn't need a database. To include the SQL tests:

```
TEST_DATABASE_URL=postgres://user:pass@localhost/status_test npm run test:db
```

(These drop and recreate the incident tables, so use a throwaway database.)
