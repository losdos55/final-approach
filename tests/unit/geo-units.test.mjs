import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceNm, bearingDeg, angleDiff, norm360, destination, projectFlat, circle } from '../../js/util/geo.js';
import * as u from '../../js/util/units.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≉ ${b}`);

test('distance: one degree of latitude is 60 nm', () => {
  near(distanceNm(33, -111, 34, -111), 60.04, 0.1);
});

test('distance KIWA → KPHX ≈ 18 nm', () => {
  near(distanceNm(33.3078, -111.6556, 33.4353, -112.0059), 19.3, 0.5);
});

test('bearing cardinal directions', () => {
  near(bearingDeg(33, -111, 34, -111), 0, 0.01, 'north');
  near(bearingDeg(33, -111, 33, -110), 90, 0.5, 'east');
  near(bearingDeg(33, -111, 32, -111), 180, 0.01, 'south');
  near(bearingDeg(33, -111, 33, -112), 270, 0.5, 'west');
});

test('angleDiff wraps around north', () => {
  assert.equal(angleDiff(350, 10), 20);
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(0, 180), 180);
  assert.equal(angleDiff(-90, 270), 0);
  assert.equal(norm360(-30), 330);
  assert.equal(norm360(725), 5);
});

test('destination round-trips with distance and bearing', () => {
  const [lat, lon] = destination(33.3078, -111.6556, 135, 12);
  near(distanceNm(33.3078, -111.6556, lat, lon), 12, 0.01);
  near(bearingDeg(33.3078, -111.6556, lat, lon), 135, 0.1);
});

test('projectFlat agrees with destination for short hops', () => {
  const [a, b] = projectFlat(33.3, -111.6, 47, 2);
  const [c, d] = destination(33.3, -111.6, 47, 2);
  near(a, c, 1e-4); near(b, d, 1e-4);
});

test('circle is closed', () => {
  const ring = circle(33, -111, 5, 32);
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[32]);
});

test('unit conversion', () => {
  near(u.ftToM(1000), 304.8, 0.01);
  near(u.mToFt(304.8), 1000, 0.01);
  near(u.ktToKmh(100), 185.2, 0.001);
  near(u.nmToKm(10), 18.52, 0.001);
  near(u.kmToNm(18.52), 10, 0.001);
  near(u.fpmToMs(1000), 5.08, 0.001);
});

test('formatting', () => {
  assert.equal(u.formatAltitude(12345), '12,345 ft');
  assert.equal(u.formatAltitude(1000, 'metric'), '305 m');
  assert.equal(u.formatAltitude('ground'), 'GND');
  assert.equal(u.formatAltitude(null), '—');
  assert.equal(u.formatSpeed(250), '250 kt');
  assert.equal(u.formatSpeed(100, 'metric'), '185 km/h');
  assert.equal(u.formatDistance(4.26), '4.3 nm');
  assert.equal(u.formatDistance(15.4), '15 nm');
  assert.equal(u.formatDistance(10, 'metric'), '19 km');
  assert.equal(u.formatVRate(-800), '−800 fpm');
  assert.equal(u.formatVRate(1200), '+1,200 fpm');
  assert.equal(u.formatHeading(5), '005°');
  assert.equal(u.formatHeading(360), '000°');
  assert.equal(u.formatEta(4.2), '~4 min');
  assert.equal(u.formatEta(0.5), '<1 min');
  assert.equal(u.formatEta(65), '~1 h 5 min');
  assert.equal(u.formatEta(null), '');
});
