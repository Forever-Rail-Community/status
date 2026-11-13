// Component status vocabulary shared by the API and (as strings) the frontend.

export const STATUS = Object.freeze({
  OPERATIONAL: 'operational',
  DEGRADED: 'degraded',
  PARTIAL_OUTAGE: 'partial_outage',
  MAJOR_OUTAGE: 'major_outage',
  MAINTENANCE: 'maintenance',
  PAUSED: 'paused',
  UNKNOWN: 'unknown',
});

/** Statuses a manual component may be given in status.config.js. */
export const MANUAL_STATUSES = Object.freeze([
  STATUS.OPERATIONAL,
  STATUS.DEGRADED,
  STATUS.PARTIAL_OUTAGE,
  STATUS.MAJOR_OUTAGE,
  STATUS.MAINTENANCE,
]);

// Higher = worse. Paused/unknown are absent: they never decide a rollup.
const SEVERITY = {
  [STATUS.OPERATIONAL]: 0,
  [STATUS.MAINTENANCE]: 1,
  [STATUS.DEGRADED]: 2,
  [STATUS.PARTIAL_OUTAGE]: 3,
  [STATUS.MAJOR_OUTAGE]: 4,
};

/** Worst known status in a list; UNKNOWN when nothing in it is known. */
export function worstStatus(statuses) {
  const known = statuses.filter((s) => s in SEVERITY);
  if (known.length === 0) return STATUS.UNKNOWN;
  return known.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst));
}

/**
 * Page-wide status. One component fully down is a partial outage for the page;
 * it's only a major outage when every known component is down.
 */
export function overallStatus(statuses) {
  const worst = worstStatus(statuses);
  const known = statuses.filter((s) => s in SEVERITY);
  if (worst === STATUS.MAJOR_OUTAGE && known.some((s) => s !== STATUS.MAJOR_OUTAGE)) {
    return STATUS.PARTIAL_OUTAGE;
  }
  return worst;
}
