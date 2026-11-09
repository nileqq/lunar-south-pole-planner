# Lunar South Pole Planner

Web platform for simulating when the Sun clears the mountains at the lunar south pole,
and for validating the same model with a camera station in mountains on Earth.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` makes a static site in `dist/` (no backend needed).

## What's inside

| Path | What it does |
|---|---|
| `src/scene/solarSystem.js` | Sun, Earth, Moon, stars, orbits, surface markers; visual vs. true scale |
| `src/scene/textures.js` | Procedural planet textures (no image downloads) |
| `src/scene/cameraRig.js` | Smooth fly-to and follow for selected objects |
| `src/sim/astro.js` | Orbital timing, Moon phase, Sun position for an Earth site |
| `src/sim/sunrise.js` | Sunrise over a horizon profile. **Formula constants and horizons are placeholders** — tune when the hardware spec / DEM / LOLA data are ready |
| `src/data/hardware.js` | Device data import (CSV `date,sunrise` in local time) and prediction vs. observation comparison |
| `src/data/catalog.js` | Object facts, test station coordinates |
| `src/ui/panel.js`, `src/ui/chart.js` | Info panel and charts |

## Controls

Drag — rotate · Scroll — zoom · Click object or label — fly to it · Esc / double-click — overview · Space — pause · 1–5 — select objects.
