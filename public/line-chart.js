import { esc } from './ui.js';

const W = 640;
const H = 280;
const M = { top: 12, right: 64, bottom: 30, left: 40 };

/**
 * Small SVG line chart with a time axis.
 * series: [{ label, color, points: [{ x, y, tip }], dashed?, endLabel? }], x in minutes.
 */
export function lineChart(series, { xTicks, xMin, xMax, yMax = 100, yStep = 20, yFormat = (v) => `${v}%` }) {
  const sx = (x) => M.left + ((x - xMin) / (xMax - xMin)) * (W - M.left - M.right);
  const sy = (y) => H - M.bottom - (y / yMax) * (H - M.top - M.bottom);
  const grid = [];
  for (let v = 0; v <= yMax; v += yStep) {
    grid.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${sy(v)}" y2="${sy(v)}" class="grid-line"/>
      <text x="${M.left - 6}" y="${sy(v) + 4}" class="axis-label" text-anchor="end">${yFormat(v)}</text>`);
  }
  const ticks = xTicks.map((t) => `<text x="${sx(t.x)}" y="${H - 8}" class="axis-label" text-anchor="middle">${esc(t.label)}</text>`);
  const lines = series.map((s) => {
    if (!s.points.length) return '';
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const last = s.points[s.points.length - 1];
    return `<g>
      <path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 4"' : ''}/>
      ${s.points.map((p) => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"><title>${esc(p.tip || '')}</title></circle>`).join('')}
      ${s.endLabel ? `<text x="${sx(last.x) + 8}" y="${sy(last.y) + 4}" class="series-label">${esc(s.label)}</text>` : ''}
    </g>`;
  });
  const legend = `<div class="legend" style="margin-bottom:6px">${series.map((s) =>
    `<span><span class="swatch" style="background:${s.color}"></span>${esc(s.label)}</span>`).join('')}</div>`;
  return `${legend}<svg viewBox="0 0 ${W} ${H}" class="line-chart" dir="ltr" role="img">${grid.join('')}${ticks.join('')}${lines.join('')}</svg>`;
}
