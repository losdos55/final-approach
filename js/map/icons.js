// Original aircraft silhouettes (drawn for this project), nose up, in a 64×64
// box. Each shape is a list of primitives; symmetric parts are mirrored about
// x = 32. The same geometry renders to SVG (lists, placeholders) and to a
// canvas that is converted into a signed distance field for MapLibre, so the
// map can recolour icons by altitude.

const C = 32;

// Primitive helpers -------------------------------------------------------
// body(halfWidth, noseY, tailY, tailHalf)  capsule-like fuselage
// wing(points)      right-side polygon [[dx, y], ...] mirrored to the left
// pod(dx, y, w, h)  rounded rectangle on both sides
// disc(cx, cy, rx, ry) single ellipse
// bar(cx, cy, len, w, angleDeg)  rotated bar (rotor blades)

const body = (hw, y0, y1, th = hw * 0.45) => ({ k: 'body', hw, y0, y1, th });
const wing = (pts) => ({ k: 'wing', pts });
const pod = (dx, y, w, h) => ({ k: 'pod', dx, y, w, h });
const disc = (cx, cy, rx, ry) => ({ k: 'disc', cx, cy, rx, ry });
const bar = (cx, cy, len, w, a) => ({ k: 'bar', cx, cy, len, w, a });

export const SHAPES = {
  narrow: [
    body(3.4, 5, 59),
    wing([[2.5, 25], [28, 38.5], [28, 41], [2.5, 35.5]]),
    wing([[2, 50], [12.5, 56.5], [12.5, 58.6], [2, 56.5]]),
    pod(11.5, 30.5, 3.4, 6.5),
  ],
  wide: [
    body(4.6, 2, 61),
    wing([[3.5, 22], [30.5, 38], [30.5, 41.5], [3.5, 35]]),
    wing([[2.5, 50], [14.5, 57.5], [14.5, 60], [2.5, 57]]),
    pod(11, 28.5, 3.8, 7),
    pod(20.5, 33.5, 3.4, 6.5),
  ],
  regional: [
    body(2.9, 8, 57),
    wing([[2, 28], [22, 35.5], [22, 38], [2, 34]]),
    wing([[1, 51], [10.5, 52.5], [10.5, 55], [1, 55]]),
    pod(5.2, 41, 3, 7.5),
  ],
  bizjet: [
    body(2.6, 11, 55),
    wing([[2, 29], [19.5, 37.5], [19.5, 39.5], [2, 35]]),
    wing([[0.8, 50], [9, 51.5], [9, 53.6], [0.8, 54]]),
    pod(4.8, 41, 2.8, 6.5),
  ],
  turboprop: [
    body(3, 9, 57),
    wing([[2.5, 25], [29.5, 26], [29.5, 30.5], [2.5, 31.5]]),
    wing([[1.5, 50], [11.5, 51], [11.5, 54.5], [1.5, 55]]),
    pod(10.5, 19.5, 3.4, 12),
  ],
  piston: [
    body(2.7, 13, 53, 1),
    wing([[2, 25.5], [24.5, 25.5], [24.5, 31], [2, 31.5]]),
    wing([[1, 47.5], [9.5, 47.5], [9.5, 51.5], [1, 51.5]]),
    bar(32, 12.6, 11, 1.6, 0),
  ],
  heli: [
    disc(32, 27, 6.2, 10.5),
    { k: 'rect', x: 31, y: 34, w: 2, h: 23 },
    { k: 'rect', x: 27, y: 54.5, w: 10, h: 2.4 },
    bar(32, 26, 54, 2.2, 45),
    bar(32, 26, 54, 2.2, -45),
  ],
  fighter: [
    body(2.8, 3, 58, 2.2),
    wing([[2.4, 21], [9, 33], [21, 42], [21, 45], [2.4, 45]]),
    wing([[2, 49], [10.5, 56], [10.5, 58.5], [2, 57.5]]),
  ],
  milheavy: [
    body(4.8, 5, 58, 1.6),
    wing([[3.5, 21], [30.5, 29.5], [30.5, 33.5], [3.5, 31]]),
    wing([[1.5, 52], [15, 54], [15, 57], [1.5, 57]]),
    pod(11.5, 21, 3.4, 7.5),
    pod(21, 24.2, 3.2, 7),
  ],
  light: [
    body(1.8, 16, 52, 0.8),
    wing([[1.5, 27.5], [30.5, 28.5], [30.5, 31], [1.5, 32]]),
    wing([[1, 47], [7.5, 47], [7.5, 49.5], [1, 49.5]]),
  ],
};

const f = (n) => Math.round(n * 100) / 100;

