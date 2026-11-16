// Uptime strips: days → slots → runs → DOM.
// A day's colour is the worse of its HetrixTools uptime and any incident that
// touched it. Same-colour days merge into bars; an isolated bad day is a dot.

import { h } from './dom.js';
import { STATUS_LABELS, average, formatDayRange, formatUptime, uptimeLevel } from './format.js';
import { addDays, startOfDay, zonedDate } from './timezone.js';

const LEVEL_ORDER = ['none', 'operational', 'maintenance', 'degraded', 'partial_outage', 'major_outage'];
const QUIET_LEVELS = new Set(['operational', 'none']);

const worseLevel = (a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a);

// Days are calendar days in the page's time zone (status.config.js `timezone`), the
// same days HetrixTools reports, whatever time zone the visitor is in.

/** The last `count` calendar days in `timeZone`, oldest first. */
export function lastDates(count, timeZone, now = Date.now()) {
  const today = zonedDate(now, timeZone);
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)));
}

/** [start, end) of a day in epoch ms; 23 or 25 hours long on daylight-saving days. */
const dayBounds = (date, timeZone) => [startOfDay(date, timeZone), startOfDay(addDays(date, 1), timeZone)];

function touchedDay(incident, [dayStart, dayEnd], now) {
  const start = Date.parse(incident.createdAt);
  const end = incident.resolvedAt ? Date.parse(incident.resolvedAt) : now;
  return start < dayEnd && end >= dayStart;
}

/**
 * One slot per date: { date, uptime, level, incidents: [title] }.
 * @param days       daily uptime from /api/history (monitor components), or null
 * @param incidents  incidents affecting this component (scheduled-only ones excluded)
 * @param baseLevel  level for a day with no uptime data: 'none' for monitors, 'operational' for manual
 * @param timeZone   the page's time zone (days run midnight to midnight there)
 */
export function componentSlots({ days, incidents, axis, baseLevel, timeZone, now = Date.now() }) {
  const uptimeByDate = new Map((days ?? []).map((d) => [d.date, d.uptime]));

  return axis.map((date) => {
    const uptime = uptimeByDate.get(date) ?? null;
    const bounds = dayBounds(date, timeZone);
    const touching = incidents.filter((i) => touchedDay(i, bounds, now));
    const level = touching.reduce(
      (worst, i) => worseLevel(worst, i.impact),
      uptime === null ? baseLevel : uptimeLevel(uptime),
    );
    return { date, uptime, level, incidents: touching.map((i) => i.title) };
  });
}

/** A group's day: its worst component, their average uptime, all their incidents. */
export function groupSlots(slotLists) {
  return slotLists[0].map((_, i) => {
    const day = slotLists.map((slots) => slots[i]);
    return {
      date: day[0].date,
      uptime: average(day.map((s) => s.uptime)),
      level: day.reduce((worst, s) => worseLevel(worst, s.level), 'none'),
      incidents: [...new Set(day.flatMap((s) => s.incidents))],
    };
  });
}

export const rangeUptime = (slots) => average(slots.map((s) => s.uptime));

// Incident impacts that count as downtime for components without a monitor.
const DOWNTIME_IMPACTS = new Set(['partial_outage', 'major_outage']);

/**
 * Uptime % for a component with no monitor: the share of time since the start of
 * `fromDate` (in `timeZone`) not covered by an outage incident. Degraded performance and
 * maintenance don't count as down. Overlapping incidents are only counted once.
 */
export function incidentUptime(incidents, fromDate, timeZone, now = Date.now()) {
  const windowStart = startOfDay(fromDate, timeZone);
  const spans = incidents
    .filter((i) => DOWNTIME_IMPACTS.has(i.impact))
    .map((i) => [
      Math.max(windowStart, Date.parse(i.createdAt)),
      Math.min(now, i.resolvedAt ? Date.parse(i.resolvedAt) : now),
    ])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  let down = 0;
  let coveredUntil = windowStart;
  for (const [start, end] of spans) {
    if (end <= coveredUntil) continue;
    down += end - Math.max(start, coveredUntil);
    coveredUntil = end;
  }
  return 100 * (1 - down / (now - windowStart));
}

/**
 * Drops the no-data days at the start, from before monitoring began, so a new
 * monitor's strip starts on its first day instead of with weeks of grey.
 * Gaps later on stay; a strip with no data at all is kept whole.
 */
export function trimToMonitored(slots) {
  const start = slots.findIndex((s) => s.level !== 'none');
  return start <= 0 ? slots : slots.slice(start);
}

/** Consecutive days at the same level become one run. */
function toRuns(slots) {
  const runs = [];
  for (const slot of slots) {
    const last = runs.at(-1);
    if (last && last.level === slot.level) last.slots.push(slot);
    else runs.push({ level: slot.level, slots: [slot] });
  }
  return runs;
}

// A single bad day stands out as a dot; longer stretches are bars sized by length.
const isDot = (run) => run.slots.length === 1 && !QUIET_LEVELS.has(run.level);

function renderRun(run) {
  const uptime = rangeUptime(run.slots);
  const dot = isDot(run);
  const incidents = [...new Set(run.slots.flatMap((s) => s.incidents))];

  return h('span', {
    class: dot ? 'seg seg-dot' : 'seg',
    style: dot ? null : { flexGrow: String(run.slots.length) },
    dataset: {
      level: run.level,
      tipState: run.level,
      tipTitle: STATUS_LABELS[run.level],
      tipDetail: uptime === null ? null : `${formatUptime(uptime)} uptime`,
      tipBody: formatDayRange(run.slots[0].date, run.slots.at(-1).date),
      tipItems: incidents.length ? incidents.join('\n') : null,
    },
  });
}

/**
 * Compact strips (in row headers) are decoration for pointer users. Full strips can be
 * focused and read with the arrow keys (see tooltip.js).
 */
export function renderStrip(slots, { compact = false } = {}) {
  const props = compact
    ? { class: 'strip strip-compact', 'aria-hidden': 'true' }
    : { class: 'strip', tabindex: '0', role: 'group', 'aria-label': 'Daily status. Use the left and right arrow keys to go through it.' };
  return h('div', props, toRuns(slots).map(renderRun));
}
