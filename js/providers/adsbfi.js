export default {
  id: 'adsbfi',
  name: 'adsb.fi',
  host: 'opendata.adsb.fi',
  home: 'https://adsb.fi',
  license: 'Free for non-commercial use, attribution and link required',
  url: (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${Math.min(250, Math.ceil(nm))}`,
};
