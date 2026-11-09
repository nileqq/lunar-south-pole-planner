// Tiny SVG line chart with crosshair tooltip. No dependencies.

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

/**
 * spec = {
 *   x: { domain:[a,b], ticks:[...], format:(v)=>str },
 *   y: { domain:[a,b], ticks:[...], format:(v)=>str },
 *   series: [{ name, color, values:[{x,y}], dash? }],
 *   bands: [{ x0, x1 }],            // shaded spans (e.g. "lit")
 *   marks: [{ x, label, color }],   // vertical reference lines
 *   points: [{ x, y, label, color }],
 *   tooltip: (x) => [[label, value, color?], ...],
 * }
 */
export function renderChart(container, spec) {
  container.innerHTML = '';
  const W = container.clientWidth || 320;
  const H = spec.height || 170;
  const m = { l: 34, r: 10, t: 10, b: 22 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const [x0, x1] = spec.x.domain, [y0, y1] = spec.y.domain;
  const sx = (v) => m.l + ((v - x0) / (x1 - x0)) * iw;
  const sy = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * ih;

  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
  if (spec.ariaLabel) svg.setAttribute('aria-label', spec.ariaLabel);

  const clipId = `clip${Math.random().toString(36).slice(2, 8)}`;
  el('rect', { x: m.l, y: m.t, width: iw, height: ih }, el('clipPath', { id: clipId }, el('defs', {}, svg)));

  for (const b of spec.bands || []) {
    el('rect', { x: sx(b.x0), y: m.t, width: Math.max(1, sx(b.x1) - sx(b.x0)), height: ih, class: 'chart-band' }, svg);
  }
  for (const t of spec.y.ticks) {
    el('line', { x1: m.l, x2: m.l + iw, y1: sy(t), y2: sy(t), class: t === 0 ? 'chart-zero' : 'chart-grid' }, svg);
    const lbl = el('text', { x: m.l - 6, y: sy(t) + 3.5, class: 'chart-tick', 'text-anchor': 'end' }, svg);
    lbl.textContent = spec.y.format ? spec.y.format(t) : t;
  }
  for (const t of spec.x.ticks) {
    const lbl = el('text', { x: sx(t), y: H - 6, class: 'chart-tick', 'text-anchor': 'middle' }, svg);
    lbl.textContent = spec.x.format ? spec.x.format(t) : t;
  }

  const plot = el('g', { 'clip-path': `url(#${clipId})` }, svg);
  for (const s of spec.series) {
    const d = s.values.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash || '' }, plot);
  }
  for (const mk of spec.marks || []) {
    if (mk.x < x0 || mk.x > x1) continue;
    el('line', { x1: sx(mk.x), x2: sx(mk.x), y1: m.t, y2: m.t + ih, stroke: mk.color, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, svg);
  }
  for (const p of spec.points || []) {
    if (p.x < x0 || p.x > x1) continue;
    el('circle', { cx: sx(p.x), cy: sy(p.y), r: 4.5, fill: p.color, class: 'chart-point' }, svg);
  }

  // Hover layer
  const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'chart-cross', visibility: 'hidden' }, svg);
  const dots = spec.series.map((s) => el('circle', { r: 4, fill: s.color, class: 'chart-point', visibility: 'hidden' }, svg));
  const hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }, svg);
  container.appendChild(svg);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.appendChild(tip);

  const nearest = (vals, x) => {
    let lo = 0, hi = vals.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (vals[mid].x < x) lo = mid; else hi = mid; }
    return Math.abs(vals[lo].x - x) < Math.abs(vals[hi].x - x) ? vals[lo] : vals[hi];
  };

  hit.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const x = x0 + ((px - m.l) / iw) * (x1 - x0);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    spec.series.forEach((s, i) => {
      const p = nearest(s.values, x);
      dots[i].setAttribute('cx', sx(p.x)); dots[i].setAttribute('cy', sy(p.y)); dots[i].setAttribute('visibility', 'visible');
    });
    const rows = spec.tooltip ? spec.tooltip(x) : [];
    tip.innerHTML = rows.map(([k, v, c]) => `<div class="tip-row">${c ? `<i style="background:${c}"></i>` : ''}<span>${k}</span><b>${v}</b></div>`).join('');
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(px + 12, 0), W - tw)}px`;
    tip.style.top = `${m.t}px`;
    if (px + 12 + tw > W) tip.style.left = `${px - tw - 12}px`;
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    tip.hidden = true;
  });
}

export function legend(items) {
  return `<div class="chart-legend">${items.map(([name, color, dash]) =>
    `<span><i class="${dash ? 'dash' : ''}" style="--c:${color}"></i>${name}</span>`).join('')}</div>`;
}
