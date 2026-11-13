// Incident announcements to a Discord channel webhook, as a Components V2 message.
// Webhooks (no bot) can send non-interactive Components V2 when the request has
// ?with_components=true and the message sets the IS_COMPONENTS_V2 flag.

import { IMPACT_LABELS, INCIDENT_STATUS_LABELS } from '../public/js/labels.js';
import { componentNames } from './config.js';
import { getIncident } from './incidents.js';

const IS_COMPONENTS_V2 = 1 << 15;
const COMPONENT = Object.freeze({ TEXT_DISPLAY: 10, SEPARATOR: 14, CONTAINER: 17 });

const SEND_TIMEOUT_MS = 5000;
const MAX_TITLE_CHARS = 200;
const MAX_MESSAGE_CHARS = 1800; // keeps the whole post well inside Discord's text limits

const WEBHOOK_URL = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/;

// Sidebar colours: same hues as the status page.
const IMPACT_COLORS = {
  degraded: 0xeab308,
  partial_outage: 0xf97316,
  major_outage: 0xef4444,
  maintenance: 0x3b82f6,
};
const RESOLVED_COLOR = 0x22c55e;

/** The configured webhook URL, or null when announcements are off (or the URL is malformed). */
export function readWebhookUrl(env = process.env) {
  const url = env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) return null;
  if (!WEBHOOK_URL.test(url)) {
    console.error('DISCORD_WEBHOOK_URL is not a Discord webhook URL; announcements are off.');
    return null;
  }
  return url;
}

// ---------- message ----------

const text = (content) => ({ type: COMPONENT.TEXT_DISPLAY, content });

const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/**
 * @param incident  from getIncident (latest update first)
 * @param isNew     first post for this incident?
 * @param names     Map of component id → display name
 * @param siteUrl   status page origin, e.g. https://status.example (the footer links to the incident's page)
 */
export function announcementPayload({ incident, isNew, names, siteUrl }) {
  const latest = incident.updates[0];
  const status = INCIDENT_STATUS_LABELS[latest.status];
  const affects = incident.components.length
    ? incident.components.map((id) => names.get(id) ?? id).join(', ')
    : 'All services';
  const postedAt = Math.floor(Date.parse(latest.createdAt) / 1000); // Discord renders <t:…> in each reader's timezone

  return {
    flags: IS_COMPONENTS_V2,
    allowed_mentions: { parse: [] }, // incident text must never ping @everyone or roles
    components: [
      {
        type: COMPONENT.CONTAINER,
        accent_color: incident.status === 'resolved' ? RESOLVED_COLOR : IMPACT_COLORS[incident.impact],
        components: [
          text(`## ${truncate(incident.title, MAX_TITLE_CHARS)}`),
          text(`${isNew ? `**New incident** · ${status}` : `**${status}**`} · ${IMPACT_LABELS[incident.impact]}`),
          text(truncate(latest.message, MAX_MESSAGE_CHARS)),
          { type: COMPONENT.SEPARATOR, divider: true, spacing: 1 },
          text(`-# Affects ${affects} · <t:${postedAt}:f> · [View incident](${siteUrl}/incidents/${incident.id})`),
        ],
      },
    ],
  };
}

// ---------- sending ----------

export async function sendToWebhook(webhookUrl, payload, fetchImpl = fetch) {
  const url = new URL(webhookUrl);
  url.searchParams.set('with_components', 'true');
  url.searchParams.set('wait', 'true'); // report errors instead of a silent 204

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Discord webhook responded ${res.status}: ${await res.text()}`);
}

/**
 * Posts the incident's latest state. Never throws: the incident is already saved,
 * so a Discord problem is reported back instead of failing the request.
 * @returns 'off' (no webhook) | 'skipped' (admin unticked it) | 'sent' | 'failed'
 */
export async function announceIncident({ db, config, id, isNew, announce, siteUrl, env, fetchImpl }) {
  const webhookUrl = readWebhookUrl(env);
  if (!webhookUrl) return 'off';
  if (!announce) return 'skipped';

  try {
    const incident = await getIncident(db, id);
    const payload = announcementPayload({ incident, isNew, names: componentNames(config), siteUrl });
    await sendToWebhook(webhookUrl, payload, fetchImpl);
    return 'sent';
  } catch (err) {
    console.error('Discord announcement failed:', err);
    return 'failed';
  }
}
