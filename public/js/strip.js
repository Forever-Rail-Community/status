// Uptime strips: days → slots → runs → DOM.
// A day's colour is the worse of its HetrixTools uptime and any incident that
// touched it. Same-colour days merge into bars; an isolated bad day is a dot.

import { h } from './dom.js';
import { STATUS_LABELS, average, formatDayRange, formatUptime, uptimeLevel } from './format.js';
import { addDays, startOfDay, zonedDate } from './timezone.js';

// 'paused' sits low: any real status that day (a working route, an incident) outranks it.
const LEVEL_ORDER = ['none', 'paused', 'operational', 'maintenance', 'degraded', 'partial_outage', 'major_outage'];
const QUIET_LEVELS = new Set(['operational', 'none', 'paused']);

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

/** Whether a span (an incident or a route period; null end = still going) overlaps the day. */
function touchedDay(startIso, endIso, [dayStart, dayEnd], now) {
  const end = endIso ? Date.parse(endIso) : now;
  return Date.parse(startIso) < dayEnd && end >= dayStart;
}

/**
 * One slot per date: { date, uptime, level, incidents: [title] }.
 * @param days       daily uptime from /api/history (monitor components), or null
 * @param incidents  incidents affecting this component (scheduled-only ones excluded)
 * @param baseLevel  level for a day with no uptime data: 'none' for monitors, 'operational' for manual
 * @param periods    a route's Down / Paused periods: { state, startedAt, endedAt }
 * @param timeZone   the page's time zone (days run midnight to midnight there)
 *
 * A route's day shows Paused if it was paused at any point and Down (major outage) if it
 * was set Down; Down and incidents outrank Paused.
 */
export function componentSlots({ days, incidents, periods = [], axis, baseLevel, timeZone, now = Date.now() }) {
  const uptimeByDate = new Map((days ?? []).map((d) => [d.date, d.uptime]));

  return axis.map((date) => {
    const bounds = dayBounds(date, timeZone);
    const uptime = uptimeByDate.get(date) ?? null;
    const statesThatDay = new Set(periods.filter((p) => touchedDay(p.startedAt, p.endedAt, bounds, now)).map((p) => p.state));
    const touching = incidents.filter((i) => touchedDay(i.createdAt, i.resolvedAt, bounds, now));
    const start = statesThatDay.has('paused') ? 'paused' : uptime === null ? baseLevel : uptimeLevel(uptime);
    const level = [...touching.map((i) => i.impact), ...(statesThatDay.has('down') ? ['major_outage'] : [])]
      .reduce(worseLevel, start);
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

/**
 * A parent's day (Run8 from its server monitor + routes): combined like a group, except a
 * day where every route was paused and the server was fine reads as paused, the same
 * rule as its live status.
 */
export function parentSlots(ownSlots, childSlotLists) {
  return groupSlots([ownSlots, ...childSlotLists]).map((slot, i) => {
    const allPaused = childSlotLists.every((slots) => slots[i].level === 'paused');
    return allPaused && ownSlots[i].level === 'operational' ? { ...slot, level: 'paused' } : slot;
  });
}

export const rangeUptime = (slots) => average(slots.map((s) => s.uptime));

// Incident impacts that count as downtime for components without a monitor.
const DOWNTIME_IMPACTS = new Set(['partial_outage', 'major_outage']);

/** [start, end] ms spans clipped to [from, to], sorted and merged (overlaps counted once). */
function mergeSpans(spans, from, to) {
  const merged = [];
  const clipped = spans
    .map(([start, end]) => [Math.max(from, start), Math.min(to, end)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  for (const [start, end] of clipped) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

const totalLength = (spans) => spans.reduce((sum, [start, end]) => sum + end - start, 0);

/** Total overlap of two merged span lists. */
function overlapLength(a, b) {
  let total = 0;
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    total += Math.max(0, Math.min(a[i][1], b[j][1]) - Math.max(a[i][0], b[j][0]));
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return total;
}

const span = (startIso, endIso, now) => [Date.parse(startIso), endIso ? Date.parse(endIso) : now];

/**
 * Uptime % for a component with no monitor (manual components and routes), since the start
 * of `fromDate` in `timeZone`. Down: outage incidents (partial or major; degraded and
 * maintenance don't count) and, for routes, time set to Down. Paused time is left out
 * entirely. Null when there's no unpaused time to measure.
 * @param periods  a route's Down / Paused periods ({ state, startedAt, endedAt })
 */
export function manualUptime(incidents, fromDate, timeZone, { periods = [], now = Date.now() } = {}) {
  const windowStart = startOfDay(fromDate, timeZone);
  const down = mergeSpans([
    ...incidents.filter((i) => DOWNTIME_IMPACTS.has(i.impact)).map((i) => span(i.createdAt, i.resolvedAt, now)),
    ...periods.filter((p) => p.state === 'down').map((p) => span(p.startedAt, p.endedAt, now)),
  ], windowStart, now);
  const paused = mergeSpans(
    periods.filter((p) => p.state === 'paused').map((p) => span(p.startedAt, p.endedAt, now)),
    windowStart, now,
  );

  const measured = now - windowStart - totalLength(paused);
  if (measured <= 0) return null;
  return 100 * (1 - (totalLength(down) - overlapLength(down, paused)) / measured);
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
