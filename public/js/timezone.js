// Calendar days in the page's time zone (`timezone` in status.config.js), so every
// visitor sees the same days as HetrixTools' daily report. Shared with the server.
// Plain Intl: no DOM, no libraries.

const partsCache = new Map();
function partsFormat(timeZone) {
  if (!partsCache.has(timeZone)) {
    partsCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return partsCache.get(timeZone);
}

/** The wall-clock fields of `instant` in `timeZone`. */
function wallClock(instant, timeZone) {
  const fields = {};
  for (const { type, value } of partsFormat(timeZone).formatToParts(instant)) fields[type] = Number(value);
  return fields;
}

/** Minutes the zone is ahead of UTC at `instant` (e.g. 120 for UTC+2, -360 for CST). */
export function offsetMinutes(timeZone, instant = Date.now()) {
  const f = wallClock(instant, timeZone);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** 120 → '+02:00', -360 → '-06:00' (the form HetrixTools' report takes). */
export function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' of `instant` in `timeZone`. */
export function zonedDate(instant, timeZone) {
  const f = wallClock(instant, timeZone);
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
}

/** Epoch ms of midnight starting `date` ('YYYY-MM-DD') in `timeZone`. */
export function startOfDay(date, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  // Guess with the offset at UTC midnight, then correct once in case a DST change lies between.
  const guess = midnightUtc - offsetMinutes(timeZone, midnightUtc) * 60_000;
  return midnightUtc - offsetMinutes(timeZone, guess) * 60_000;
}

/** 'YYYY-MM-DD' shifted by `days` calendar days (no time zone involved). */
export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
