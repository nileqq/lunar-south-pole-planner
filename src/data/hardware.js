// Observations from the field camera device.
// Expected CSV (one row per morning), local station time:
//   date,sunrise
//   2026-11-09,08:14:32
// When the hardware format is final, adapt `parseObservations` only.

import { predictSunrise, localDayStart } from '../sim/sunrise.js';
import { DAY_MS } from '../sim/astro.js';

const STORAGE_KEY = 'lspp.observations.v1';

export function parseObservations(text, site) {
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#') || /^date/i.test(s)) return;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[,;\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) { errors.push(`Line ${i + 1}: cannot read "${s}"`); return; }
    const [, y, mo, d, h, mi, se = '0'] = m;
    const localMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
    rows.push({ date: `${y}-${mo}-${d}`, observed: localMs - site.tz * 3600000 });
  });
  return { rows, errors };
}

/** Synthetic observations: prediction + noise, so the UI can be tried without hardware. */
export function demoObservations(site, endMs, days = 14) {
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = localDayStart(endMs, site.tz) - i * DAY_MS + 12 * 3600000;
    const pred = predictSunrise(day, site);
    if (!pred) continue;
    const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1; // deterministic −1..1
    const offsetSec = 40 + noise * 90; // camera tends to see the Sun slightly later
    const local = new Date(day + site.tz * 3600000);
    rows.push({ date: local.toISOString().slice(0, 10), observed: pred + offsetSec * 1000 });
  }
  return rows;
}

/** Join observations with predictions. Δ > 0 means the Sun appeared later than predicted. */
export function compare(rows, site) {
  return rows.map((r) => {
    const noonLocal = Date.parse(`${r.date}T12:00:00Z`) - site.tz * 3600000;
    const predicted = predictSunrise(noonLocal, site);
    return { ...r, predicted, deltaMin: predicted ? (r.observed - predicted) / 60000 : null };
  });
}

export function saveObservations(rows) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch { /* storage unavailable */ }
}

export function loadObservations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
