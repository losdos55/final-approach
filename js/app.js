// Final Approach — bootstrap and wiring.

import { loadSettings, saveSettings, validate, DEFAULT_AIRPORT } from './settings.js';
import { createStore } from './state.js';
import { createFeed } from './providers/index.js';
import { createTraffic } from './traffic.js';
import { createRouteService } from './routes.js';
import { createPhotoService } from './photos.js';
import { runwaysFor } from './airports.js';
import { loadDemo } from './demo.js';
import { summarize } from './spotting.js';
import { createMapView } from './map/map.js';
import { renderPosition, reducedMotion } from './map/animation.js';
import { selectedTrailGeoJSON, allTrailsGeoJSON } from './map/trails.js';
import { createBubbles } from './map/bubbles.js';
import { createSheet } from './ui/sheet.js';
import { createLists, buildLists, TABS } from './ui/lists.js';
import { createDetails } from './ui/details.js';
import { initSearch } from './ui/searchbar.js';
import { initFilters, passesFilter } from './ui/filters.js';
import { createSettingsView } from './ui/settings-view.js';
import { initToasts, toast, chime } from './ui/toasts.js';
import { limiter, throttle } from './util/throttle.js';
import { cachePrune } from './util/db.js';
import { $, $$, esc } from './util/dom.js';
import { radiusLabel } from './util/units.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') && params.get('demo') !== '0';

// ---------------------------------------------------------------- settings
let settings = loadSettings();
/** Effective settings: demo mode always uses the fixture's airport (KIWA). */
const eff = () => (DEMO ? { ...settings, airport: { ...DEFAULT_AIRPORT } } : settings);

const ui = createStore({
  selectedHex: null,
  following: false,
  query: '',
  status: { state: 'idle', message: '' },
  user: null,
});

applyTheme(settings.theme);
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme(settings.theme));

function applyTheme(theme) {
  const light = theme === 'light' || (theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
}

// ---------------------------------------------------------------- services
initToasts($('#toasts'));
const traffic = createTraffic();
const photos = createPhotoService({ onPhoto: () => scheduleUI() });
const routes = createRouteService({ getSettings: eff, onRoutes: () => { traffic.reclassify(classCtx()); scheduleUI(); } });
const classCtx = () => ({ airport: eff().airport, settings: eff(), routeFor: (cs) => routes.get(cs) ?? null });

// ---------------------------------------------------------------- map
const mapView = createMapView({
  container: $('#map'),
  settings: eff(),
  onSelect: (hex) => select(hex),
  onBackgroundClick: () => {},
  onUserGesture: () => {
    if (ui.get().following) { ui.set({ following: false }); scheduleUI(); }
  },
});

const bubbles = createBubbles({
  map: mapView.map,
  container: $('#bubbles'),
  photos,
  getUnits: () => settings.units,
  onOpen: (hex) => select(hex, { fromBubble: true }),
});

async function setAirportOverlays() {
  const s = eff();
  let rw = [];
  try { rw = s.airport.custom ? [] : await runwaysFor(s.airport.ident); } catch { /* offline */ }
  mapView.setAirport(s.airport, rw, s.radiusNm, s.units);
  $('#airport-chip').textContent = s.airport.icao || s.airport.ident || 'Custom';
  $('#airport-chip').setAttribute('aria-label', `Airport ${s.airport.name}. Change airport`);
}
setAirportOverlays();

// ---------------------------------------------------------------- sheet & UI
const sheet = createSheet($('#sheet'), { onChange: () => {} });
let currentTab = 'arrivals';
const lists = createLists({ el: $('#list'), photos, onSelect: (hex) => select(hex, { fly: true }) });
const details = createDetails({
  el: $('#detail'),
  photos,
  actions: {
    back: () => deselect(),
    close: () => { deselect(); sheet.set('peek'); },
    follow: () => {
      const following = !ui.get().following;
      ui.set({ following });
      if (following) sheet.set('peek');
      scheduleUI();
    },
    watchType: (hex) => {
      const t = traffic.tracks.get(hex);
      if (!t?.ac.type) return;
      const types = settings.watchlist.types;
      const on = types.includes(t.ac.type);
      updateSettings({ watchlist: { ...settings.watchlist, types: on ? types.filter((x) => x !== t.ac.type) : [...types, t.ac.type] } });
      toast({ title: on ? 'Removed from watchlist' : 'Added to watchlist', message: t.ac.type, timeout: 2200 });
    },
    copyReg: async (hex) => {
      const reg = traffic.tracks.get(hex)?.ac.reg;
      if (!reg) return;
      try {
        await navigator.clipboard.writeText(reg);
        toast({ title: 'Copied', message: reg, timeout: 1800 });
      } catch {
        toast({ title: 'Registration', message: reg, timeout: 4000 });
      }
    },
  },
});

$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  currentTab = tab.dataset.tab;
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  $('#list').setAttribute('aria-labelledby', tab.id);
  $('#list').scrollTop = 0;
  lists.setTab(currentTab);
  sheet.ensure('half');
  renderUI();
}));
$('#list').addEventListener('list-action', (e) => {
  if (e.detail === 'edit-watchlist') settingsView.open();
});

