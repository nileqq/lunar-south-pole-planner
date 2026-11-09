// Right-side info panel: facts, live values and charts for the selected object.
import { CATALOG, TEST_STATION } from '../data/catalog.js';
import { renderChart, legend } from './chart.js';
import {
  daysSinceJ2000, moonIllumination, moonPhaseName, moonAge, solarPosition, lunarPoleSunElevation, DAY_MS,
} from '../sim/astro.js';
import { stationDayProfile, lunarPoleProfile, predictSunrise, predictFlatSunrise, localDayStart } from '../sim/sunrise.js';
import { parseObservations, demoObservations, compare, saveObservations, loadObservations } from '../data/hardware.js';

const C_SUN = '#c97a10';     // validated chart orange (dark surface)
const C_HORIZON = '#4a93e8'; // validated chart blue
const C_OBS = '#e8edf5';

const pad = (n) => String(n).padStart(2, '0');
export function fmtLocal(ms, tz, seconds = false) {
  const d = new Date(ms + tz * 3600000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ''}`;
}
const fmtDeg = (v, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}°`;

export class InfoPanel {
  constructor(root, { onClose, onSelect, getSimMs }) {
    this.root = root;
    this.onClose = onClose;
    this.onSelect = onSelect;
    this.getSimMs = getSimMs;
    this.id = null;
    this.chartKey = '';
    this.observations = loadObservations();
  }

  open(id) {
    this.id = id;
    this.chartKey = '';
    const info = CATALOG[id];
    const children = (info.children || []).map((c) => `<button class="chip" data-goto="${c}">${CATALOG[c].name} →</button>`).join('');
    const parent = info.parent ? `<button class="link-back" data-goto="${info.parent}">← ${CATALOG[info.parent].name}</button>` : '';
    this.root.innerHTML = `
      <div class="panel-head">
        <div>
          ${parent}
          <div class="panel-kind" style="--c:${info.color}">${info.kind}</div>
          <h2>${info.name}</h2>
        </div>
        <button class="icon-btn" data-close aria-label="Close panel">✕</button>
      </div>
      <p class="panel-desc">${info.description}</p>
      ${children ? `<div class="chip-row">${children}</div>` : ''}
      <div class="section-title">Live</div>
      <div class="stats" data-live></div>
      <div data-charts></div>
      <div class="section-title">Reference</div>
      <dl class="facts">${info.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    `;
    this.root.querySelector('[data-close]').onclick = () => this.onClose();
    this.root.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => this.onSelect(b.dataset.goto); });
    this.root.classList.add('open');
    this.root.scrollTop = 0;
    this.refresh(true);
  }

  close() {
    this.id = null;
    this.root.classList.remove('open');
  }

  /** Called a few times per second with the current sim time. */
  refresh(force = false) {
    if (!this.id) return;
    const ms = this.getSimMs();
    const d = daysSinceJ2000(ms);
    const live = this.root.querySelector('[data-live]');
    const stats = this.liveStats(this.id, ms, d);
    live.innerHTML = stats.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');

    // Charts only redraw when the sim day changes.
    const key = `${this.id}:${Math.floor(d * 96)}:${this.observations.length}`;
    if (force || key !== this.chartKey) {
      this.chartKey = key;
      this.renderCharts(this.id, ms, d);
    }
  }

  liveStats(id, ms, d) {
    switch (id) {
      case 'sun': return [
        ['Subsolar lat.', fmtDeg(solarPosition(ms, 0, 0).decl)],
        ['Earth–Sun', `${(149.6 * (1 - 0.0167 * Math.cos((2 * Math.PI * (d - 2)) / 365.256))).toFixed(2)} M km`],
      ];
      case 'earth': {
        const s = solarPosition(ms, TEST_STATION.lat, TEST_STATION.lon);
        return [
          ['UTC', new Date(ms).toISOString().slice(11, 16)],
          ['Station local', fmtLocal(ms, TEST_STATION.tz)],
          ['Sun alt. at station', fmtDeg(s.alt)],
        ];
      }
      case 'moon': return [
        ['Phase', moonPhaseName(d)],
        ['Illuminated', `${Math.round(moonIllumination(d) * 100)}%`],
        ['Age', `${moonAge(d).toFixed(1)} d`],
      ];
      case 'station': {
        const s = solarPosition(ms, TEST_STATION.lat, TEST_STATION.lon);
        const sr = predictSunrise(ms, TEST_STATION);
        const flat = predictFlatSunrise(ms, TEST_STATION);
        return [
          ['Local time', fmtLocal(ms, TEST_STATION.tz)],
          ['Sun altitude', fmtDeg(s.alt)],
          ['Sun azimuth', `${s.az.toFixed(1)}°`],
          ['Predicted sunrise', sr ? fmtLocal(sr, TEST_STATION.tz, true) : '—'],
          ['Ridge delay', sr && flat ? `+${Math.round((sr - flat) / 60000)} min` : '—'],
        ];
      }
      case 'southpole': {
        const p = lunarPoleSunElevation(d);
        const prof = lunarPoleProfile(d, 30, 300);
        const lit = prof.filter((x) => x.lit).length / prof.length;
        return [
          ['Sun elevation', fmtDeg(p.elevation, 2)],
          ['Sun azimuth', `${p.azimuth.toFixed(0)}°`],
          ['Lit, next 30 d', `${Math.round(lit * 100)}%`],
          ['Status', prof[0].lit ? 'In sunlight' : 'In shadow'],
        ];
      }
      default: return [];
    }
  }

  renderCharts(id, ms) {
    const host = this.root.querySelector('[data-charts]');
    host.innerHTML = '';
    if (id === 'station' || id === 'earth') this.stationCharts(host, ms, id === 'station');
    if (id === 'southpole' || id === 'moon') this.poleChart(host, daysSinceJ2000(ms));
  }

  stationCharts(host, ms, withData) {
    const site = TEST_STATION;
    const prof = stationDayProfile(ms, site);
    const sunrise = predictSunrise(ms, site);
    const dayStart = localDayStart(ms, site.tz);
    const hourOf = (t) => (t - dayStart) / 3600000;
    const nowH = hourOf(ms);

    const dateStr = new Date(dayStart + site.tz * 3600000 + 1).toISOString().slice(0, 10);
    const obsToday = this.observations.find((o) => o.date === dateStr);

    const box = document.createElement('div');
    box.className = 'chart-card';
    box.innerHTML = `
      <div class="chart-title">Sun altitude vs. ridge · ${dateStr}</div>
      ${legend([['Sun altitude', C_SUN], ['Horizon (synthetic)', C_HORIZON], ...(obsToday ? [['Observed', C_OBS]] : [])])}
      <div class="chart-host"></div>
      <div class="chart-note">Predicted sunrise <b>${sunrise ? fmtLocal(sunrise, site.tz, true) : '—'}</b> local · dashed line = now</div>`;
    host.appendChild(box);

    const alts = prof.map((p) => p.alt);
    const yMin = Math.floor(Math.min(...alts, -10) / 10) * 10;
    const yMax = Math.ceil(Math.max(...alts, 20) / 10) * 10;
    const yTicks = [];
    for (let v = yMin; v <= yMax; v += yMax - yMin > 60 ? 20 : 10) yTicks.push(v);

    renderChart(box.querySelector('.chart-host'), {
      ariaLabel: 'Sun altitude and horizon over the day at the test station',
      x: { domain: [0, 24], ticks: [0, 6, 12, 18, 24], format: (v) => `${pad(v)}:00` },
      y: { domain: [yMin, yMax], ticks: yTicks, format: (v) => `${v}°` },
      series: [
        { name: 'Sun altitude', color: C_SUN, values: prof.map((p) => ({ x: p.hour, y: p.alt })) },
        { name: 'Horizon', color: C_HORIZON, values: prof.map((p) => ({ x: p.hour, y: p.horizon })) },
      ],
      marks: [
        { x: nowH, color: '#8b97ad' },
        ...(sunrise ? [{ x: hourOf(sunrise), color: C_SUN }] : []),
      ],
      points: obsToday ? [{ x: hourOf(obsToday.observed), y: solarPosition(obsToday.observed, site.lat, site.lon).alt, color: C_OBS }] : [],
      tooltip: (x) => {
        const p = prof[Math.round((x / 24) * (prof.length - 1))] || prof[0];
        return [
          ['Time', fmtLocal(p.t, site.tz)],
          ['Sun', fmtDeg(p.alt), C_SUN],
          ['Horizon', fmtDeg(p.horizon), C_HORIZON],
        ];
      },
    });

    if (!withData) return;

    // Hardware data block
    const hw = document.createElement('div');
    hw.className = 'chart-card';
    const rows = compare(this.observations, site).slice(-10).reverse();
    const deltas = rows.filter((r) => r.deltaMin != null).map((r) => r.deltaMin);
    const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
    const rms = deltas.length ? Math.sqrt(deltas.reduce((a, b) => a + b * b, 0) / deltas.length) : null;
    hw.innerHTML = `
      <div class="chart-title">Device observations</div>
      ${rows.length ? `
        <div class="stats compact">
          <div class="stat"><span>Mornings</span><b>${this.observations.length}</b></div>
          <div class="stat"><span>Mean error</span><b>${mean >= 0 ? '+' : '−'}${Math.abs(mean).toFixed(2)} min</b></div>
          <div class="stat"><span>RMS error</span><b>${rms.toFixed(2)} min</b></div>
        </div>
        <table class="obs-table">
          <thead><tr><th>Date</th><th>Predicted</th><th>Observed</th><th>Δ min</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${r.date}</td><td>${r.predicted ? fmtLocal(r.predicted, site.tz, true) : '—'}</td><td>${fmtLocal(r.observed, site.tz, true)}</td><td class="${Math.abs(r.deltaMin) > 2 ? 'bad' : ''}">${r.deltaMin == null ? '—' : (r.deltaMin >= 0 ? '+' : '−') + Math.abs(r.deltaMin).toFixed(2)}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="muted">No data from the device yet. Import a CSV (<code>date,sunrise</code> in local time) or load demo data.</p>'}
      <div class="btn-row">
        <label class="btn">Import CSV<input type="file" accept=".csv,.txt" hidden data-file></label>
        <button class="btn ghost" data-demo>Load demo data</button>
        ${rows.length ? '<button class="btn ghost" data-clear>Clear</button>' : ''}
      </div>
      <div class="muted small" data-msg></div>`;
    host.appendChild(hw);

    hw.querySelector('[data-file]').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const { rows: parsed, errors } = parseObservations(await file.text(), site);
      const byDate = new Map(this.observations.map((o) => [o.date, o]));
      parsed.forEach((o) => byDate.set(o.date, o));
      this.observations = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      saveObservations(this.observations);
      this.refresh(true);
      const msg = this.root.querySelector('[data-msg]');
      if (msg) msg.textContent = `Imported ${parsed.length} rows${errors.length ? `, ${errors.length} skipped` : ''}.`;
    };
    hw.querySelector('[data-demo]').onclick = () => {
      this.observations = demoObservations(site, ms);
      saveObservations(this.observations);
      this.refresh(true);
    };
    const clear = hw.querySelector('[data-clear]');
    if (clear) clear.onclick = () => { this.observations = []; saveObservations([]); this.refresh(true); };
  }

  poleChart(host, d) {
    const prof = lunarPoleProfile(d, 30, 400);
    const bands = [];
    let start = null;
    prof.forEach((p, i) => {
      if (p.lit && start === null) start = p.day;
      if ((!p.lit || i === prof.length - 1) && start !== null) { bands.push({ x0: start, x1: p.day }); start = null; }
    });
    const box = document.createElement('div');
    box.className = 'chart-card';
    box.innerHTML = `
      <div class="chart-title">South pole: Sun elevation, next 30 days</div>
      ${legend([['Sun elevation', C_SUN], ['Horizon (synthetic)', C_HORIZON], ['Sunlit', 'rgba(201,122,16,0.35)']])}
      <div class="chart-host"></div>
      <div class="chart-note">Shaded = Sun above the ridge (power available). Horizon will come from LOLA terrain data.</div>`;
    host.appendChild(box);
    renderChart(box.querySelector('.chart-host'), {
      ariaLabel: 'Sun elevation and horizon at the lunar south pole over 30 days',
      x: { domain: [0, 30], ticks: [0, 5, 10, 15, 20, 25, 30], format: (v) => `${v}d` },
      y: { domain: [-2, 2], ticks: [-2, -1, 0, 1, 2], format: (v) => `${v}°` },
      series: [
        { name: 'Sun', color: C_SUN, values: prof.map((p) => ({ x: p.day, y: p.elevation })) },
        { name: 'Horizon', color: C_HORIZON, values: prof.map((p) => ({ x: p.day, y: p.horizon })) },
      ],
      bands,
      tooltip: (x) => {
        const p = prof[Math.round((x / 30) * (prof.length - 1))] || prof[0];
        const date = new Date(Date.UTC(2000, 0, 1, 12) + (d + p.day) * DAY_MS).toISOString().slice(0, 10);
        return [
          ['Date', date],
          ['Sun', fmtDeg(p.elevation, 2), C_SUN],
          ['Horizon', fmtDeg(p.horizon, 2), C_HORIZON],
          ['State', p.lit ? 'Sunlit' : 'Shadow'],
        ];
      },
    });
  }
}
