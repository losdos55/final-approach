// DOM helpers.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Animate a number in an element from its previous value (respects reduced motion). */
export function tweenText(el, value, format, ms = 450) {
  if (!el) return;
  const prev = Number(el.dataset.v);
  el.dataset.v = String(value);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof value !== 'number' || !Number.isFinite(prev) || reduce || prev === value) {
    el.textContent = format(value);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    if (el.dataset.v !== String(value)) return; // superseded
    const k = Math.min(1, (now - start) / ms);
    const e = 1 - (1 - k) ** 3;
    el.textContent = format(prev + (value - prev) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** SVG sparkline path for values. */
export function sparkline(values, w = 280, hgt = 56, pad = 4) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - pad * 2),
    hgt - pad - ((v - min) / span) * (hgt - pad * 2),
  ]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)} ${hgt - pad}L${pts[0][0].toFixed(1)} ${hgt - pad}Z`;
  return { line, area, max, min };
}

export function icon(name) {
  return `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
