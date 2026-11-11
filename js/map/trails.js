// Trail geometry. Trails are per-aircraft position histories kept in memory
// while the app is open (see traffic.js); here we turn them into GeoJSON.

/** Selected aircraft: one segment per hop so each can be coloured by altitude. */
export function selectedTrailGeoJSON(track) {
  const features = [];
  if (!track) return { type: 'FeatureCollection', features };
  const pts = track.trail.slice();
  if (track.render) {
    const last = pts[pts.length - 1];
    pts.push([track.render.lon, track.render.lat, last ? last[2] : (track.ac.alt ?? 0), Date.now()]);
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const alt = a[2] < 0 && b[2] < 0 ? -1 : Math.max(0, (Math.max(a[2], 0) + Math.max(b[2], 0)) / 2);
    features.push({
      type: 'Feature',
      properties: { alt },
      geometry: { type: 'LineString', coordinates: [[a[0], a[1]], [b[0], b[1]]] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Faint trails for every aircraft, one LineString each, coloured by latest altitude. */
export function allTrailsGeoJSON(tracks, excludeHex) {
  const features = [];
  for (const t of tracks.values()) {
    if (t.hex === excludeHex || t.trail.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { alt: t.ac.onGround ? -1 : (t.ac.alt ?? 0) },
      geometry: { type: 'LineString', coordinates: t.trail.map((p) => [p[0], p[1]]) },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Altitude profile values for the sparkline. */
export function altitudeProfile(track) {
  return track ? track.trail.map((p) => Math.max(0, p[2])) : [];
}
