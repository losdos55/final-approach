// MapLibre map: base styles, overlay geometry, per-frame aircraft rendering.

import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { installLayers, PALETTES, EMPTY } from './layers.js';
import { registerIcons } from './icons.js';
import { circle, destination } from '../util/geo.js';
import { nmToKm } from '../util/units.js';
import { FADE_AFTER_MS } from '../traffic.js';

export const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: {
    version: 8,
    glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
    sources: {
      esri: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#05070a' } },
      { id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-saturation': -0.15, 'raster-brightness-max': 0.85 } },
    ],
  },
};

export const DATA_ATTRIBUTION = [
  'Aircraft: <a href="https://airplanes.live" target="_blank" rel="noopener">airplanes.live</a>',
  '<a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (ODbL)',
  '<a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a>',
  'Photos: <a href="https://www.planespotters.net" target="_blank" rel="noopener">planespotters.net</a>',
  'Airports: <a href="https://ourairports.com" target="_blank" rel="noopener">OurAirports</a>',
].join(' · ');

export function createMapView({ container, settings, onSelect, onBackgroundClick, onUserGesture }) {
  let styleId = settings.mapStyle;
  let labels = settings.labels;
  const data = {}; // cached overlay GeoJSON by source id
  let ready = false;
  let readyResolve;
  const readyPromise = new Promise((r) => { readyResolve = r; });

  const map = new maplibregl.Map({
    container,
    style: STYLES[styleId],
    center: [settings.airport.lon, settings.airport.lat],
    zoom: zoomForRadius(settings.radiusNm),
    attributionControl: false,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    maxPitch: 0,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: DATA_ATTRIBUTION }), 'bottom-right');

  const palette = () => PALETTES[styleId === 'light' ? 'light' : 'dark'];

  // Start with the attribution collapsed to its (i) button; it expands on tap.
  map.once('load', () => {
    container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  });

  map.on('style.load', () => {
    registerIcons(map);
    installLayers(map, data, { palette: palette(), labels });
    ready = true;
    readyResolve();
  });
  // Missing sprite images in a base style shouldn't spam the console.
  map.on('styleimagemissing', () => {});
  map.on('error', (e) => {
    const msg = e?.error?.message || '';
    if (/Failed to fetch|NetworkError|AbortError|Load failed/i.test(msg)) return; // offline tiles
    console.warn('[map]', msg);
  });

  // Generous hit target for touch: nearest aircraft within 22 px.
  map.on('click', (e) => {
    const { x, y } = e.point;
    const r = 22;
    const hits = map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers: ['fa-aircraft'] });
    if (hits.length) {
      let best = hits[0];
      let bestD = Infinity;
      for (const h of hits) {
        const p = map.project(h.geometry.coordinates);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = h; }
      }
      onSelect?.(best.properties.hex);
    } else {
      onBackgroundClick?.();
    }
  });
  map.on('dragstart', () => onUserGesture?.());
  map.on('mousemove', (e) => {
    if (!ready) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: ['fa-aircraft'] });
    map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
  });

  function setData(id, geojson) {
    data[id] = geojson;
    if (!ready) return;
    map.getSource(id)?.setData(geojson);
  }

  return {
    map,
    ready: readyPromise,
    get styleId() { return styleId; },

    setStyle(id) {
      if (id === styleId || !STYLES[id]) return;
      styleId = id;
      ready = false;
      map.setStyle(STYLES[id], { diff: false });
    },

    setLabels(on) {
      labels = on;
      if (ready && map.getLayer('fa-aircraft')) {
        map.setLayoutProperty('fa-aircraft', 'text-field', on ? ['step', ['zoom'], '', 10, ['get', 'label']] : '');
      }
    },

    /** Airport overlays: radius boundary, 5/10/20 nm rings with labels, runways. */
    setAirport(airport, runways, radiusNm, units) {
      const ring = (nm) => ({ type: 'Feature', properties: { nm }, geometry: { type: 'LineString', coordinates: circle(airport.lat, airport.lon, nm) } });
      const label = (nm) => {
        const [la, lo] = destination(airport.lat, airport.lon, 0, nm);
        const text = units === 'metric' ? `${Math.round(nmToKm(nm))} km` : `${nm} nm`;
        return { type: 'Feature', properties: { label: text }, geometry: { type: 'Point', coordinates: [lo, la] } };
      };
      const rings = [5, 10, 20].filter((nm) => nm !== radiusNm);
      setData('fa-rings', { type: 'FeatureCollection', features: rings.map(ring) });
      setData('fa-ring-labels', { type: 'FeatureCollection', features: [...rings.map(label), label(radiusNm)] });
      setData('fa-radius', { type: 'FeatureCollection', features: [ring(radiusNm)] });
      const rw = [];
      const rwLabels = [];
      for (const r of runways) {
        rw.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[r.le.lon, r.le.lat], [r.he.lon, r.he.lat]] } });
        rwLabels.push({ type: 'Feature', properties: { id: r.le.id }, geometry: { type: 'Point', coordinates: [r.le.lon, r.le.lat] } });
        rwLabels.push({ type: 'Feature', properties: { id: r.he.id }, geometry: { type: 'Point', coordinates: [r.he.lon, r.he.lat] } });
      }
      setData('fa-runways', { type: 'FeatureCollection', features: rw });
      setData('fa-runway-labels', { type: 'FeatureCollection', features: rwLabels });
    },

    /** Per-frame aircraft update. `items` are tracks with .render computed. */
    renderAircraft(items, { selectedHex, now = Date.now() }) {
      const features = [];
      for (const t of items) {
        if (!t.render) continue;
        const ac = t.ac;
        const age = now - ac.posTime;
        const op = age > FADE_AFTER_MS ? Math.max(0.25, 1 - (age - FADE_AFTER_MS) / 30000) : 1;
        const sel = t.hex === selectedHex ? 1 : 0;
        features.push({
          type: 'Feature',
          properties: {
            hex: t.hex,
            cls: ac.cls,
            rot: t.render.rot,
            alt: ac.onGround ? -1 : (ac.alt ?? 0),
            mil: ac.military ? 1 : 0,
            watch: t.watch && t.inRadius ? 1 : 0,
            sel,
            op,
            z: sel ? 1e6 : (ac.alt ?? 0),
            label: [ac.callsign || ac.reg || ac.hex.toUpperCase(), ac.type].filter(Boolean).join(' · '),
          },
          geometry: { type: 'Point', coordinates: [t.render.lon, t.render.lat] },
        });
      }
      setData('fa-aircraft', { type: 'FeatureCollection', features });
    },

    setSelectedTrail(geojson) { setData('fa-trail-sel', geojson); },
    setAllTrails(geojson) { setData('fa-trails-all', geojson ?? EMPTY); },

    setUser(pos) {
      if (!pos) return setData('fa-user', EMPTY);
      const accNm = Math.max(5, pos.accuracy || 0) / 1852;
      setData('fa-user', {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { kind: 'accuracy' }, geometry: { type: 'Polygon', coordinates: [circle(pos.lat, pos.lon, accNm, 48)] } },
          { type: 'Feature', properties: { kind: 'me' }, geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] } },
        ],
      });
    },

    /** Gentle pulse for watchlist glow rings (skipped for reduced motion). */
    pulse(phase) {
      if (!ready || !map.getLayer('fa-watch-glow')) return;
      const s = (Math.sin(phase) + 1) / 2;
      map.setPaintProperty('fa-watch-glow', 'circle-radius', 15 + s * 7);
      map.setPaintProperty('fa-watch-glow', 'circle-opacity', 0.1 + s * 0.14);
    },

    flyTo(lat, lon, zoom) {
      map.easeTo({ center: [lon, lat], zoom: zoom ?? Math.max(map.getZoom(), 10), duration: 800, padding: viewPadding() });
    },
    follow(lat, lon) {
      map.jumpTo({ center: [lon, lat], padding: viewPadding() });
    },
    recenter(airport, radiusNm) {
      map.easeTo({ center: [airport.lon, airport.lat], zoom: zoomForRadius(radiusNm), duration: 700, padding: viewPadding() });
    },
    resize() { map.resize(); },
  };

  function viewPadding() {
    const sheet = document.querySelector('.sheet');
    const desktop = matchMedia('(min-width: 900px)').matches;
    if (desktop && sheet) return { left: sheet.offsetWidth + 24, top: 0, right: 0, bottom: 0 };
    const visible = sheet ? Math.max(0, window.innerHeight - sheet.getBoundingClientRect().top) : 0;
    return { top: 70, bottom: Math.min(visible, window.innerHeight * 0.6), left: 0, right: 0 };
  }
}

/** Rough zoom level that fits a radius on a phone screen. */
export function zoomForRadius(nm) {
  return Math.max(6, Math.min(13, 12.6 - Math.log2(nm / 2.2)));
}
