// Display labels, shared by the browser (status + admin pages) and the server
// (Discord announcements import this file directly). Plain data only: no DOM.

export const STATUS_LABELS = {
  operational: 'Operational',
  degraded: 'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Under maintenance',
  paused: 'Not running', // monitor paused or disabled in HetrixTools, e.g. a route that's switched off
  unknown: 'Unknown',
  none: 'No data',
};

export const INCIDENT_STATUS_LABELS = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

export const IMPACT_LABELS = {
  degraded: 'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Maintenance',
};