initSearch({
  input: $('#search'),
  clear: $('#search-clear'),
  onChange: (query) => {
    ui.set({ query });
    renderUI();
    if (query) sheet.ensure('half');
  },
});

const filters = initFilters({ getSettings: () => settings, update: (p) => updateSettings(p) });
filters.sync(settings);

const settingsView = createSettingsView({
  el: $('#settings'),
  getSettings: eff,
  isDemo: DEMO,
  update: (patch, opts) => updateSettings(patch, opts),
  onClose: () => { settingsView.close(); $('#btn-settings').focus(); },
});
$('#btn-settings').addEventListener('click', () => settingsView.open());
$('#airport-chip').addEventListener('click', () => settingsView.openAirportPicker());
$('#btn-recenter').addEventListener('click', () => {
  ui.set({ following: false });
  mapView.recenter(eff().airport, eff().radiusNm);
});
$('#status').addEventListener('click', () => {
  const s = ui.get().status;
  toast({
    title: s.provider ? `Data: ${s.provider}` : 'Data status',
    message: s.message || (s.lastOk ? `Updated ${Math.round((Date.now() - s.lastOk) / 1000)} s ago` : 'Waiting for the first update'),
    timeout: 4000,
    id: 'status',
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (settingsView.isOpen) settingsView.close();
  else if (ui.get().selectedHex) deselect();
});

// ---------------------------------------------------------------- settings changes
function updateSettings(patch, { replace = false } = {}) {
  const prev = settings;
  settings = validate(replace ? patch : { ...settings, ...patch });
  saveSettings(settings);
  const p = prev;
  const n = settings;
  if (p.theme !== n.theme) applyTheme(n.theme);
  if (p.mapStyle !== n.mapStyle) mapView.setStyle(n.mapStyle);
  if (p.labels !== n.labels) mapView.setLabels(n.labels);
  const airportChanged = JSON.stringify(p.airport) !== JSON.stringify(n.airport);
  if (airportChanged && !DEMO) {
    traffic.clear();
    deselect();
    mapView.recenter(n.airport, n.radiusNm);
  }
  if (airportChanged || p.radiusNm !== n.radiusNm || p.units !== n.units) setAirportOverlays();
  if (p.radiusNm !== n.radiusNm && !airportChanged) mapView.recenter(eff().airport, n.radiusNm);
  if (airportChanged || p.radiusNm !== n.radiusNm || p.provider !== n.provider || p.proxyUrl !== n.proxyUrl) feed?.refresh();
  if (p.wakeLock !== n.wakeLock) n.wakeLock ? acquireWakeLock() : releaseWakeLock();
  traffic.reclassify(classCtx());
  if (p.units !== n.units) bubbles.refresh();
  filters.sync(n);
  renderUI();
}

// ---------------------------------------------------------------- selection
function select(hex, { fly = false } = {}) {
  const t = traffic.tracks.get(hex);
  if (!t) return;
  ui.set({ selectedHex: hex, following: false });
  details.open(t, detailCtx(t));
  $('#view-board').hidden = true;
  $('#view-detail').hidden = false;
  $('#app').dataset.detail = 'true';
  sheet.ensure('half');
  if (fly && t.render) mapView.flyTo(t.render.lat, t.render.lon);
  lastSelTrail = 0;
  renderUI();
}

function deselect() {
  if (!ui.get().selectedHex) return;
  ui.set({ selectedHex: null, following: false });
  details.close();
  $('#view-detail').hidden = true;
  $('#view-board').hidden = false;
  $('#app').dataset.detail = 'false';
  mapView.setSelectedTrail({ type: 'FeatureCollection', features: [] });
  renderUI();
}

const detailCtx = (t) => ({
  units: settings.units,
  user: ui.get().user,
  airport: eff().airport,
  watchlist: settings.watchlist,
  following: ui.get().following,
  lost: t ? Date.now() - t.ac.posTime > 30000 : false,
});

// ---------------------------------------------------------------- rendering
let visible = [];

function filterCtx() {
  return { filter: settings.filter, hideGround: settings.hideGround, query: ui.get().query };
}

function renderUI() {
  const s = eff();
  const { selectedHex, status } = ui.get();
  const fctx = filterCtx();
  const all = [...traffic.tracks.values()].filter((t) => t.ac && t.spot);
  visible = all.filter((t) => t.hex === selectedHex || passesFilter(t, fctx));
  const inRadius = visible.filter((t) => t.inRadius);

  // Summary + tab counts
  const sum = summarize(all.filter((t) => t.inRadius).map((t) => ({ status: t.spot.status, ac: t.ac })));
  const sumEl = $('#summary');
  if (!all.length) {
    sumEl.textContent = status.state === 'error' ? 'No live data' : status.state === 'paused' ? 'Paused' : 'Looking for aircraft…';
  } else {
    const parts = [
      `<span class="in">${sum.inbound} inbound</span>`,
      `<span class="out">${sum.outbound} outbound</span>`,
      sum.military ? `<span class="mil">${sum.military} military</span>` : `${sum.total} within ${esc(radiusLabel(s.radiusNm, s.units))}`,
    ];
    sumEl.innerHTML = parts.join('<span class="sep">·</span>');
  }
  const L = buildLists(inRadius);
  for (const tab of TABS) {
    const c = $(`#tab-${tab} .count`);
    if (c) c.textContent = L[tab].length ? String(L[tab].length) : '';
  }
  lists.render(L[currentTab], {
    units: s.units,
    selectedHex,
    radiusNm: s.radiusNm,
    status: status.state,
    statusMessage: status.message,
    count: all.length,
    filtered: !!fctx.query || fctx.filter !== 'all',
  });

  // Details
  if (selectedHex) {
    const t = traffic.tracks.get(selectedHex);
    if (t) details.update(t, detailCtx(t));
  }

  bubbles.update(traffic.tracks, { selectedHex, watchBubbles: s.photoBubbles });
  mapView.setAllTrails(s.trailsAll ? allTrailsGeoJSON(new Map(visible.map((t) => [t.hex, t])), selectedHex) : null);
  renderStatus();
}
const scheduleUI = throttle(renderUI, 250);

function renderStatus() {
  const s = ui.get().status;
  let state = s.state;
  const pollMs = eff().pollSec * 1000;
  if (state === 'fresh' && s.lastOk && Date.now() - s.lastOk > Math.max(15000, pollMs * 3)) state = 'delayed';
  const dot = $('.status-dot');
  dot.dataset.state = state;
  const text = state === 'fresh' ? (s.provider || 'Live')
    : state === 'delayed' ? 'Delayed'
      : state === 'error' ? 'No data'
        : state === 'paused' ? 'Paused' : 'Starting…';
  $('.status-text').textContent = text;
  $('#status').setAttribute('aria-label', `Data status: ${text}. ${s.message || ''}`);

  const banner = $('#banner');
  if (s.cors && !DEMO) {
    banner.hidden = false;
    banner.className = 'banner info';
    if (!banner.dataset.kind) {
      banner.dataset.kind = 'cors';
      banner.innerHTML = '<span>Live data needs a proxy in this browser.</span><button type="button" data-b="settings">Set up</button><button type="button" data-b="demo">Demo</button>';
    }
  } else if (banner.dataset.kind === 'cors') {
    banner.hidden = true;
    banner.dataset.kind = '';
  }
}
$('#banner').addEventListener('click', (e) => {
  const b = e.target.closest('[data-b]');
  if (b?.dataset.b === 'settings') settingsView.open();
  if (b?.dataset.b === 'demo') location.search = '?demo=1';
});
setInterval(renderStatus, 1000);

// ---------------------------------------------------------------- data
function onData(payload) {
  const s = eff();
  const { entered, firstBatch } = traffic.update(payload, classCtx());
  const tracks = [...traffic.tracks.values()];

  if (s.routes) routes.request(tracks.filter((t) => t.inRadius && !t.ac.onGround && t.ac.callsign).map((t) => t.ac));

  // Photo prefetch: watchlist matches in range + the top of Arrivals/Departures.
  const inR = tracks.filter((t) => t.inRadius);
  const L = buildLists(inR);
  const wanted = new Set();
  if (s.photoBubbles) for (const t of L.watchlist.slice(0, 6)) { wanted.add(t.hex); photos.get(t.ac, 1); }
  for (const t of [...L.arrivals.slice(0, 4), ...L.departures.slice(0, 4)]) { wanted.add(t.hex); photos.get(t.ac, 2); }
  const sel = ui.get().selectedHex;
  if (sel) wanted.add(sel);
  photos.prune(wanted);

  if (firstBatch) {
    const n = inR.filter((t) => t.watch).length;
    if (n) toast({ title: `${n} watchlist ${n === 1 ? 'aircraft' : 'aircraft'} nearby`, kind: 'watch', timeout: 4000 });
  } else if (entered.length) {
    for (const t of entered.slice(0, 2)) {
      const ac = t.ac;
      toast({
        title: `${ac.desc || ac.type || 'Watchlist match'}`,
        message: `${ac.callsign || ac.reg || ac.hex.toUpperCase()} entered ${radiusLabel(s.radiusNm, s.units)} · ${t.spot.status}`,
        kind: 'watch',
        action: { label: 'Show', onClick: () => select(t.hex, { fly: true }) },
        timeout: 7000,
      });
    }
    if (settings.chime && !settings.muted) chime();
  }
  renderUI();
}

let feed = null; // created in start() once we know whether this is demo mode

// ---------------------------------------------------------------- animation loop
let lastMap = 0;
let lastSelTrail = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = Date.now();
  if (now - lastMap < 33) { bubbles.position(); return; } // ~30 fps is plenty for the map layer
  lastMap = now;
  for (const t of traffic.tracks.values()) if (t.ac) renderPosition(t, now);
  const { selectedHex, following } = ui.get();
  mapView.renderAircraft(visible, { selectedHex, now });
  bubbles.position();
  const sel = selectedHex && traffic.tracks.get(selectedHex);
  if (sel?.render) {
    if (now - lastSelTrail > 120) { mapView.setSelectedTrail(selectedTrailGeoJSON(sel)); lastSelTrail = now; }
    if (following) mapView.follow(sel.render.lat, sel.render.lon);
  }
  if (!reducedMotion()) mapView.pulse(now / 400);
}
requestAnimationFrame(frame);

// Keep stale aircraft fading/removed even without new data.
setInterval(() => { traffic.prune(); scheduleUI(); }, 5000);

// ---------------------------------------------------------------- visibility, wake lock
let wakeLock = null;
async function acquireWakeLock() {
  if (!settings.wakeLock || !('wakeLock' in navigator) || document.hidden) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener?.('release', () => { wakeLock = null; });
  } catch { /* denied or unsupported */ }
}
function releaseWakeLock() {
  wakeLock?.release?.();
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    feed?.pause();
  } else {
    feed?.resume();
    acquireWakeLock();
  }
});
acquireWakeLock();

