// Overlay sources and layers. Installed on every style load (style switches
// wipe custom layers), fed from cached GeoJSON so nothing is lost.

const FONT = ['Montserrat SemiBold', 'Open Sans Bold', 'Noto Sans Regular'];
const FONT_MEDIUM = ['Montserrat Medium', 'Open Sans Regular', 'Noto Sans Regular'];

export const EMPTY = { type: 'FeatureCollection', features: [] };

/** Altitude colour ramps: ground gray, low warm → high cool. */
export const PALETTES = {
  dark: {
    ground: '#8d939e',
    stops: [0, '#ff7a45', 2000, '#ffad3b', 5000, '#e6dc55', 10000, '#5fe0a8', 20000, '#3ec7ff', 30000, '#7390ff', 40000, '#b98cff'],
    accent: '#2ee6d6',
    military: '#c7c27a',
    ring: 'rgba(255,255,255,0.22)',
    ringText: 'rgba(255,255,255,0.55)',
    runway: '#e9f6ff',
    labelText: '#e8edf3',
    labelHalo: 'rgba(0,0,0,0.85)',
    outline: 'rgba(0,0,0,0.75)',
  },
  light: {
    ground: '#6b7280',
    stops: [0, '#e8590c', 2000, '#e8890c', 5000, '#b5a400', 10000, '#0f9d6b', 20000, '#0b8fd6', 30000, '#3654e0', 40000, '#7b3fe0'],
    accent: '#0aa5a0',
    military: '#6f6a1f',
    ring: 'rgba(20,30,40,0.28)',
    ringText: 'rgba(20,30,40,0.65)',
    runway: '#1f2933',
    labelText: '#111827',
    labelHalo: 'rgba(255,255,255,0.9)',
    outline: 'rgba(255,255,255,0.9)',
  },
};

export function altColorExpr(p, prop = 'alt') {
  return ['case', ['<', ['get', prop], 0], p.ground, ['interpolate', ['linear'], ['get', prop], ...p.stops]];
}

export function installLayers(map, data, { palette, labels }) {
  const p = palette;
  const src = (id) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: data[id] ?? EMPTY });
  };
  ['fa-radius', 'fa-rings', 'fa-ring-labels', 'fa-runways', 'fa-runway-labels', 'fa-trails-all',
    'fa-trail-sel', 'fa-user', 'fa-aircraft'].forEach(src);

  const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };

  add({
    id: 'fa-radius', type: 'line', source: 'fa-radius',
    paint: { 'line-color': p.accent, 'line-opacity': 0.55, 'line-width': 1.4, 'line-dasharray': [3, 3] },
  });
  add({
    id: 'fa-rings', type: 'line', source: 'fa-rings',
    paint: { 'line-color': p.ring, 'line-width': 1 },
  });
  add({
    id: 'fa-ring-labels', type: 'symbol', source: 'fa-ring-labels',
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT_MEDIUM, 'text-size': 10.5, 'text-allow-overlap': true },
    paint: { 'text-color': p.ringText, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.2 },
  });
  add({
    id: 'fa-runways', type: 'line', source: 'fa-runways',
    layout: { 'line-cap': 'butt' },
    paint: {
      'line-color': p.runway,
      'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 1.5, 13, 4, 16, 22],
      'line-opacity': 0.9,
    },
  });
  add({
    id: 'fa-runway-labels', type: 'symbol', source: 'fa-runway-labels', minzoom: 11,
    layout: {
      'text-field': ['get', 'id'], 'text-font': FONT, 'text-size': 11,
      'text-allow-overlap': false, 'text-rotation-alignment': 'viewport',
    },
    paint: { 'text-color': p.runway, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.4 },
  });
  add({
    id: 'fa-trails-all', type: 'line', source: 'fa-trails-all',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': altColorExpr(p), 'line-width': 1.2, 'line-opacity': 0.28 },
  });
  add({
    id: 'fa-trail-sel', type: 'line', source: 'fa-trail-sel',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': altColorExpr(p), 'line-width': 3, 'line-opacity': 0.95 },
  });
  add({
    id: 'fa-user-acc', type: 'fill', source: 'fa-user', filter: ['==', ['get', 'kind'], 'accuracy'],
    paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.12, 'fill-outline-color': 'rgba(59,130,246,0.5)' },
  });
  add({
    id: 'fa-user-dot', type: 'circle', source: 'fa-user', filter: ['==', ['get', 'kind'], 'me'],
    paint: { 'circle-radius': 6.5, 'circle-color': '#3b82f6', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 },
  });
  add({
    id: 'fa-watch-glow', type: 'circle', source: 'fa-aircraft', filter: ['==', ['get', 'watch'], 1],
    paint: {
      'circle-radius': 18,
      'circle-color': p.accent,
      'circle-opacity': 0.18,
      'circle-blur': 0.7,
      'circle-stroke-color': p.accent,
      'circle-stroke-width': 1.2,
      'circle-stroke-opacity': 0.5,
    },
  });
  add({
    id: 'fa-aircraft', type: 'symbol', source: 'fa-aircraft',
    layout: {
      'icon-image': ['concat', 'ac-', ['get', 'cls']],
      'icon-rotate': ['get', 'rot'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'],
        6, ['case', ['==', ['get', 'sel'], 1], 0.8, 0.6],
        10, ['case', ['==', ['get', 'sel'], 1], 1.2, 0.95],
        14, ['case', ['==', ['get', 'sel'], 1], 1.55, 1.25]],
      'symbol-sort-key': ['get', 'z'],
      'text-field': labels ? ['step', ['zoom'], '', 10, ['get', 'label']] : '',
      'text-font': FONT_MEDIUM,
      'text-size': 10.5,
      'text-anchor': 'left',
      'text-offset': [1.5, 0],
      'text-optional': true,
      'text-justify': 'left',
    },
    paint: {
      'icon-color': ['case', ['==', ['get', 'sel'], 1], p.accent, altColorExpr(p)],
      'icon-halo-color': ['case', ['==', ['get', 'mil'], 1], p.military, p.outline],
      'icon-halo-width': ['case', ['==', ['get', 'mil'], 1], 2.2, 1.1],
      'icon-halo-blur': 0.4,
      'icon-opacity': ['get', 'op'],
      'text-color': p.labelText,
      'text-halo-color': p.labelHalo,
      'text-halo-width': 1.3,
      'text-opacity': ['get', 'op'],
    },
  });
}
