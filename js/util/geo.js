// Small spherical-earth helpers. Distances in nautical miles, angles in degrees.

export const EARTH_RADIUS_NM = 3440.065;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Normalise an angle to [0, 360). */
export function norm360(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Smallest absolute difference between two headings, 0..180. */
export function angleDiff(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

/** Great-circle distance (haversine) in nautical miles. */
export function distanceNm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing from point 1 to point 2, degrees true [0, 360). */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(toDeg(Math.atan2(y, x)));
}

/** Destination point given start, true bearing and distance (nm). Returns [lat, lon]. */
export function destination(lat, lon, bearing, distNm) {
  const d = distNm / EARTH_RADIUS_NM;
  const b = toRad(bearing);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [toDeg(p2), ((toDeg(l2) + 540) % 360) - 180];
}

/**
 * Fast flat-earth projection, accurate for the short hops used in dead reckoning.
 * Returns [lat, lon].
 */
export function projectFlat(lat, lon, bearing, distNm) {
  const b = toRad(bearing);
  const dLat = (distNm * Math.cos(b)) / 60;
  const dLon = (distNm * Math.sin(b)) / (60 * Math.cos(toRad(lat)) || 1e-9);
  return [lat + dLat, lon + dLon];
}

/** Ring polygon (closed) of `radiusNm` around a point, as GeoJSON [lon, lat] coords. */
export function circle(lat, lon, radiusNm, steps = 96) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const [la, lo] = destination(lat, lon, (i * 360) / steps, radiusNm);
    coords.push([lo, la]);
  }
  return coords;
}
