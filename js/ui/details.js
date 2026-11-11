// Aircraft details view inside the sheet / side panel.

import { esc, tweenText, sparkline } from '../util/dom.js';
import { silhouetteSVG } from '../map/icons.js';
import {
  formatAltitude, formatSpeed, formatDistance, formatVRate, formatHeading, formatEta,
} from '../util/units.js';
import { STATUS_LABEL } from '../spotting.js';
import { routeLabel } from '../routes.js';
import { distanceNm, bearingDeg } from '../util/geo.js';
import { altitudeProfile } from '../map/trails.js';
import { isEmergency } from './lists.js';
import { creditHTML } from '../photos.js';

const EMERGENCY_TEXT = {
  7500: 'Squawk 7500 — unlawful interference',
  7600: 'Squawk 7600 — radio failure',
  7700: 'Squawk 7700 — general emergency',
};

const TILES = [
  ['alt', 'Altitude'],
  ['gs', 'Ground speed'],
  ['vr', 'Vertical rate'],
  ['hdg', 'Heading'],
  ['dist', 'From airport'],
  ['user', 'From you'],
  ['sq', 'Squawk'],
  ['eta', 'ETA'],
];

export function createDetails({ el, photos, actions }) {
  let hex = null;

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) actions[btn.dataset.act]?.(hex, btn);
  });

  function shell(t) {
    const ac = t.ac;
    return `
      <div class="detail-top">
        <button class="icon-btn" type="button" data-act="back" aria-label="Back to list"><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>
        <span class="spacer"></span>
        <span class="pill ${t.spot.status}" data-f="status"></span>
        <button class="icon-btn" type="button" data-act="close" aria-label="Close details"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button>
      </div>
      <div class="emergency" data-f="emg" hidden><svg class="i" aria-hidden="true"><use href="#i-alert"/></svg><span></span></div>
      <div class="hero" data-f="hero"><div class="shimmer" style="position:absolute;inset:0"></div></div>
      <p class="credit" data-f="credit"></p>
      <h2 class="d-title" data-f="title">${esc(ac.desc || ac.type || 'Unknown type')}</h2>
      <p class="d-sub" data-f="sub"></p>
      <p class="d-route" data-f="route" hidden></p>
      <div class="tiles">
        ${TILES.map(([k, label]) => `<div class="tile" data-tile="${k}"><div class="k">${label}</div><div class="v tnum"><span data-v="${k}">—</span></div></div>`).join('')}
      </div>
      <div class="spark" data-f="spark">
        <div class="k"><span>Altitude profile</span><span data-f="spark-range" class="tnum"></span></div>
        <svg viewBox="0 0 280 56" preserveAspectRatio="none" aria-hidden="true"><path class="area"/><path class="line"/></svg>
      </div>
      <div class="actions">
        <button class="btn" type="button" data-act="follow" aria-pressed="false"><svg class="i" aria-hidden="true"><use href="#i-follow"/></svg>Follow</button>
        <button class="btn" type="button" data-act="watchType"><svg class="i" aria-hidden="true"><use href="#i-star"/></svg><span>Watch type</span></button>
        <button class="btn" type="button" data-act="copyReg"><svg class="i" aria-hidden="true"><use href="#i-copy"/></svg>Copy reg</button>
        <a class="btn" data-f="globe" target="_blank" rel="noopener"><svg class="i" aria-hidden="true"><use href="#i-globe"/></svg>Globe</a>
        <a class="btn" data-f="pslink" target="_blank" rel="noopener" hidden><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>Photo page</a>
      </div>
      <p class="meta" data-f="meta"></p>`;
  }

  const q = (f) => el.querySelector(`[data-f="${f}"]`);
  const v = (k) => el.querySelector(`[data-v="${k}"]`);

  function renderPhoto(t, photo) {
    const hero = q('hero');
    if (!hero) return;
    const key = photo === undefined ? 'loading' : photo.none ? 'none' : photo.large;
    if (hero.dataset.key === key) return;
    hero.dataset.key = key;
    if (photo === undefined) {
      hero.innerHTML = '<div class="shimmer" style="position:absolute;inset:0"></div>';
      q('credit').innerHTML = '';
    } else if (photo.none) {
      const why = photo.failed ? 'Photo service unavailable right now' : 'No photo on planespotters.net yet';
      hero.innerHTML = `${silhouetteSVG(t.ac.cls, { size: 96 })}<span class="no-photo">${why}</span>`;
      q('credit').innerHTML = '';
      q('pslink').hidden = true;
    } else {
      hero.innerHTML = `<img src="${esc(photo.large)}" alt="Photo of ${esc(t.ac.reg || t.ac.desc || 'aircraft')}" referrerpolicy="no-referrer">`;
      q('credit').innerHTML = creditHTML(photo, esc);
      const link = q('pslink');
      link.href = photo.link;
      link.hidden = false;
    }
  }

  function update(t, ctx) {
    if (!t || t.hex !== hex) return;
    const ac = t.ac;
    const { units, user, airport, watchlist, following, lost } = ctx;
    const status = q('status');
    status.className = `pill ${t.spot.status}`;
    status.textContent = lost ? 'SIGNAL LOST' : STATUS_LABEL[t.spot.status];

    const emg = q('emg');
    const isEmg = isEmergency(ac);
    emg.hidden = !isEmg;
    if (isEmg) emg.querySelector('span').textContent = EMERGENCY_TEXT[ac.squawk] || `Emergency: ${ac.emergency}`;

    q('title').textContent = ac.desc || ac.type || 'Unknown type';
    const parts = [
      ac.callsign && `<b>${esc(ac.callsign)}</b>`,
      ac.reg && ac.reg !== ac.callsign && `<span>${esc(ac.reg)}</span>`,
      ac.operator && `<span>${esc(ac.operator)}</span>`,
      ac.year && `<span>Built ${esc(ac.year)}</span>`,
      ac.military && '<span class="badge-mil">MILITARY</span>',
    ].filter(Boolean);
    const sub = parts.join('');
    if (q('sub').dataset.key !== sub) { q('sub').dataset.key = sub; q('sub').innerHTML = sub; }

    const r = routeLabel(t.route);
    q('route').hidden = !r;
    if (r) q('route').innerHTML = `<b>${esc(r)}</b> · plausible route (adsb.lol)`;

    // Live tiles
    const arrow = ac.vRate >= 250 ? '<svg class="i up" aria-label="climbing"><use href="#i-up"/></svg>'
      : ac.vRate <= -250 ? '<svg class="i down" aria-label="descending"><use href="#i-down"/></svg>' : '';
    const altTile = el.querySelector('[data-tile="alt"] .v');
    const altEl = v('alt');
    if (ac.onGround) altEl.textContent = 'Ground';
    else tweenText(altEl, ac.alt, (x) => formatAltitude(x == null ? x : Math.round(x / 25) * 25, units));
    altTile.querySelector('svg')?.remove();
    if (arrow) altTile.insertAdjacentHTML('beforeend', arrow);
    tweenText(v('gs'), ac.gs, (x) => formatSpeed(x, units));
    tweenText(v('vr'), ac.vRate, (x) => formatVRate(x == null ? x : Math.round(x / 32) * 32, units));
    v('hdg').textContent = formatHeading(ac.heading);
    tweenText(v('dist'), t.spot.distNm, (x) => `${formatDistance(x, units)} ${formatHeading(t.spot.bearingFromField)}`);
    const userTile = el.querySelector('[data-tile="user"]');
    if (user) {
      userTile.hidden = false;
      const d = distanceNm(user.lat, user.lon, t.render?.lat ?? ac.lat, t.render?.lon ?? ac.lon);
      const b = bearingDeg(user.lat, user.lon, t.render?.lat ?? ac.lat, t.render?.lon ?? ac.lon);
      v('user').textContent = `${formatDistance(d, units)} ${formatHeading(b)}`;
    } else userTile.hidden = true;
    v('sq').textContent = ac.squawk || '—';
    el.querySelector('[data-tile="sq"]').classList.toggle('emg', isEmg);
    const etaTile = el.querySelector('[data-tile="eta"]');
    etaTile.querySelector('.k').textContent = t.spot.eta != null ? 'ETA to field' : 'AGL';
    v('eta').textContent = t.spot.eta != null ? formatEta(t.spot.eta)
      : t.spot.agl != null ? formatAltitude(Math.round(t.spot.agl / 25) * 25, units) : '—';

    // Sparkline
    const sp = sparkline(altitudeProfile(t));
    const svg = q('spark').querySelector('svg');
    svg.querySelector('.line').setAttribute('d', sp ? sp.line : '');
    svg.querySelector('.area').setAttribute('d', sp ? sp.area : '');
    q('spark-range').textContent = sp ? `${formatAltitude(sp.min, units)} – ${formatAltitude(sp.max, units)}` : 'collecting…';

    // Actions state
    const follow = el.querySelector('[data-act="follow"]');
    follow.setAttribute('aria-pressed', String(!!following));
    const watchBtn = el.querySelector('[data-act="watchType"]');
    const watched = ac.type && watchlist.types.includes(ac.type);
    watchBtn.setAttribute('aria-pressed', String(!!watched));
    watchBtn.disabled = !ac.type;
    watchBtn.querySelector('span').textContent = watched ? `${ac.type} on watchlist` : `Watch ${ac.type || 'type'}`;
    el.querySelector('[data-act="copyReg"]').disabled = !ac.reg;
    q('globe').href = `https://globe.airplanes.live/?icao=${encodeURIComponent(ac.hex.replace(/^~/, ''))}`;

    renderPhoto(t, photos.peek(t.hex));
    q('meta').textContent = `ICAO ${ac.hex.toUpperCase()} · ${ac.type || 'type ?'} · ${ac.category || 'cat ?'} · ${airport.icao || airport.ident} field elev ${formatAltitude(airport.elevation, units)} · source ${ac.source}`;
  }

  return {
    get hex() { return hex; },
    open(t, ctx) {
      hex = t.hex;
      el.innerHTML = shell(t);
      el.scrollTop = 0;
      photos.get(t.ac, 0).then(() => { if (hex === t.hex) renderPhoto(t, photos.peek(t.hex)); });
      update(t, ctx);
    },
    update,
    close() { hex = null; el.innerHTML = ''; },
  };
}