/** SVG path data for one primitive (may contain several sub-paths). */
function primitivePaths(p) {
  switch (p.k) {
    case 'body': {
      const { hw, y0, y1, th } = p;
      return [`M${f(C - hw)} ${f(y0 + hw * 1.6)}C${f(C - hw)} ${f(y0 + 0.3)} ${f(C + hw)} ${f(y0 + 0.3)} ${f(C + hw)} ${f(y0 + hw * 1.6)}`
        + `L${f(C + hw)} ${f(y1 - 12)}L${f(C + th)} ${f(y1)}L${f(C - th)} ${f(y1)}L${f(C - hw)} ${f(y1 - 12)}Z`];
    }
    case 'wing': {
      const right = p.pts.map(([dx, y]) => [C + dx, y]);
      const left = p.pts.map(([dx, y]) => [C - dx, y]);
      const toD = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
      return [toD(right), toD(left)];
    }
    case 'pod': {
      const { dx, y, w, h } = p;
      const r = Math.min(w, h) / 2;
      const rr = (x) => `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`;
      return [rr(C + dx - w / 2), rr(C - dx - w / 2)];
    }
    case 'disc': {
      const { cx, cy, rx, ry } = p;
      return [`M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`];
    }
    case 'rect':
      return [`M${f(p.x)} ${f(p.y)}h${f(p.w)}v${f(p.h)}h${f(-p.w)}Z`];
    case 'bar': {
      const a = (p.a * Math.PI) / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      const vx = -uy, vy = ux;
      const hl = p.len / 2, hw = p.w / 2;
      const pts = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([s, t]) => [p.cx + s * ux + t * vx, p.cy + s * uy + t * vy]);
      return [`M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`];
    }
    default:
      return [];
  }
}

export function shapePaths(cls) {
  return (SHAPES[cls] ?? SHAPES.light).flatMap(primitivePaths);
}

/** Inline SVG markup for UI use (inherits currentColor). */
export function silhouetteSVG(cls, { size = 24, rotate = 0, title = '' } = {}) {
  const paths = shapePaths(cls).map((d) => `<path d="${d}"/>`).join('');
  const t = title ? `<title>${title}</title>` : '';
  return `<svg class="silhouette" viewBox="0 0 64 64" width="${size}" height="${size}" fill="currentColor" aria-hidden="${title ? 'false' : 'true'}" style="transform:rotate(${rotate}deg)">${t}${paths}</svg>`;
}

// SDF generation ----------------------------------------------------------

const INF = 1e20;

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    do {
      const r = v[k];
      s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, j = 0; q < n; q++) {
    while (z[j + 1] < q) j++;
    const r = v[j];
    d[q] = (q - r) * (q - r) + f[r];
  }
}

function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
}

/**
 * Convert an alpha mask into SDF RGBA data in the encoding MapLibre expects
 * for `sdf: true` images (edge at alpha ≈ 0.75, `radius` px of falloff).
 */
export function alphaToSDF(alpha, w, h, radius = 8, cutoff = 0.25) {
  const outer = new Float64Array(w * h);
  const inner = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i] / 255;
    if (a >= 0.999) { outer[i] = 0; inner[i] = INF; }
    else if (a <= 0.001) { outer[i] = INF; inner[i] = 0; }
    else {
      const dd = Math.max(0, 0.5 - a);
      outer[i] = dd * dd;
      const di = Math.max(0, a - 0.5);
      inner[i] = di * di;
    }
  }
  edt2d(outer, w, h);
  edt2d(inner, w, h);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const dist = outer[i] - inner[i];
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = Math.round(255 - 255 * (dist / radius + cutoff));
  }
  return out;
}

/** Rasterise a silhouette and return {width, height, data} SDF image. */
export function sdfImage(cls, px = 72, pad = 8) {
  const size = px + pad * 2;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d');
  ctx.translate(pad, pad);
  ctx.scale(px / 64, px / 64);
  ctx.fillStyle = '#000';
  for (const d of shapePaths(cls)) ctx.fill(new Path2D(d));
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const alpha = new Uint8ClampedArray(size * size);
  for (let i = 0; i < size * size; i++) alpha[i] = rgba[i * 4 + 3];
  return { width: size, height: size, data: alphaToSDF(alpha, size, size, pad) };
}

/** Register every silhouette with a MapLibre map as an SDF icon "ac-<class>". */
export function registerIcons(map) {
  for (const cls of Object.keys(SHAPES)) {
    const id = `ac-${cls}`;
    if (map.hasImage(id)) continue;
    map.addImage(id, sdfImage(cls), { sdf: true, pixelRatio: 3 });
  }
}
