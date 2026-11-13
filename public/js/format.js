export { STATUS_LABELS, INCIDENT_STATUS_LABELS, IMPACT_LABELS } from './labels.js';

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** 'Nov 13, 2:05 PM' in the viewer's timezone. */
export const formatDateTime = (iso) => dateTimeFormat.format(new Date(iso));

/** '2h 13m', '45m', '3d 4h' */
export function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

export const OVERALL_LABELS = {
  operational: 'All systems operational',
  degraded: 'Some systems are degraded',
  partial_outage: 'Partial system outage',
  major_outage: 'Major system outage',
  maintenance: 'Maintenance in progress',
  unknown: 'Status unknown',
};

// Daily uptime → level. Checked top-down; anything lower is a major outage.
const UPTIME_LEVELS = [
  [99.9, 'operational'],
  [99, 'degraded'],
  [95, 'partial_outage'],
];

export function uptimeLevel(uptime) {
  if (uptime === null) return 'none';
  return UPTIME_LEVELS.find(([min]) => uptime >= min)?.[1] ?? 'major_outage';
}

// Floor rather than round, so 99.996% never displays as 100.00%.
export const formatUptime = (value) =>
  value === null ? '—' : `${(Math.floor(value * 100) / 100).toFixed(2)}%`;

export function average(values) {
  const nums = values.filter((v) => v !== null && v !== undefined);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// 'YYYY-MM-DD' read as a calendar date, so no timezone shift.
const toDate = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const shortDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** 'YYYY-MM-DD' → 'Nov 12' */
export const formatShortDay = (isoDate) => shortDayFormat.format(toDate(isoDate));

/** 'Nov 13, 2026', or 'Nov 1 – 13, 2026' for a range. */
export function formatDayRange(first, last = first) {
  if (!first) return '';
  return first === last
    ? dayFormat.format(toDate(first))
    : dayFormat.formatRange(toDate(first), toDate(last));
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatAgo(epochMs) {
  const seconds = Math.round((epochMs - Date.now()) / 1000);
  if (Math.abs(seconds) < 60) return relative.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}
