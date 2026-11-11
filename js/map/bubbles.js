// Floating "photo bubbles" attached to aircraft icons. They are DOM elements
// positioned with map.project() every animation frame so they glide with the
// aircraft. At most MAX are visible: the selected aircraft plus the closest
// watchlist matches.

import { silhouetteSVG } from './icons.js';
import { esc } from '../util/dom.js';
import { formatAltitude } from '../util/units.js';

export const MAX_BUBBLES = 6;

export function createBubbles({ map, container, photos, onOpen, getUnits }) {
  const els = new Map(); // hex -> {el, key}

  function content(t, photo, selected) {
    const ac = t.ac;
    const title = ac.desc || ac.type || 'Unknown type';
    const line2 = [ac.callsign || ac.reg, ac.onGround ? 'GND' : formatAltitude(ac.alt, getUnits())].filter(Boolean).join(' · ');
    let media;
    if (photo === undefined) media = '<div class="bubble-photo shimmer" aria-hidden="true"></div>';
    else if (photo?.none) media = `<div class="bubble-photo placeholder">${silhouetteSVG(ac.cls, { size: 34 })}</div>`;
    else media = `<img class="bubble-photo" src="${esc(photo.thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    const credit = photo && !photo.none
      ? `<a class="bubble-credit" href="${esc(photo.link)}" target="_blank" rel="noopener">Photo: ${esc(photo.photographer)} / planespotters.net</a>`
      : '';
    return `
      <div class="bubble-main" role="button" tabindex="0" aria-label="Open details for ${esc(ac.callsign || ac.reg || ac.hex)}">
        ${media}
        <span class="bubble-text">
          <span class="bubble-title">${esc(title)}</span>
          <span class="bubble-sub tnum">${esc(line2)}</span>
          ${credit}
        </span>
      </div>`;
  }

  function ensure(t, selected) {
    let rec = els.get(t.hex);
    if (!rec) {
      const el = document.createElement('div');
      el.className = 'bubble';
      el.dataset.hex = t.hex;
      el.addEventListener('click', (e) => {
        if (e.target.closest('a')) return; // photo credit link
        onOpen?.(t.hex);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(t.hex); }
      });
      container.appendChild(el);
      requestAnimationFrame(() => el.classList.add('in'));
      rec = { el, key: '' };
      els.set(t.hex, rec);
      photos.get(t.ac, selected ? 0 : 1).then(() => { rec.key = ''; });
    }
    rec.el.classList.toggle('selected', selected);
    rec.el.classList.toggle('watch', !!t.watch);
    const photo = photos.peek(t.hex);
    const key = [selected, photo ? (photo.none ? 'none' : photo.thumb) : 'loading', t.ac.callsign, t.ac.desc, Math.round((t.ac.alt ?? -1) / 100), getUnits()].join('|');
    if (key !== rec.key) {
      rec.key = key;
      rec.el.innerHTML = content(t, photo, selected);
    }
    return rec;
  }

  /** Decide which aircraft get bubbles. Called on data updates. */
  function choose(tracks, { selectedHex, watchBubbles }) {
    const chosen = [];
    const sel = selectedHex && tracks.get(selectedHex);
    if (sel) chosen.push(sel);
    if (watchBubbles) {
      const watch = [...tracks.values()]
        .filter((t) => t.watch && t.inRadius && t.hex !== selectedHex)
        .sort((a, b) => a.spot.distNm - b.spot.distNm)
        .slice(0, MAX_BUBBLES - chosen.length);
      chosen.push(...watch);
    }
    return chosen;
  }

  let current = [];

  return {
    update(tracks, opts) {
      current = choose(tracks, opts);
      const keep = new Set(current.map((t) => t.hex));
      for (const [hex, rec] of els) {
        if (!keep.has(hex)) {
          rec.el.classList.remove('in');
          const el = rec.el;
          setTimeout(() => el.remove(), 200);
          els.delete(hex);
        }
      }
      for (const t of current) ensure(t, t.hex === opts.selectedHex);
    },
    /** Per-frame positioning. */
    position() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      for (const t of current) {
        const rec = els.get(t.hex);
        if (!rec || !t.render) continue;
        const p = map.project([t.render.lon, t.render.lat]);
        const visible = p.x > -80 && p.y > -80 && p.x < w + 80 && p.y < h + 80;
        rec.el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
        rec.el.style.visibility = visible ? 'visible' : 'hidden';
      }
    },
    refresh() { for (const rec of els.values()) rec.key = ''; },
    get count() { return els.size; },
  };
}
