import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/js/tac.js', root), 'utf8');
const tac = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const binary = await readFile(new URL('public/data/tac/grid.bin', root));
globalThis.fetch = async () => new Response(binary, { status: 200 });
await tac.loadTacModel('https://local.test/grid.bin');

// Center-to-cell roundtrip across the full latitude range and near the seam.
for (const id of [0, 1, 144, 1024, 16900, 32768, 55414, 55647, 59595, 65499, 65534, 65535]) {
  const { lat, lon } = tac.tacCenter(id);
  assert.equal(tac.nearestTac(lat, lon), id);
  assert.equal(tac.nearestTac(lat, lon + 360), id);
  const ring = tac.tacBoundary(id);
  assert.ok(ring.length >= 3);
  for (const [x, y] of ring) {
    assert.ok(x >= -180 && x <= 180);
    assert.ok(Math.abs(y) <= tac.TAC_MODEL.latitudeLimit + 0.00001);
  }
}

assert.equal(tac.nearestTac(40.65802620930233, -4.686977325581395), 55647);
assert.equal(tac.nearestTac(85, 0), null);
assert.equal(tac.nearestTac(-85, 0), null);
assert.equal(tac.isReservedTac(0), true);
assert.equal(tac.isReservedTac(65534), true);
assert.equal(tac.isReservedTac(65535), false);
assert.throws(() => tac.tacCenter(65536), RangeError);
assert.throws(() => tac.nearestTac(NaN, 0), RangeError);

// Every retained adjacency is reciprocal; this also exercises all offsets.
for (let id = 0; id < tac.TAC_MODEL.count; id++) {
  for (const other of tac.tacNeighbors(id)) assert.ok(tac.tacNeighbors(other).includes(id));
}
const center = tac.tacCenter(55647);
const nearby = tac.nearbyTacs(center.lat, center.lon, 500, 20);
assert.equal(nearby[0], 55647);
assert.equal(nearby.length, 20);
assert.equal(new Set(nearby).size, nearby.length);
console.log('TAC tests passed: model roundtrips, latitude clipping, reserved codes, all adjacency symmetry, local lookup.');
