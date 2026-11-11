// Bottom sheet with three detents (peek, half, full), drag with velocity
// snapping, and a left floating panel on wide screens (handled in CSS).

const DETENTS = ['peek', 'half', 'full'];

export function createSheet(el, { onChange } = {}) {
  const grab = el.querySelector('.sheet-grab');
  const desktop = matchMedia('(min-width: 900px)');
  let detent = el.dataset.detent || 'peek';

  const peekPx = () => parseFloat(getComputedStyle(el).getPropertyValue('--peek')) || 124;
  function offsets() {
    const H = el.offsetHeight;
    const vh = window.innerHeight;
    const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0;
    return {
      peek: Math.max(0, H - peekPx() - safeB),
      half: Math.max(0, H - vh * 0.52),
      full: 0,
    };
  }

  function apply(animate = true) {
    if (desktop.matches) {
      el.style.transform = '';
      return;
    }
    el.classList.toggle('dragging', !animate);
    el.style.transform = `translateY(${offsets()[detent]}px)`;
  }

  function set(next, { silent = false } = {}) {
    if (!DETENTS.includes(next)) return;
    const changed = next !== detent;
    detent = next;
    el.dataset.detent = next;
    apply(true);
    if (changed && !silent) onChange?.(next);
  }

  // Drag handling ---------------------------------------------------------
  let drag = null;
  const dragZones = [grab, el.querySelector('.tabs')].filter(Boolean);

  function onDown(e) {
    if (desktop.matches || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest('button, a, input') && !e.target.closest('.tab, #sheet-toggle')) return;
    const o = offsets();
    drag = { startY: e.clientY, base: o[detent], y: o[detent], moved: false, samples: [[e.timeStamp, e.clientY]], id: e.pointerId, target: e.currentTarget };
    // Capture right away so a fast drag that leaves the handle keeps tracking.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      el.classList.add('dragging');
    }
    const o = offsets();
    let y = drag.base + dy;
    if (y < 0) y = y / 3; // rubber band above full
    if (y > o.peek) y = o.peek + (y - o.peek) / 3;
    drag.y = y;
    el.style.transform = `translateY(${y}px)`;
    drag.samples.push([e.timeStamp, e.clientY]);
    if (drag.samples.length > 6) drag.samples.shift();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    el.classList.remove('dragging');
    if (!d.moved) return; // let click handlers run
    // Velocity from the last ~100 ms only, so a pause before release isn't a flick.
    const s = d.samples.filter(([t]) => e.timeStamp - t <= 100);
    if (!s.length) s.push([e.timeStamp, e.clientY]);
    const [t0, y0] = s[0];
    const [t1, y1] = s[s.length - 1];
    const v = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0; // px/ms, + = downward
    const o = offsets();
    const projected = d.y + v * 180;
    let next;
    if (Math.abs(v) > 0.6) {
      // A flick moves one detent in the flick direction from where we started.
      const i = DETENTS.indexOf(detent);
      next = DETENTS[Math.max(0, Math.min(2, i + (v < 0 ? 1 : -1)))];
    } else {
      next = nearest(projected, o);
    }
    if (next === detent) apply(true);
    else set(next);
    // Swallow the click that follows a drag.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
  }
  function nearest(y, o) {
    return DETENTS.reduce((best, k) => (Math.abs(o[k] - y) < Math.abs(o[best] - y) ? k : best), 'peek');
  }

  for (const z of dragZones) {
    z.addEventListener('pointerdown', onDown);
    z.addEventListener('pointermove', onMove);
    z.addEventListener('pointerup', onUp);
    z.addEventListener('pointercancel', onUp);
  }
  grab.addEventListener('click', (e) => {
    if (desktop.matches || e.target.closest('a, input')) return;
    set(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'half');
  });
  el.querySelector('#sheet-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    set(detent === 'full' ? 'peek' : DETENTS[DETENTS.indexOf(detent) + 1]);
  });

  window.addEventListener('resize', () => apply(false));
  desktop.addEventListener?.('change', () => apply(false));
  requestAnimationFrame(() => apply(false));

  return {
    get detent() { return detent; },
    set,
    /** Make sure at least `min` is visible. */
    ensure(min) {
      if (DETENTS.indexOf(detent) < DETENTS.indexOf(min)) set(min);
    },
  };
}
