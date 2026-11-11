// The spotting board: Arrivals, Departures, Nearby and Watchlist lists.
// Rows are keyed by hex and patched in place so thumbnails don't flicker.

import { esc } from '../util/dom.js';
import { silhouetteSVG } from '../map/icons.js';
import { formatAltitude, formatSpeed, formatDistance, formatEta, radiusLabel } from '../util/units.js';
import { STATUS_LABEL, sorters } from '../spotting.js';
import { routeLabel } from '../routes.js';

export const TABS = ['arrivals', 'departures', 'nearby', 'watchlist'];

/** Split filtered, in-radius tracks into the four lists. */
export function buildLists(items) {
  const arrivals = items.filter((t) => t.spot.status === 'inbound').sort((a, b) => sorters.arrivals(a.spot, b.spot));
  const departures = items
    .filter((t) => t.spot.status === 'outbound')
    .sort((a, b) => sorters.departures({ ...a.spot, departedAt: a.departedAt }, { ...b.spot, departedAt: b.departedAt }));
  const nearby = [...items].sort((a, b) => a.spot.distNm - b.spot.distNm);
  const watchlist = nearby.filter((t) => t.watch);
  return { arrivals, departures, nearby, watchlist };
}

export function isEmergency(ac) {
  return ['7500', '7600', '7700'].includes(ac.squawk) || !!ac.emergency;
}

function thumbHTML(t, photo) {
  if (photo && !photo.none) {
    return `<img src="${esc(photo.thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }
  return silhouetteSVG(t.ac.cls, { size: 30 });
}

function rowHTML(t, units) {
  const ac = t.ac;
  const s = t.spot;
  const title = ac.desc || ac.type || 'Unknown type';
  const ident = ac.callsign || ac.reg || ac.hex.toUpperCase();
  const second = [ac.callsign && ac.reg && ac.reg !== ac.callsign ? ac.reg : '', ac.operator].filter(Boolean).join(' · ');
  const alt = ac.onGround ? 'Ground' : formatAltitude(ac.alt, units);
  const route = routeLabel(t.route);
  const pillCls = s.status;
  const emg = isEmergency(ac);
  return `
    <span class="row-main">
      <span class="row-title"><span class="t">${esc(title)}</span>${ac.military ? '<span class="badge-mil">MIL</span>' : ''}${t.watch ? '<span class="badge-watch" title="Watchlist"><svg class="i" aria-hidden="true"><use href="#i-star"/></svg><span class="sr-only">Watchlist match</span></span>' : ''}</span>
      <span class="row-sub"><b>${esc(ident)}</b>${second ? ` · ${esc(second)}` : ''}</span>
      <span class="row-sub tnum">${esc(alt)} · ${esc(formatSpeed(ac.gs, units))} · ${esc(formatDistance(s.distNm, units))}${route ? ` · <span title="Plausible route">${esc(route)}</span>` : ''}</span>
    </span>
    <span class="row-side">
      ${emg ? `<span class="pill badge-emg">SQ ${esc(ac.squawk || 'EMG')}</span>` : `<span class="pill ${pillCls}">${STATUS_LABEL[s.status]}</span>`}
      ${s.eta != null ? `<span class="eta tnum">${esc(formatEta(s.eta))}</span>` : ''}
    </span>`;
}

export function createLists({ el, photos, onSelect }) {
  const rows = new Map(); // hex -> element
  let currentTab = 'arrivals';

  el.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (row) onSelect(row.dataset.hex, { fly: true });
    const act = e.target.closest('[data-action]');
    if (act) el.dispatchEvent(new CustomEvent('list-action', { bubbles: true, detail: act.dataset.action }));
  });

  function empty(tab, ctx) {
    const r = radiusLabel(ctx.radiusNm, ctx.units);
    const msgs = {
      arrivals: [`No arrivals within ${r} right now`, 'Descending aircraft heading for the field show up here with an ETA.'],
      departures: [`No departures within ${r} right now`, 'Climbing aircraft leaving the field show up here.'],
      nearby: [`No aircraft within ${r} right now`, ctx.filtered ? 'Try clearing the search or filters.' : 'Try a larger radius, or check back soon.'],
      watchlist: ['No watchlist matches nearby', 'Add types, registrations or callsigns in Settings → Watchlist.'],
    };
    const [big, small] = ctx.status === 'error' && !ctx.count
      ? ['Waiting for live data', ctx.statusMessage || 'The data provider is not responding.']
      : msgs[tab];
    const action = tab === 'watchlist' ? '<button class="btn" type="button" data-action="edit-watchlist">Edit watchlist</button>' : '';
    return `<div class="empty"><div class="big">${esc(big)}</div><div>${esc(small)}</div>${action}</div>`;
  }

  return {
    get tab() { return currentTab; },
    setTab(tab) { currentTab = tab; },
    render(list, ctx) {
      const { units, selectedHex } = ctx;
      if (!list.length) {
        rows.clear();
        el.innerHTML = empty(currentTab, ctx);
        return;
      }
      if (el.querySelector('.empty')) el.innerHTML = '';
      const keep = new Set();
      let prev = null;
      for (const t of list) {
        keep.add(t.hex);
        let row = rows.get(t.hex);
        if (!row) {
          row = document.createElement('button');
          row.type = 'button';
          row.className = 'row';
          row.dataset.hex = t.hex;
          row.innerHTML = '<span class="thumb"></span><span class="body" style="display:contents"></span>';
          rows.set(t.hex, row);
        }
        const photo = photos.peek(t.hex);
        const thumbKey = photo ? (photo.none ? `n:${t.ac.cls}` : photo.thumb) : `s:${t.ac.cls}`;
        const thumb = row.firstElementChild;
        if (thumb.dataset.key !== thumbKey) {
          thumb.dataset.key = thumbKey;
          thumb.innerHTML = thumbHTML(t, photo);
        }
        const html = rowHTML(t, units);
        const body = row.lastElementChild;
        if (body.dataset.key !== html) {
          body.dataset.key = html;
          body.innerHTML = html;
        }
        row.classList.toggle('selected', t.hex === selectedHex);
        row.setAttribute('aria-label', `${t.ac.desc || t.ac.type || 'Aircraft'} ${t.ac.callsign || t.ac.reg || ''}, ${STATUS_LABEL[t.spot.status]}`);
        const expected = prev ? prev.nextSibling : el.firstChild;
        if (expected !== row) el.insertBefore(row, expected);
        prev = row;
      }
      for (const [hex, row] of rows) {
        if (!keep.has(hex)) { row.remove(); rows.delete(hex); }
      }
    },
  };
}
