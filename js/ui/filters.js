// Quick filter chips, range/ceiling sliders and the map layers popover.

import { $, $$ } from '../util/dom.js';
import { radiusLabel, formatAltitude } from '../util/units.js';
import { matchesQuery } from './searchbar.js';

/** Does a track pass the current chip filter + search? */
export function passesFilter(t, { filter, hideGround, query }) {
  const ac = t.ac;
  if (hideGround && ac.onGround) return false;
  if (!matchesQuery(ac, query)) return false;
  switch (filter) {
    case 'military': return ac.military;
    case 'watchlist': return !!t.watch;
    case 'arrivals': return t.spot.status === 'inbound';
    case 'departures': return t.spot.status === 'outbound';
    case 'helicopters': return ac.cls === 'heli';
    default: return true;
  }
}

export function initFilters({ getSettings, update }) {
  const chips = $$('.chips .chip');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    if (chip.dataset.toggle) {
      update({ [chip.dataset.toggle]: !getSettings()[chip.dataset.toggle] });
    } else {
      const f = chip.dataset.filter;
      update({ filter: getSettings().filter === f && f !== 'all' ? 'all' : f });
    }
  }));

  // Popovers
  const pops = [
    [$('#btn-layers'), $('#layers-pop')],
    [$('#btn-filters'), $('#filters-pop')],
  ];
  const closeAll = (except) => pops.forEach(([b, p]) => {
    if (p === except) return;
    p.hidden = true;
    b.setAttribute('aria-expanded', 'false');
  });
  for (const [btn, pop] of pops) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      closeAll(pop);
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
  }
  document.addEventListener('click', () => closeAll());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  $$('#layers-pop [data-style]').forEach((b) => b.addEventListener('click', () => update({ mapStyle: b.dataset.style })));
  $$('#layers-pop [data-setting]').forEach((input) => input.addEventListener('change', () => update({ [input.dataset.setting]: input.checked })));

  const radius = $('#radius');
  const ceiling = $('#ceiling');
  radius.addEventListener('input', () => {
    $('#radius-out').textContent = radiusLabel(Number(radius.value), getSettings().units);
  });
  radius.addEventListener('change', () => update({ radiusNm: Number(radius.value) }));
  ceiling.addEventListener('input', () => {
    $('#ceiling-out').textContent = formatAltitude(Number(ceiling.value), getSettings().units);
  });
  ceiling.addEventListener('change', () => update({ ceilingAgl: Number(ceiling.value) }));

  return {
    /** Reflect settings in the controls. */
    sync(s) {
      chips.forEach((chip) => {
        const on = chip.dataset.toggle ? !!s[chip.dataset.toggle] : s.filter === chip.dataset.filter;
        chip.setAttribute('aria-pressed', String(on));
      });
      $$('#layers-pop [data-style]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === s.mapStyle)));
      $$('#layers-pop [data-setting]').forEach((i) => { i.checked = !!s[i.dataset.setting]; });
      radius.value = s.radiusNm;
      ceiling.value = s.ceilingAgl;
      $('#radius-out').textContent = radiusLabel(s.radiusNm, s.units);
      $('#ceiling-out').textContent = formatAltitude(s.ceilingAgl, s.units);
      $('#btn-filters').classList.toggle('active-filter', s.radiusNm !== 15 || s.ceilingAgl !== 8000);
    },
  };
}
