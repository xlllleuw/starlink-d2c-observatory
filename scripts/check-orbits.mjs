import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fetchOrbits, parseStarlinkTle, tleEpoch } from '../server/live-data.mjs';

const data = new URL('../public/data/', import.meta.url);
if (process.argv.includes('--refresh')) {
  const snapshot = await fetchOrbits();
  await mkdir(data, { recursive: true });
  await writeFile(new URL('orbits.json', data), JSON.stringify(snapshot));
  await writeFile(new URL('dtc-registry.json', data), JSON.stringify({
    asOf: snapshot.registryAsOf,
    source: snapshot.source,
    sourceUrl: snapshot.sourceUrl,
    method: snapshot.registryMethod,
    satellites: snapshot.satellites.map(({ noradId, name }) => ({ noradId, name })),
  }));
  console.log(`Downloaded ${snapshot.satellites.length} DTC satellites; epochs ${snapshot.epochMin} to ${snapshot.epochMax}.`);
}

const snapshot = JSON.parse(await readFile(new URL('orbits.json', data), 'utf8'));
assert.ok(snapshot.satellites.length > 0);
assert.equal(new Set(snapshot.satellites.map(s => s.noradId)).size, snapshot.satellites.length);
const all = snapshot.satellites.map(s => `${s.name}\n${s.line1}\n${s.line2}`).join('\n');
const roundtrip = parseStarlinkTle(all, snapshot.fetchedAt);
assert.deepEqual(roundtrip.satellites, snapshot.satellites);
assert.equal(roundtrip.epochMin, snapshot.epochMin);
assert.equal(roundtrip.epochMax, snapshot.epochMax);
const sample = snapshot.satellites[0];
assert.equal(tleEpoch(sample.line1), sample.epoch);
assert.throws(() => parseStarlinkTle(all.replace(/\[DTC\]/g, '')), /no valid/);
assert.throws(() => parseStarlinkTle('<html>Rate limited</html>'), /no valid/);
const corrupt = sample.line1.slice(0, -1) + ((Number(sample.line1.at(-1)) + 1) % 10);
assert.throws(() => parseStarlinkTle(`${sample.name}\n${corrupt}\n${sample.line2}`), /no valid/);
console.log(`PASS: ${snapshot.satellites.length} records, DTC filtering, checksums, unique NORAD IDs, epochs and roundtrip.`);
console.log(`Snapshot fetched ${snapshot.fetchedAt}; oldest epoch ${snapshot.epochMin}; newest ${snapshot.epochMax}.`);

if (!process.argv.includes('--refresh')) {
  let requests = 0;
  const fetchImpl = async url => {
    requests++;
    if (url.includes('celestrak.org')) return new Response('Unavailable', { status: 503 });
    return new Response(all);
  };
  const [first, second] = await Promise.all([fetchOrbits({ fetchImpl }), fetchOrbits({ fetchImpl })]);
  assert.equal(requests, 2);
  assert.equal(first, second);
  assert.equal(first.mirrored, true);
  assert.equal(first.satellites.length, snapshot.satellites.length);
  assert.equal(await fetchOrbits({ fetchImpl }), first);
  assert.equal(requests, 2);
  console.log('PASS: primary failure → daily mirror; concurrent fetches coalesce; two-hour cache avoids duplicate downloads.');
}
