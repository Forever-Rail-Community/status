// Uptime strips: days → slots → runs → DOM.
// A day's colour is the worse of its HetrixTools uptime and any incident that
// touched it. Same-colour days merge into bars; an isolated bad day is a dot.

import { h } from './dom.js';
import { STATUS_LABELS, average, formatDayRange, formatUptime, uptimeLevel } from './format.js';

const DAY_MS = 86_400_000;
const LEVEL_ORDER = ['none', 'operational', 'maintenance', 'degraded', 'partial_outage', 'major_outage'];
const QUIET_LEVELS = new Set(['operational', 'none']);

const worseLevel = (a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a);

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The last `count` calendar days in the viewer's timezone, oldest first. */
export function lastDates(count, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i));
    return isoDate(d);
  });
}

function dayBounds(date) {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  return [start, start + DAY_MS];
}

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
 */
export function componentSlots({ days, incidents, axis, baseLevel, now = Date.now() }) {
  const uptimeByDate = new Map((days ?? []).map((d) => [d.date, d.uptime]));

  return axis.map((date) => {
    const uptime = uptimeByDate.get(date) ?? null;
    const bounds = dayBounds(date);
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

export function renderStrip(slots, { compact = false } = {}) {
  return h('div', { class: compact ? 'strip strip-compact' : 'strip', 'aria-hidden': 'true' },
    toRuns(slots).map(renderRun),
  );
}
