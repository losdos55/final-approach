// Unit conversion and formatting. Internal units are always ft / kt / nm / fpm.

export const FT_PER_M = 3.28084;
export const KMH_PER_KT = 1.852;
export const KM_PER_NM = 1.852;
export const MS_PER_FPM = 0.00508;

export const ftToM = (ft) => ft / FT_PER_M;
export const mToFt = (m) => m * FT_PER_M;
export const ktToKmh = (kt) => kt * KMH_PER_KT;
export const nmToKm = (nm) => nm * KM_PER_NM;
export const kmToNm = (km) => km / KM_PER_NM;
export const fpmToMs = (fpm) => fpm * MS_PER_FPM;

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function formatAltitude(ft, units = 'imperial') {
  if (ft === 'ground') return 'GND';
  if (!isNum(ft)) return '—';
  return units === 'metric' ? `${fmtInt.format(ftToM(ft))} m` : `${fmtInt.format(ft)} ft`;
}

export function formatSpeed(kt, units = 'imperial') {
  if (!isNum(kt)) return '—';
  return units === 'metric' ? `${fmtInt.format(ktToKmh(kt))} km/h` : `${fmtInt.format(kt)} kt`;
}

export function formatDistance(nm, units = 'imperial') {
  if (!isNum(nm)) return '—';
  const v = units === 'metric' ? nmToKm(nm) : nm;
  const unit = units === 'metric' ? 'km' : 'nm';
  return `${v < 10 ? fmt1.format(v) : fmtInt.format(v)} ${unit}`;
}

export function formatVRate(fpm, units = 'imperial') {
  if (!isNum(fpm)) return '—';
  const sign = fpm > 0 ? '+' : fpm < 0 ? '−' : '';
  if (units === 'metric') return `${sign}${fmt1.format(Math.abs(fpmToMs(fpm)))} m/s`;
  return `${sign}${fmtInt.format(Math.abs(fpm))} fpm`;
}

export function formatHeading(deg) {
  if (!isNum(deg)) return '—';
  return `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
}

/** "~4 min", "<1 min", "~1 h 5 min" */
export function formatEta(minutes) {
  if (!isNum(minutes)) return '';
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  return `~${h} h ${Math.round(minutes - h * 60)} min`;
}

/** Unit label helpers for sliders. */
export function radiusLabel(nm, units = 'imperial') {
  return units === 'metric' ? `${Math.round(nmToKm(nm))} km` : `${nm} nm`;
}
