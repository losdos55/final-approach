// Smooth motion: dead-reckon each aircraft forward from its last report using
// ground speed and track, and ease from where it was drawn to the new truth
// when fresh data arrives, so icons never jump.

import { projectFlat } from '../util/geo.js';

const BLEND_MS = 1200;
const MAX_DR_SEC = 30; // stop extrapolating stale reports

const easeOutCubic = (x) => 1 - (1 - x) ** 3;

/** Where the aircraft should be at `nowMs` according to its last report. */
export function targetPosition(ac, nowMs) {
  const age = Math.min(MAX_DR_SEC, Math.max(0, (nowMs - ac.posTime) / 1000));
  if (!ac.gs || ac.track == null || ac.gs < 1) return [ac.lat, ac.lon];
  return projectFlat(ac.lat, ac.lon, ac.track, (ac.gs * age) / 3600);
}

/** Compute and store the rendered position/rotation for a track. */
export function renderPosition(t, nowMs) {
  const ac = t.ac;
  let [lat, lon] = targetPosition(ac, nowMs);
  let rot = ac.heading ?? ac.track ?? 0;
  if (t.blend) {
    const k = Math.min(1, (nowMs - t.blend.t) / BLEND_MS);
    if (k >= 1) t.blend = null;
    else {
      const r = 1 - easeOutCubic(k);
      lat += t.blend.dLat * r;
      lon += t.blend.dLon * r;
      rot += t.blend.dRot * r;
    }
  }
  t.render = { lat, lon, rot: ((rot % 360) + 360) % 360 };
  return t.render;
}

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
