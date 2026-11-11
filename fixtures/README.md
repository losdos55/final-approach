# Fixtures

- `kiwa-live.json` — 36 real responses (5 s apart) recorded from
  `https://api.adsb.lol/v2/lat/33.3078/lon/-111.6556/dist/30` on 2026‑11‑11 with
  `scripts/capture-fixture.mjs`. Fields not used by the app were dropped.
- `kiwa-demo.json` — what `?demo=1` replays: the capture trimmed to 30 nm, plus
  three **synthetic** military aircraft (marked `"_synthetic": true`, hex codes
  starting with `~`, registrations `SYNTH-…`) because the capture had no military
  traffic near KIWA: a C‑17 on final for runway 30C, a KC‑46 departing 30L, and a
  UH‑60 crossing north of the field. Built by `scripts/build-demo-fixture.mjs`.

Data © adsb.lol contributors, licensed under the
[Open Database License (ODbL 1.0)](https://opendatacommons.org/licenses/odbl/).
