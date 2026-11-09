// Simple astronomy helpers. Accuracy is "good for visualisation":
// orbits are circular, mean longitudes only. Real ephemerides can replace these later.

export const DAY_MS = 86400000;
export const J2000_MS = Date.UTC(2000, 0, 1, 12);
const RAD = Math.PI / 180;

export const daysSinceJ2000 = (ms) => (ms - J2000_MS) / DAY_MS;

/** Heliocentric ecliptic longitude of Earth (rad). */
export const earthLongitude = (d) => ((100.464 + 0.98564736 * d) % 360) * RAD;

/** Geocentric ecliptic longitude of the Moon (rad), mean motion only. */
export const moonLongitude = (d) => ((218.316 + 13.176396 * d) % 360) * RAD;

/** Fraction of the Moon's disc that is lit, 0..1. */
export function moonIllumination(d) {
  const sunLon = earthLongitude(d) + Math.PI;
  const elong = moonLongitude(d) - sunLon;
  return (1 - Math.cos(elong)) / 2;
}

/** Moon age in days since new moon (0..29.53). */
export function moonAge(d) {
  const sunLon = earthLongitude(d) + Math.PI;
  let e = (moonLongitude(d) - sunLon) / (2 * Math.PI);
  e -= Math.floor(e);
  return e * 29.530589;
}

export function moonPhaseName(d) {
  const a = moonAge(d) / 29.530589;
  if (a < 0.03 || a > 0.97) return 'New Moon';
  if (a < 0.22) return 'Waxing Crescent';
  if (a < 0.28) return 'First Quarter';
  if (a < 0.47) return 'Waxing Gibbous';
  if (a < 0.53) return 'Full Moon';
  if (a < 0.72) return 'Waning Gibbous';
  if (a < 0.78) return 'Last Quarter';
  return 'Waning Crescent';
}

/**
 * Sun altitude/azimuth for a site on Earth (NOAA approximation).
 * Returns degrees; azimuth is measured from north, clockwise.
 * Refraction is not applied here.
 */
export function solarPosition(ms, latDeg, lonDeg) {
  const date = new Date(ms);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = Math.floor((ms - yearStart) / DAY_MS);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy + (hour - 12) / 24);

  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);

  const trueSolarMin = hour * 60 + eqTime + 4 * lonDeg;
  const ha = (trueSolarMin / 4 - 180) * RAD;
  const lat = latDeg * RAD;

  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const alt = 90 - zen / RAD;
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / RAD + 180;
  az = (az + 360) % 360;
  return { alt, az, decl: decl / RAD };
}

/**
 * Sun elevation seen from a point near the lunar south pole (degrees).
 * The Moon's spin axis is tilted only ~1.54° to the ecliptic, so near the pole
 * the Sun skims the horizon: elevation ≈ −declination + colatitude·cos(hour angle).
 */
export function lunarPoleSunElevation(d, latDeg = -89.9) {
  const tilt = 1.54;
  const draconicYear = 346.62; // days: cycle of solar declination on the Moon
  const synodic = 29.530589;
  const decl = tilt * Math.sin((2 * Math.PI * (d - 120)) / draconicYear);
  const colat = 90 - Math.abs(latDeg);
  const ha = (2 * Math.PI * moonAge(d)) / synodic;
  const sign = latDeg < 0 ? -1 : 1;
  const elevation = sign * decl + colat * Math.cos(ha);
  const azimuth = ((ha / RAD) + 360) % 360;
  return { elevation, azimuth };
}
