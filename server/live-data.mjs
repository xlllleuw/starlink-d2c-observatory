/** Public CelesTrak GP feed. DTC membership follows the feed's [DTC] tags. */
export const ORBIT_SOURCE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle';
export const ORBIT_MIRROR_URL = 'https://huggingface.co/datasets/juliensimon/starlink-tle-latest/resolve/main/data/starlink.tle';
export const ORBIT_CACHE_MS = 2 * 60 * 60 * 1000;
let cached;
let inFlight;
let nextAttemptAt = 0;
let lastError;

function checksumValid(line) {
  if (line.length !== 69 || !/\d/.test(line[68])) return false;
  let total = 0;
  for (const char of line.slice(0, 68)) {
    if (char >= '0' && char <= '9') total += Number(char);
    else if (char === '-') total++;
  }
  return total % 10 === Number(line[68]);
}

export function tleEpoch(line1) {
  const year2 = Number(line1.slice(18, 20));
  const day = Number(line1.slice(20, 32));
  const year = year2 < 57 ? 2000 + year2 : 1900 + year2;
  if (!Number.isFinite(day) || day < 1 || day >= 367) throw new Error('Invalid TLE epoch');
  return new Date(Date.UTC(year, 0, 1) + (day - 1) * 86400000).toISOString();
}

export function parseStarlinkTle(body, fetchedAt = new Date().toISOString()) {
  const lines = body.split(/[\r\n]+/).map(line => line.trimEnd()).filter(Boolean);
  const byNorad = new Map();
  let marked = 0;
  let rejected = 0;
  for (let i = 0; i + 2 < lines.length; i++) {
    if (!/\[DTC\]/i.test(lines[i])) continue;
    marked++;
    const name = lines[i].replace(/^0\s+/, '').trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ') ||
        line1.slice(2, 7) !== line2.slice(2, 7) ||
        !/^\d{5}$/.test(line1.slice(2, 7)) ||
        !checksumValid(line1) || !checksumValid(line2)) {
      rejected++;
      continue;
    }
    const noradId = Number(line1.slice(2, 7));
    const epoch = tleEpoch(line1);
    const previous = byNorad.get(noradId);
    if (!previous || epoch > previous.epoch) byNorad.set(noradId, { noradId, name, line1, line2, epoch });
    i += 2;
  }
  const satellites = [...byNorad.values()].sort((a, b) => a.noradId - b.noradId);
  if (!satellites.length) throw new Error('CelesTrak returned no valid [DTC] orbital records');
  const epochs = satellites.map(s => s.epoch).sort();
  const staleCount = satellites.filter(s => Date.parse(fetchedAt) - Date.parse(s.epoch) > 72 * 3600000).length;
  const warnings = [];
  if (rejected) warnings.push(`${rejected} tagged records failed TLE validation and were omitted.`);
  if (staleCount) warnings.push(`${staleCount} orbital records have epochs older than 72 hours.`);
  return {
    source: 'CelesTrak · Starlink GP / DTC',
    sourceUrl: ORBIT_SOURCE_URL,
    fetchedAt,
    epochMin: epochs[0],
    epochMax: epochs.at(-1),
    registryAsOf: fetchedAt,
    registryMethod: 'CelesTrak Starlink GP catalog names carrying the [DTC] marker',
    propagation: 'SGP4; positions computed for the current time from these orbital elements',
    refreshIntervalSeconds: ORBIT_CACHE_MS / 1000,
    taggedRecordCount: marked,
    staleCount,
    satellites,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  };
}

/** Prime the two-hour cache from a previously validated, durable snapshot. */
export function primeOrbitCache(snapshot) {
  if (!snapshot?.satellites?.length || !Number.isFinite(Date.parse(snapshot.fetchedAt))) return false;
  if (!cached || snapshot.fetchedAt > cached.fetchedAt) cached = snapshot;
  return true;
}

/** Two-hour, single-flight upstream cache. Caller owns durable fallback storage. */
export async function fetchOrbits({ fetchImpl = globalThis.fetch } = {}) {
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < ORBIT_CACHE_MS) return cached;
  if (inFlight) return inFlight;
  if (Date.now() < nextAttemptAt) {
    if (cached) return { ...cached, cached: true, refreshError: lastError };
    throw new Error(lastError || 'Orbital feed retry deferred');
  }
  nextAttemptAt = Date.now() + ORBIT_CACHE_MS;
  inFlight = (async () => {
    const failures = [];
    for (const url of [ORBIT_SOURCE_URL, ORBIT_MIRROR_URL]) {
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(20000),
          headers: { Accept: 'text/plain', 'User-Agent': 'DTC-Atlas-research-demo/1.0' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = parseStarlinkTle(await response.text());
        if (url === ORBIT_MIRROR_URL) {
          snapshot.source = 'CelesTrak GP via juliensimon/starlink-tle-latest mirror';
          snapshot.sourceUrl = url;
          snapshot.upstreamSourceUrl = ORBIT_SOURCE_URL;
          snapshot.mirrored = true;
        }
        cached = snapshot;
        lastError = undefined;
        return snapshot;
      } catch (error) {
        failures.push(`${url === ORBIT_SOURCE_URL ? 'CelesTrak' : 'Daily mirror'}: ${error.message}`);
      }
    }
    lastError = failures.join('; ');
    if (cached) return { ...cached, cached: true, refreshError: lastError };
    throw new Error(lastError);
  })();
  try { return await inFlight; }
  finally { inFlight = undefined; }
}
