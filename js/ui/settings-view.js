// Settings screen. Everything is stored on this device only.

import { esc } from '../util/dom.js';
import { loadAirports, searchAirports, toSettingsAirport } from '../airports.js';
import { PRESETS, addPreset } from '../watchlist.js';
import { exportSettings, importSettings, defaults } from '../settings.js';
import { radiusLabel, formatAltitude } from '../util/units.js';
import { PROVIDERS, fetchJSON, viaProxy } from '../providers/index.js';
import { limiter } from '../util/throttle.js';
import { toast } from './toasts.js';
import { debounce } from '../util/throttle.js';

const VERSION = '1.0.0';

const seg = (key, value, options) => `
  <div class="segmented" role="radiogroup" aria-label="${esc(key)}">
    ${options.map(([v, label]) => `<button type="button" role="radio" data-seg="${key}" data-value="${v}" aria-checked="${v === value}">${label}</button>`).join('')}
  </div>`;
const sw = (key, label, on, sub = '') => `
  <label class="field"><span>${label}${sub ? `<span class="sub">${sub}</span>` : ''}</span><input type="checkbox" class="switch" data-set="${key}" ${on ? 'checked' : ''}></label>`;
const select = (key, label, value, options) => `
  <label class="field"><span>${label}</span><select data-set="${key}" data-num="${typeof value === 'number'}">
    ${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`).join('')}
  </select></label>`;

function tags(kind, list, placeholder) {
  return `
    <div class="tags" aria-label="${kind}">
      ${list.length ? list.map((t) => `<span class="tag">${esc(t)}<button type="button" data-wl-remove="${kind}" data-value="${esc(t)}" aria-label="Remove ${esc(t)}"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button></span>`).join('') : '<span class="hint">None yet</span>'}
    </div>
    <form class="tag-add" data-wl-add="${kind}">
      <input class="text-input" name="v" placeholder="${placeholder}" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="${placeholder}">
      <button class="btn" type="submit" aria-label="Add"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>
    </form>`;
}

export function createSettingsView({ el, getSettings, update, onClose, isDemo }) {
  let airports = null;
  let query = '';

  function airportResults() {
    if (!airports) return '<p class="hint">Loading airports…</p>';
    const list = searchAirports(airports, query, 25);
    if (!list.length) return '<p class="hint">No matching airports. You can also enter a custom location below.</p>';
    return list.map((a) => `
      <button type="button" class="airport-item" data-airport="${esc(a.ident)}">
        <span class="code">${esc(a.icao || a.ident)}</span>
        <span><span class="name">${esc(a.name)}</span><br><span class="city">${esc([a.iata, a.municipality, a.country].filter(Boolean).join(' · '))}</span></span>
      </button>`).join('');
  }

  function render() {
    const s = getSettings();
    const a = s.airport;
    const presetState = (p) => p.types.every((t) => s.watchlist.types.includes(t));
    el.innerHTML = `
      <div class="settings-head">
        <span style="width:44px"></span>
        <h2 id="settings-title">Settings</h2>
        <button class="icon-btn" type="button" data-close aria-label="Close settings"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button>
      </div>
      <div class="settings-body">
        <section>
          <h3 class="group-title">Airport</h3>
          <div class="group">
            <div class="field"><span><b>${esc(a.icao || a.ident)}</b> · ${esc(a.name)}<span class="sub">${a.lat.toFixed(4)}, ${a.lon.toFixed(4)} · elev ${esc(formatAltitude(a.elevation, s.units))}${isDemo ? ' · demo mode uses KIWA' : ''}</span></span></div>
            <div class="field stack">
              <input id="airport-q" class="text-input" type="search" placeholder="Search ICAO, IATA, name or city" value="${esc(query)}" aria-label="Search airports" autocomplete="off">
              <div class="airport-list" id="airport-results">${airportResults()}</div>
            </div>
            <details class="field stack">
              <summary style="min-height:44px;display:flex;align-items:center;cursor:pointer">Custom location</summary>
              <form data-custom class="custom-grid">
                <label>Latitude<input class="text-input" name="lat" inputmode="decimal" value="${a.custom ? a.lat : ''}" required></label>
                <label>Longitude<input class="text-input" name="lon" inputmode="decimal" value="${a.custom ? a.lon : ''}" required></label>
                <label>Elevation ft<input class="text-input" name="elev" inputmode="numeric" value="${a.custom ? a.elevation : ''}"></label>
                <label style="grid-column:1/-1">Name<input class="text-input" name="name" value="${a.custom ? esc(a.name) : ''}" placeholder="My spotting spot"></label>
                <button class="btn primary" type="submit" style="grid-column:1/-1">Use custom location</button>
              </form>
            </details>
          </div>
        </section>

        <section>
          <h3 class="group-title">Spotting</h3>
          <div class="group">
            <label class="slider-row field"><span class="slider-label">Radius <output class="tnum" data-out="radiusNm">${radiusLabel(s.radiusNm, s.units)}</output></span>
              <input type="range" min="5" max="50" step="1" value="${s.radiusNm}" data-set="radiusNm" data-num="true" aria-label="Radius"></label>
            <label class="slider-row field"><span class="slider-label">Altitude ceiling (AGL) <output class="tnum" data-out="ceilingAgl">${formatAltitude(s.ceilingAgl, s.units)}</output></span>
              <input type="range" min="1000" max="20000" step="500" value="${s.ceilingAgl}" data-set="ceilingAgl" data-num="true" aria-label="Altitude ceiling"></label>
            <div class="field"><span>Units</span>${seg('units', s.units, [['imperial', 'ft · kt · nm'], ['metric', 'm · km/h · km']])}</div>
          </div>
        </section>

        <section>
          <h3 class="group-title">Live data</h3>
          <div class="group">
            ${select('provider', 'Data provider', s.provider, [['auto', 'Auto (fallback)'], ['airplaneslive', 'airplanes.live'], ['adsblol', 'adsb.lol'], ['adsbfi', 'adsb.fi']])}
            ${select('pollSec', 'Update every', s.pollSec, [[2, '2 seconds'], [3, '3 seconds'], [5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds']])}
            <div class="field stack">
              <span>Proxy URL <span class="sub">The ADS-B providers don't allow direct browser requests (no CORS). Deploy the free Cloudflare Worker from <code>proxy/</code> and paste its URL here. Stored only on this device.</span></span>
              <input class="text-input" type="url" data-set="proxyUrl" value="${esc(s.proxyUrl)}" placeholder="https://your-proxy.workers.dev" inputmode="url" autocomplete="off" spellcheck="false" aria-label="Proxy URL">
              <div class="btn-row"><button class="btn" type="button" data-test-proxy>Test connection</button>${isDemo ? '<a class="btn" href="./">Exit demo</a>' : '<a class="btn" href="./?demo=1">Try demo mode</a>'}</div>
            </div>
            ${sw('routes', 'Plausible routes', s.routes, 'Likely origin/destination by callsign from adsb.lol (needs the proxy)')}
          </div>
        </section>

        <section>
          <h3 class="group-title">Map</h3>
          <div class="group">
            <div class="field"><span>Style</span>${seg('mapStyle', s.mapStyle, [['dark', 'Dark'], ['light', 'Light'], ['satellite', 'Satellite']])}</div>
            ${sw('labels', 'Labels', s.labels, 'Callsign and type at closer zoom')}
            ${sw('trailsAll', 'Trails for all aircraft', s.trailsAll)}
            ${select('trailMinutes', 'Trail length', s.trailMinutes, [[2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [20, '20 minutes'], [30, '30 minutes'], [60, '60 minutes']])}
            ${sw('photoBubbles', 'Photo bubbles for watchlist', s.photoBubbles, 'Up to 6, closest first')}
          </div>
        </section>

        <section>
          <h3 class="group-title">Watchlist</h3>
          <div class="group">
            ${sw('wl.allMilitary', 'Treat all military as matches', s.watchlist.allMilitary)}
            <div class="presets">
              ${PRESETS.map((p) => `<button type="button" class="btn ${presetState(p) ? 'added' : ''}" data-preset="${p.id}">${esc(p.name)}<small>${presetState(p) ? 'Added ✓' : esc(p.types.join(' '))}</small></button>`).join('')}
            </div>
            <div class="field stack"><span>Aircraft types <span class="sub">ICAO designators, e.g. C17, K35R, F35</span></span>${tags('types', s.watchlist.types, 'Add type code')}</div>
            <div class="field stack"><span>Registrations</span>${tags('regs', s.watchlist.regs, 'Add registration')}</div>
            <div class="field stack"><span>Callsign prefixes <span class="sub">e.g. RCH, CNV, PAT</span></span>${tags('callsigns', s.watchlist.callsigns, 'Add callsign prefix')}</div>
          </div>
        </section>

        <section>
          <h3 class="group-title">Alerts &amp; device</h3>
          <div class="group">
            ${sw('chime', 'Chime for new watchlist match', s.chime, 'Plays only while the app is open')}
            ${sw('muted', 'Mute all sounds', s.muted)}
            ${sw('wakeLock', 'Keep screen awake', s.wakeLock, 'Uses the Screen Wake Lock API where supported')}
            <div class="field"><span>Theme</span>${seg('theme', s.theme, [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']])}</div>
          </div>
        </section>

        <section>
          <h3 class="group-title">API keys</h3>
          <div class="group">
            <p class="hint" style="padding:10px 0">For future providers. Keys are saved only on this device and are never sent anywhere except to the provider they belong to.</p>
            ${Object.entries(s.apiKeys).map(([k]) => `<div class="field"><span>${esc(k)}<span class="sub">••••••••</span></span><button class="btn danger" type="button" data-key-remove="${esc(k)}">Remove</button></div>`).join('')}
            <form class="custom-grid" data-key-add style="grid-template-columns:1fr 1fr auto;align-items:end">
              <label>Name<input class="text-input" name="k" autocomplete="off" required></label>
              <label>Key<input class="text-input" name="v" type="password" autocomplete="off" required></label>
              <button class="btn" type="submit" aria-label="Save key"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>
            </form>
          </div>
        </section>

        <section>
          <h3 class="group-title">Backup</h3>
          <div class="group">
            <div class="btn-row">
              <button class="btn" type="button" data-export>Export settings</button>
              <label class="btn" style="cursor:pointer">Import…<input type="file" accept="application/json,.json" data-import hidden></label>
              <button class="btn danger" type="button" data-reset>Reset to defaults</button>
            </div>
          </div>
        </section>

        <section>
          <h3 class="group-title">About</h3>
          <div class="group about">
            <p><b>Final Approach</b> ${VERSION} — a plane spotting web app. No accounts, no analytics, no tracking. Settings live only on this device.</p>
            <p>Data &amp; credits (non-commercial use):</p>
            <ul>
              <li>Aircraft positions: <a href="https://airplanes.live" target="_blank" rel="noopener">airplanes.live</a>, <a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (data under <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener">ODbL 1.0</a>), <a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a></li>
              <li>Plausible routes: adsb.lol routeset</li>
              <li>Photos: <a href="https://www.planespotters.net" target="_blank" rel="noopener">planespotters.net</a> — © each photographer, credited on every photo</li>
              <li>Airports &amp; runways: <a href="https://ourairports.com/data/" target="_blank" rel="noopener">OurAirports</a> (public domain)</li>
              <li>Maps: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>; imagery © Esri, Maxar, Earthstar Geographics</li>
              <li>Rendering: <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre GL JS</a> (BSD-3-Clause)</li>
            </ul>
            <p>Positions can be delayed, incomplete or wrong. Not for navigation or safety-critical use.</p>
          </div>
        </section>
      </div>`;
  }

  function refreshResults() {
    const box = el.querySelector('#airport-results');
    if (box) box.innerHTML = airportResults();
  }

  const onQuery = debounce(refreshResults, 120);

  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'airport-q') { query = t.value; onQuery(); return; }
    if (t.type === 'range') {
      const out = el.querySelector(`[data-out="${t.dataset.set}"]`);
      const s = getSettings();
      if (out) out.textContent = t.dataset.set === 'radiusNm' ? radiusLabel(Number(t.value), s.units) : formatAltitude(Number(t.value), s.units);
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target;
    const key = t.dataset.set;
    if (t.matches('[data-import]')) return importFile(t);
    if (!key) return;
    let value = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.num === 'true') value = Number(value);
    if (key.startsWith('wl.')) {
      const s = getSettings();
      update({ watchlist: { ...s.watchlist, [key.slice(3)]: value } });
    } else {
      update({ [key]: value });
      if (key === 'proxyUrl' && value && getSettings().proxyUrl !== value.trim()) {
        toast({ title: 'Proxy URL not saved', message: 'Use an https:// URL.', kind: 'error' });
      }
    }
  });

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const s = getSettings();
    if (f.dataset.wlAdd) {
      const kind = f.dataset.wlAdd;
      const v = f.v.value.trim().toUpperCase();
      if (!v) return;
      update({ watchlist: { ...s.watchlist, [kind]: [...new Set([...s.watchlist[kind], ...v.split(/[\s,]+/).filter(Boolean)])] } });
      render();
      el.querySelector(`[data-wl-add="${kind}"] input`)?.focus();
    } else if (f.dataset.custom !== undefined) {
      const lat = Number(f.lat.value);
      const lon = Number(f.lon.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        toast({ title: 'Check the coordinates', message: 'Latitude −90…90, longitude −180…180.', kind: 'error' });
        return;
      }
      update({ airport: { ident: 'CUSTOM', icao: '', iata: '', name: f.name.value.trim() || 'Custom location', municipality: '', lat, lon, elevation: Number(f.elev.value) || 0, custom: true } });
      render();
    } else if (f.dataset.keyAdd !== undefined) {
      const k = f.k.value.trim();
      if (!k) return;
      update({ apiKeys: { ...s.apiKeys, [k]: f.v.value } });
      render();
    }
  });

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-close]');
    if (!t) return;
    const s = getSettings();
    if (t.hasAttribute('data-close')) return onClose();
    if (t.dataset.seg) { update({ [t.dataset.seg]: t.dataset.value }); render(); return; }
    if (t.dataset.preset) {
      update({ watchlist: addPreset(s.watchlist, t.dataset.preset) });
      toast({ title: 'Watchlist updated', message: `${PRESETS.find((p) => p.id === t.dataset.preset).name} added`, timeout: 2500 });
      render();
      return;
    }
    if (t.dataset.wlRemove) {
      const kind = t.dataset.wlRemove;
      update({ watchlist: { ...s.watchlist, [kind]: s.watchlist[kind].filter((x) => x !== t.dataset.value) } });
      render();
      return;
    }
    if (t.dataset.airport) {
      const a = airports.find((x) => x.ident === t.dataset.airport);
      if (a) {
        update({ airport: toSettingsAirport(a) });
        query = '';
        onClose();
      }
      return;
    }
    if (t.dataset.keyRemove) {
      const keys = { ...s.apiKeys };
      delete keys[t.dataset.keyRemove];
      update({ apiKeys: keys });
      render();
      return;
    }
    if (t.hasAttribute('data-export')) return exportFile();
    if (t.hasAttribute('data-reset')) {
      if (confirm('Reset all settings and the watchlist to defaults?')) {
        update(defaults(), { replace: true });
        render();
        toast({ title: 'Settings reset', timeout: 2500 });
      }
      return;
    }
    if (t.hasAttribute('data-test-proxy')) return testProxy(t);
  });

  async function testProxy(btn) {
    const s = getSettings();
    btn.disabled = true;
    btn.textContent = 'Testing…';
    const p = PROVIDERS.adsblol;
    try {
      const json = await limiter.run(p.host, () => fetchJSON(viaProxy(p.url(s.airport.lat, s.airport.lon, 5), s.proxyUrl)));
      const n = (json?.ac ?? json?.aircraft ?? []).length;
      toast({ title: 'Connection OK', message: `${s.proxyUrl ? 'Proxy' : 'Direct'} → adsb.lol answered (${n} aircraft within 5 nm).`, timeout: 4000 });
    } catch (err) {
      toast({
        title: 'Connection failed',
        message: err.kind === 'network' ? (s.proxyUrl ? 'Proxy unreachable or blocked.' : 'Blocked by the browser (CORS). A proxy is needed.') : err.message,
        kind: 'error',
      });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test connection';
    }
  }

  function exportFile() {
    const blob = new Blob([exportSettings(getSettings())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `final-approach-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const s = importSettings(await file.text());
      update(s, { replace: true });
      render();
      toast({ title: 'Settings imported', timeout: 2500 });
    } catch {
      toast({ title: 'Import failed', message: 'That file is not a Final Approach settings export.', kind: 'error' });
    }
    input.value = '';
  }

  return {
    open() {
      el.hidden = false;
      render();
      el.querySelector('[data-close]')?.focus();
      if (!airports) {
        loadAirports().then((list) => { airports = list; refreshResults(); })
          .catch(() => { const b = el.querySelector('#airport-results'); if (b) b.innerHTML = '<p class="hint">Could not load the airport list.</p>'; });
      }
    },
    openAirportPicker() {
      this.open();
      const q = el.querySelector('#airport-q');
      q?.focus();
    },
    close() { el.hidden = true; },
    get isOpen() { return !el.hidden; },
    render,
  };
}
