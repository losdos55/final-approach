export default {
  id: 'airplaneslive',
  name: 'airplanes.live',
  host: 'api.airplanes.live',
  home: 'https://airplanes.live',
  license: 'Free for non-commercial use, attribution required',
  url: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${Math.min(250, Math.ceil(nm))}`,
};
