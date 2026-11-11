// Search box: matches callsign, registration, hex, type code or description.

import { debounce } from '../util/throttle.js';

export function matchesQuery(ac, q) {
  if (!q) return true;
  const Q = q.trim().toUpperCase();
  if (!Q) return true;
  return (
    ac.callsign.includes(Q) ||
    ac.reg.replace(/-/g, '').includes(Q.replace(/-/g, '')) ||
    ac.hex.toUpperCase().includes(Q) ||
    ac.type === Q ||
    ac.type.startsWith(Q) ||
    (ac.desc && ac.desc.toUpperCase().includes(Q)) ||
    (ac.operator && ac.operator.toUpperCase().includes(Q))
  );
}

export function initSearch({ input, clear, onChange }) {
  const emit = debounce(() => onChange(input.value), 120);
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    emit();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; clear.hidden = true; onChange(''); input.blur(); }
    if (e.key === 'Enter') input.blur();
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    onChange('');
    input.focus();
  });
}
