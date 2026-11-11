export default {
  id: 'adsblol',
  name: 'adsb.lol',
  host: 'api.adsb.lol',
  home: 'https://adsb.lol',
  license: 'ODbL 1.0',
  url: (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${Math.min(250, Math.ceil(nm))}`,
};
