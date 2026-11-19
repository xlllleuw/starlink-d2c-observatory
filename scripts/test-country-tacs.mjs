import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const asset = name => new URL(`public/data/${name}`, root);
const data = JSON.parse(await readFile(asset('country-tacs.json'), 'utf8'));
const geometry = JSON.parse(await readFile(asset('country-boundaries.geojson'), 'utf8'));
const countries = JSON.parse(await readFile(asset('countries.json'), 'utf8'));
const tacSource = await readFile(new URL('public/js/tac.js', root), 'utf8');
const tac = await import(`data:text/javascript;base64,${Buffer.from(tacSource).toString('base64')}`);
const binary = await readFile(asset('tac/grid.bin'));
globalThis.fetch = async () => new Response(binary, { status: 200 });
await tac.loadTacModel('https://local.test/grid.bin');

const sets = Object.fromEntries(Object.entries(data.countries).map(([id, record]) => [id, new Set(record.ids)]));
const shapes = Object.fromEntries(geometry.features.map(feature => [feature.id, feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates]));
const bounds = ring => ring.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(p, a, b) {
  return Math.abs(orient(a, b, p)) < 1e-10 && p[0] >= Math.min(a[0], b[0]) - 1e-10 && p[0] <= Math.max(a[0], b[0]) + 1e-10 && p[1] >= Math.min(a[1], b[1]) - 1e-10 && p[1] <= Math.max(a[1], b[1]) + 1e-10;
}
function contains(ring, point) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (onSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function insidePolygon(polygon, point) {
  return contains(polygon[0], point) && !polygon.slice(1).some(hole => contains(hole, point));
}
function segmentsIntersect(a, b, c, d) {
  if (!overlaps(bounds([a, b]), bounds([c, d]))) return false;
  const ac = orient(a, b, c), ad = orient(a, b, d), ca = orient(c, d, a), cb = orient(c, d, b);
  if (ac * ad < 0 && ca * cb < 0) return true;
  return onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
function unwrap(ring) {
  const output = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const previous = output.at(-1)[0];
    const delta = ((ring[i][0] - previous + 180) % 360 + 360) % 360 - 180;
    output.push([previous + delta, ring[i][1]]);
  }
  return output;
}
function intersectsCountry(tacId, polygons) {
  const cell = unwrap(tac.tacBoundary(tacId));
  for (const shift of [-360, 0, 360]) {
    const ring = cell.map(([x, y]) => [x + shift, y]);
    const bbox = bounds(ring);
    for (const polygon of polygons) {
      if (!overlaps(bbox, bounds(polygon[0]))) continue;
      if (ring.some(p => insidePolygon(polygon, p)) || polygon[0].some(p => contains(ring, p))) return true;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        for (const boundary of polygon) {
          for (let j = 1; j < boundary.length; j++) if (segmentsIntersect(a, b, boundary[j - 1], boundary[j])) return true;
        }
      }
    }
  }
  return false;
}

assert.equal(data.schemaVersion, 1);
assert.equal(geometry.features.length, countries.length);
assert.deepEqual(Object.keys(data.countries).sort(), countries.map(c => c.id).sort());
let geometricChecks = 0, islandChecks = 0;
for (const country of countries) {
  const record = data.countries[country.id];
  assert.equal(record.count, record.ids.length);
  assert.equal(sets[country.id].size, record.count);
  assert.ok(record.count > 0, `${country.id} is empty`);
  assert.ok(record.ids.every((id, index) => Number.isInteger(id) && id >= 0 && id < 65536 && (!index || id > record.ids[index - 1])));
  assert.ok(record.bounds.longitudeSpan > 0 && record.bounds.longitudeSpan < 180);
  assert.equal(record.bounds.crossesAntimeridian, record.bounds.east < record.bounds.west);
  assert.ok(record.coveredBounds.north <= tac.TAC_MODEL.latitudeLimit + 0.00001);
  assert.ok(record.coveredBounds.south >= -tac.TAC_MODEL.latitudeLimit - 0.00001);
  // Independent polygon-edge intersection checks include cells whose centers
  // lie outside the country, making a center-only implementation fail.
  const samples = new Set([record.ids[0], record.ids[Math.floor(record.count / 2)], record.ids.at(-1), ...record.borderCellExamples]);
  for (const id of samples) {
    assert.ok(intersectsCountry(id, shapes[country.id]), `${country.id} TAC ${id} has no geometry intersection`);
    geometricChecks++;
  }
  for (const id of record.borderCellExamples) {
    const center = tac.tacCenter(id);
    assert.ok(!shapes[country.id].some(p => insidePolygon(p, [center.lon, center.lat])), `${country.id} TAC ${id} is not a border-only example`);
  }
  // The representative of every source island/component must map to a listed
  // TAC. This detects a missing island or truncation to a local view radius.
  assert.equal(record.validation.representativeSamples.length, record.coveredComponentCount);
  for (const sample of record.validation.representativeSamples) {
    const id = tac.nearestTac(sample.lat, sample.lon);
    assert.ok(sets[country.id].has(id), `${country.id} component at ${sample.lon},${sample.lat} was omitted`);
    islandChecks++;
  }
}

for (const code of ['USA', 'CAN', 'AUS']) assert.ok(sets[code].size > 1000, `${code} unexpectedly truncated`);
assert.ok(sets.KAZ.size > 450, 'Kazakhstan should exceed the former 450-cell cap');
assert.equal(data.countries.CAN.uncoveredPolar.hasUncoveredArea, true);
assert.equal(data.countries.CAN.uncoveredPolar.north, true);
assert.equal(data.countries.USA.uncoveredPolar.north, true);
assert.equal(data.countries.JPN.uncoveredPolar.hasUncoveredArea, false);
assert.equal(data.countries.USA.bounds.crossesAntimeridian, true);
assert.equal(data.countries.NZL.bounds.crossesAntimeridian, true);

const places = [
  ['USA', 38, -98, 'continental USA'],
  ['USA', 61.2181, -149.9003, 'Anchorage, Alaska'],
  ['USA', 21.3069, -157.8583, 'Honolulu, Hawaii'],
  ['USA', 51.88, -176.65, 'Adak, Aleutian Islands'],
  ['USA', 52.85, 173.2, 'Attu, west of the antimeridian'],
  ['JPN', 35.6762, 139.6503, 'Tokyo'],
  ['JPN', 43.0618, 141.3545, 'Hokkaido'],
  ['JPN', 26.2124, 127.6809, 'Okinawa'],
  ['JPN', 24.3448, 124.1572, 'Ishigaki'],
  ['ESP', 28.2916, -16.6291, 'Canary Islands'],
  ['ESP', 39.5696, 2.6502, 'Balearic Islands'],
  ['NZL', -43.95, -176.55, 'Chatham Islands'],
  ['SYC', -4.6191, 55.4513, 'Mahe, Seychelles'],
];
for (const [code, lat, lon, name] of places) {
  assert.ok(sets[code].has(tac.nearestTac(lat, lon)), `${name} missing from ${code}`);
}

console.log(`Country TAC tests passed: ${countries.length} countries, ${geometricChecks} polygon intersections, ${islandChecks} island/component samples, ${places.length} geographic fixtures; no 450-cell cap.`);