// ---------------------------------------------------------------- geolocation
let watchId = null;
$('#btn-locate').addEventListener('click', () => {
  const btn = $('#btn-locate');
  if (watchId !== null) {
    const u = ui.get().user;
    if (u && btn.dataset.centered !== '1') { mapView.flyTo(u.lat, u.lon); btn.dataset.centered = '1'; return; }
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    ui.set({ user: null });
    mapView.setUser(null);
    btn.setAttribute('aria-pressed', 'false');
    btn.dataset.centered = '';
    scheduleUI();
    return;
  }
  if (!('geolocation' in navigator)) {
    toast({ title: 'Location unavailable', message: 'This browser does not support geolocation.', kind: 'error' });
    return;
  }
  btn.setAttribute('aria-pressed', 'true');
  let first = true;
  watchId = navigator.geolocation.watchPosition((pos) => {
    const user = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
    ui.set({ user });
    mapView.setUser(user);
    if (first) { first = false; mapView.flyTo(user.lat, user.lon); btn.dataset.centered = '1'; }
    scheduleUI();
  }, (err) => {
    toast({ title: 'Location unavailable', message: err.code === 1 ? 'Permission was denied.' : 'Could not get your position.', kind: 'error' });
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    btn.setAttribute('aria-pressed', 'false');
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
});
mapView.map.on('movestart', (e) => { if (e.originalEvent) $('#btn-locate').dataset.centered = ''; });

// ---------------------------------------------------------------- service worker
let reloadOnControllerChange = false;
if ('serviceWorker' in navigator && !params.has('nosw')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const offer = (worker) => toast({
        title: 'Update available',
        message: 'Tap to reload.',
        timeout: 0,
        id: 'update',
        action: {
          label: 'Reload',
          onClick: () => { reloadOnControllerChange = true; worker.postMessage({ type: 'SKIP_WAITING' }); },
        },
      });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadOnControllerChange) location.reload();
    });
  });
}

// ---------------------------------------------------------------- start
cachePrune('photos', 7 * 24 * 3600 * 1000);
cachePrune('routes', 3600 * 1000);

async function start() {
  let demo = null;
  if (DEMO) {
    try {
      demo = await loadDemo();
    } catch (err) {
      console.warn('[demo]', err);
      toast({ title: 'Demo data missing', message: err.message, kind: 'error' });
    }
  }
  feed = createFeed({
    getSettings: eff,
    onData,
    onStatus: (status) => {
      ui.set({ status });
      renderStatus();
      if (status.state !== 'fresh') scheduleUI();
    },
    demo,
  });
  feed.start();
}
start();

renderUI();

// Small read-only debugging/test surface (no data leaves the page).
window.__fa = {
  get settings() { return settings; },
  get feed() { return feed; },
  traffic,
  limiter,
  ui,
  select,
  sheet,
  map: mapView.map,
  demo: DEMO,
};
