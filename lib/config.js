// Validates status.config.js and fills in defaults, so the rest of the code
// can trust its shape. Errors name the exact field that's wrong.

import { MANUAL_STATUSES } from './statuses.js';
import { IMPACTS } from './incidents.js';
import { isPlainObject } from './util.js';

export const MAX_HISTORY_DAYS = 30; // HetrixTools report limit
const THEMES = ['dark', 'light', 'auto'];
const SAFE_URL = /^(https?:\/\/|\/|#|mailto:)/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COMPONENT_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

export class ConfigError extends Error {}

const fail = (path, problem) => {
  throw new ConfigError(`status.config.js: ${path} ${problem}`);
};

/** 'Run8 – SE Route' → 'run8-se-route' */
export const slugify = (text) =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

function optionalString(value, path) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') fail(path, 'must be a string');
  return value.trim() || null;
}

function optionalUrl(value, path) {
  const url = optionalString(value, path);
  if (url && !SAFE_URL.test(url)) fail(path, 'must start with https://, http://, /, # or mailto:');
  return url;
}

/** A file in public/ ('/images/x.png') or a full https:// URL. */
function optionalAsset(value, path) {
  const url = optionalString(value, path);
  if (url && !/^(\/|https:\/\/)/i.test(url)) fail(path, 'must start with / (a file in public/) or https://');
  return url;
}

function timezone(value) {
  const zone = optionalString(value, 'timezone') ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    fail('timezone', `"${zone}" is not a timezone; use a name like "America/Chicago" or "UTC"`);
  }
  return zone;
}

function site(value) {
  if (value != null && !isPlainObject(value)) fail('site', 'must be an object');
  const raw = value ?? {};
  const url = optionalString(raw.url, 'site.url');
  if (url && !/^https?:\/\/[^/\s]+/i.test(url)) fail('site.url', 'must be the full address, like https://status.example.com');
  return {
    url: url?.replace(/\/+$/, '') ?? null,
    description: optionalString(raw.description, 'site.description'),
    image: optionalAsset(raw.image, 'site.image'),
    favicon: optionalAsset(raw.favicon, 'site.favicon'),
  };
}

function incidentTemplate(value, path, knownIds) {
  if (!isPlainObject(value)) fail(path, 'must be an object');
  const name = optionalString(value.name, `${path}.name`);
  const title = optionalString(value.title, `${path}.title`);
  if (!name) fail(`${path}.name`, 'is required');
  if (!title) fail(`${path}.title`, 'is required');

  const impact = value.impact ?? 'major_outage';
  if (!IMPACTS.includes(impact)) fail(`${path}.impact`, `must be one of: ${IMPACTS.join(', ')}`);

  const components = value.components ?? [];
  if (!Array.isArray(components)) fail(`${path}.components`, 'must be a list of component ids');
  const unknown = components.filter((id) => !knownIds.has(id));
  if (unknown.length) fail(`${path}.components`, `has unknown component ids: ${unknown.join(', ')}`);

  return { name, title, impact, components, message: optionalString(value.message, `${path}.message`) ?? '' };
}

function list(value, path, item) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value.map((entry, i) => item(entry, `${path}[${i}]`, i));
}

function link(value, path) {
  if (!isPlainObject(value)) fail(path, 'must be { label, href }');
  const label = optionalString(value.label, `${path}.label`);
  const href = optionalUrl(value.href, `${path}.href`);
  if (!label || !href) fail(path, 'needs both label and href');
  return { label, href };
}

const optionalLink = (value, path) => (value == null ? null : link(value, path));

function logo(value, path) {
  if (value == null) return null;
  if (!isPlainObject(value)) fail(path, 'must be an object or null');

  const src = optionalUrl(value.src, `${path}.src`);
  if (!src) fail(`${path}.src`, 'is required');

  const height = value.height ?? 28;
  if (!Number.isFinite(height) || height <= 0) fail(`${path}.height`, 'must be a positive number');

  return {
    src,
    alt: optionalString(value.alt, `${path}.alt`) ?? '',
    height,
    href: optionalUrl(value.href, `${path}.href`),
  };
}

