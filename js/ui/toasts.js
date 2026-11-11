// On-screen toasts and the optional in-app chime.

import { esc } from '../util/dom.js';

let container;
let audioCtx = null;

export function initToasts(el) {
  container = el;
  // Audio can only start after a user gesture; unlock on the first one.
  const unlock = () => {
    try {
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* no audio */ }
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
}

/**
 * @param {{title?:string, message?:string, kind?:string, action?:{label:string,onClick:Function}, timeout?:number, id?:string}} o
 */
export function toast(o) {
  if (!container) return () => {};
  if (o.id) container.querySelector(`[data-id="${CSS.escape(o.id)}"]`)?.remove();
  const el = document.createElement('div');
  el.className = `toast ${o.kind ?? ''}`;
  if (o.id) el.dataset.id = o.id;
  el.setAttribute('role', o.kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `${o.kind === 'watch' ? '<span class="dot" aria-hidden="true"></span>' : ''}
    <div class="msg">${o.title ? `<b>${esc(o.title)}</b>` : ''}${o.message ? esc(o.message) : ''}</div>
    ${o.action ? `<button class="btn primary" type="button">${esc(o.action.label)}</button>` : ''}
    <button class="icon-btn small" type="button" aria-label="Dismiss"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button>`;
  const close = () => {
    if (!el.isConnected) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  if (o.action) el.querySelector('.btn').addEventListener('click', () => { o.action.onClick(); close(); });
  el.querySelector('.icon-btn').addEventListener('click', close);
  container.prepend(el);
  while (container.children.length > 3) container.lastElementChild.remove();
  if (o.timeout !== 0) setTimeout(close, o.timeout ?? 5000);
  return close;
}

/** Short, gentle two-note chime synthesised with WebAudio (no audio files). */
export function chime() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') return;
    const t0 = audioCtx.currentTime;
    [[880, 0], [1318.5, 0.14]].forEach(([freq, dt]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.5);
    });
  } catch { /* ignore */ }
}
