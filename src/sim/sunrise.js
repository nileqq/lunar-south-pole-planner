// Sunrise prediction over a terrain horizon.
// The horizon profiles below are SYNTHETIC placeholders. Later they will come from
// a DEM (Earth test site) and LOLA terrain data (lunar south pole).
// The formula constants will be tuned once the hardware spec is known.

import { solarPosition, lunarPoleSunElevation, DAY_MS } from './astro.js';

const RAD = Math.PI / 180;

/** Correction terms for "visible sunrise". Tweak when the camera spec is known. */
export const SUNRISE_MODEL = {
  sunSemiDiameter: 0.267, // deg: first light = upper limb
  refraction: 0.5,        // deg: atmospheric refraction near the horizon (0 on the Moon)
  stepSeconds: 20,        // search resolution
};

/** Placeholder horizon for the Earth test station: a ridge to the east. */
export function stationHorizon(azDeg) {
  const a = azDeg * RAD;
  const ridge = 4.5 * Math.exp(-(((azDeg - 110) / 40) ** 2));
  const texture = 1.2 * Math.sin(a * 5 + 0.4) + 0.6 * Math.sin(a * 13 + 2.1) + 0.3 * Math.sin(a * 29);
  return Math.max(0.5, 2 + ridge + texture);
}

/** Placeholder horizon for the lunar south pole site. */
export function lunarHorizon(azDeg) {
  const a = azDeg * RAD;
  return 0.35 + 0.35 * Math.sin(a * 3 + 1) + 0.2 * Math.sin(a * 7 + 0.3) + 0.08 * Math.sin(a * 19);
}

/** Start of the local calendar day containing `ms`, as UTC ms. */
export function localDayStart(ms, tzHours) {
  const shifted = ms + tzHours * 3600000;
  return Math.floor(shifted / DAY_MS) * DAY_MS - tzHours * 3600000;
}

/**
 * Predicted visible sunrise at the station for the local day containing `ms`.
 * Returns UTC ms, or null if the Sun never clears the horizon.
 */
export function predictSunrise(ms, site, horizon = stationHorizon, model = SUNRISE_MODEL) {
  const start = localDayStart(ms, site.tz);
  const step = model.stepSeconds * 1000;
  let prev = null;
  for (let t = start; t <= start + DAY_MS; t += step) {
    const { alt, az } = solarPosition(t, site.lat, site.lon);
    const margin = alt + model.sunSemiDiameter + model.refraction - horizon(az);
    if (prev !== null && prev <= 0 && margin > 0) return t;
    prev = margin;
  }
  return null;
}

/** Sunrise against a flat (0°) horizon, for comparison. */
export function predictFlatSunrise(ms, site) {
  return predictSunrise(ms, site, () => 0);
}

/** Sun altitude and horizon profile through one local day (for charts). */
export function stationDayProfile(ms, site, samples = 289) {
  const start = localDayStart(ms, site.tz);
  const out = [];
  for (let i = 0; i < samples; i++) {
    const t = start + (i / (samples - 1)) * DAY_MS;
    const { alt, az } = solarPosition(t, site.lat, site.lon);
    out.push({ t, hour: (i / (samples - 1)) * 24, alt, horizon: stationHorizon(az) });
  }
  return out;
}

/** Sun elevation vs horizon at the lunar south pole over `days` days. */
export function lunarPoleProfile(d0, days = 30, samples = 400) {
  const out = [];
  for (let i = 0; i < samples; i++) {
    const d = d0 + (i / (samples - 1)) * days;
    const { elevation, azimuth } = lunarPoleSunElevation(d);
    const h = lunarHorizon(azimuth);
    out.push({ day: (i / (samples - 1)) * days, elevation, horizon: h, lit: elevation + 0.267 > h });
  }
  return out;
}