function componentId(value, name, path) {
  const explicit = optionalString(value.id, `${path}.id`);
  const id = explicit ?? (name ? slugify(name) : null);
  if (!id) fail(`${path}.id`, 'is required when the component has no name');
  if (!COMPONENT_ID.test(id)) fail(`${path}.id`, 'must be lowercase letters, numbers and dashes');
  return id;
}

function component(value, path) {
  if (!isPlainObject(value)) fail(path, 'must be an object');

  const name = optionalString(value.name, `${path}.name`);
  const description = optionalString(value.description, `${path}.description`);
  const monitor = optionalString(value.monitor, `${path}.monitor`);
  if (!monitor && !name) fail(`${path}.name`, 'is required for manual components');
  const id = componentId(value, name, path);

  if (monitor) {
    if (value.status != null) fail(path, 'can have a monitor or a status, not both');
    return { id, name, description, monitor };
  }

  const status = value.status ?? 'operational';
  if (!MANUAL_STATUSES.includes(status)) {
    fail(`${path}.status`, `must be one of: ${MANUAL_STATUSES.join(', ')}`);
  }
  return { id, name, description, status };
}

function group(value, path) {
  if (!isPlainObject(value)) fail(path, 'must be an object');
  const name = optionalString(value.name, `${path}.name`);
  if (!name) fail(`${path}.name`, 'is required');

  const components = list(value.components, `${path}.components`, component);
  if (components.length === 0) fail(`${path}.components`, 'needs at least one component');

  return { name, description: optionalString(value.description, `${path}.description`), components };
}

// Incidents refer to components by id, so ids must be unique page-wide.
function assertUniqueIds(groups) {
  const seen = new Set();
  groups.forEach((g, gi) =>
    g.components.forEach((c, ci) => {
      if (seen.has(c.id)) {
        fail(`groups[${gi}].components[${ci}]`, `has a duplicate id "${c.id}"; set a unique \`id\``);
      }
      seen.add(c.id);
    }),
  );
}

export function resolveConfig(raw) {
  if (!isPlainObject(raw)) fail('default export', 'must be an object');
  const header = raw.header ?? {};
  const footer = raw.footer ?? {};

  const theme = raw.theme ?? 'dark';
  if (!THEMES.includes(theme)) fail('theme', `must be one of: ${THEMES.join(', ')}`);

  const accent = raw.accent ?? null;
  if (accent !== null && !HEX_COLOR.test(accent)) fail('accent', 'must be a hex colour like #e5a00d');

  const historyDays = raw.historyDays ?? MAX_HISTORY_DAYS;
  if (!Number.isInteger(historyDays) || historyDays < 1 || historyDays > MAX_HISTORY_DAYS) {
    fail('historyDays', `must be a whole number from 1 to ${MAX_HISTORY_DAYS}`);
  }

  const groups = list(raw.groups, 'groups', group);
  if (groups.length === 0) fail('groups', 'needs at least one group');
  assertUniqueIds(groups);
  const knownIds = new Set(groups.flatMap((g) => g.components.map((c) => c.id)));

  return {
    title: optionalString(raw.title, 'title') ?? 'Status',
    notice: optionalString(raw.notice, 'notice'),
    site: site(raw.site),
    timezone: timezone(raw.timezone),
    theme,
    accent,
    historyDays,
    header: {
      showTitle: header.showTitle !== false,
      logo: logo(header.logo, 'header.logo'),
      links: list(header.links, 'header.links', link),
      button: optionalLink(header.button, 'header.button'),
    },
    footer: {
      text: optionalString(footer.text, 'footer.text'),
      links: list(footer.links, 'footer.links', link),
      poweredBy: footer.poweredBy !== false,
    },
    groups,
    incidentTemplates: list(raw.incidentTemplates, 'incidentTemplates', (t, p) => incidentTemplate(t, p, knownIds)),
  };
}

export const allComponents = (config) => config.groups.flatMap((g) => g.components);

export const componentIds = (config) => new Set(allComponents(config).map((c) => c.id));

/** id → display name. Monitor components without a configured name fall back to their id. */
export const componentNames = (config) => new Map(allComponents(config).map((c) => [c.id, c.name ?? c.id]));

/** Components backed by a HetrixTools monitor. */
export const monitorComponents = (config) => allComponents(config).filter((c) => c.monitor);
