/** The thesis candidate TAC model. All positions are degrees, distances km. */
export const TAC_MODEL = Object.freeze({
  count: 65536,
  latitudeLimit: 69.98834166262934,
  longitudePhase: 90.08798626780873,
  goldenAngle: 137.50776405003785,
  earthRadiusKm: 6371.0088,
  reservedCodes: Object.freeze([0, 65534]),
  label: 'Research model · Fibonacci / Voronoi',
});

const DEG = Math.PI / 180;
const SCALE = Math.sin(TAC_MODEL.latitudeLimit * DEG);
let vectors;
let grid;
let loading;

function validId(id) {
  if (!Number.isInteger(id) || id < 0 || id >= TAC_MODEL.count) {
    throw new RangeError('TAC must be an integer from 0 to 65535.');
  }
}

function validPosition(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) {
    throw new RangeError('Invalid coordinates.');
  }
}

function wrapLongitude(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

export function tacCenter(id) {
  validId(id);
  return {
    lat: Math.asin(SCALE * (2 * (id + 0.5) / TAC_MODEL.count - 1)) / DEG,
    lon: wrapLongitude(TAC_MODEL.longitudePhase - id * TAC_MODEL.goldenAngle),
  };
}

function ensureVectors() {
  if (vectors) return;
  vectors = new Float64Array(TAC_MODEL.count * 3);
  for (let id = 0; id < TAC_MODEL.count; id++) {
    const { lat, lon } = tacCenter(id);
    const h = Math.cos(lat * DEG);
    vectors[id * 3] = h * Math.cos(lon * DEG);
    vectors[id * 3 + 1] = h * Math.sin(lon * DEG);
    vectors[id * 3 + 2] = Math.sin(lat * DEG);
  }
}

/** Returns null outside the latitude band; works before loading boundaries. */
export function nearestTac(lat, lon) {
  validPosition(lat, lon);
  if (Math.abs(lat) > TAC_MODEL.latitudeLimit) return null;
  ensureVectors();
  const h = Math.cos(lat * DEG);
  const x = h * Math.cos(lon * DEG), y = h * Math.sin(lon * DEG), z = Math.sin(lat * DEG);
  let best = -Infinity, selected = null;
  for (let id = 0; id < TAC_MODEL.count; id++) {
    const k = id * 3;
    const dot = vectors[k] * x + vectors[k + 1] * y + vectors[k + 2] * z;
    if (dot > best) { best = dot; selected = id; }
  }
  return selected;
}

/** Returns TAC ids ordered nearest first, within the center-distance radius. */
export function nearbyTacs(lat, lon, radiusKm = 500, limit = 500) {
  validPosition(lat, lon);
  if (!Number.isFinite(radiusKm) || radiusKm < 0 || !Number.isInteger(limit) || limit < 0) {
    throw new RangeError('Invalid radius or result limit.');
  }
  if (!limit) return [];
  ensureVectors();
  const h = Math.cos(lat * DEG);
  const x = h * Math.cos(lon * DEG), y = h * Math.sin(lon * DEG), z = Math.sin(lat * DEG);
  const threshold = Math.cos(Math.min(Math.PI, radiusKm / TAC_MODEL.earthRadiusKm));
  const candidates = [];
  for (let id = 0; id < TAC_MODEL.count; id++) {
    const k = id * 3;
    const dot = vectors[k] * x + vectors[k + 1] * y + vectors[k + 2] * z;
    if (dot >= threshold) candidates.push({ id, dot });
  }
  candidates.sort((a, b) => b.dot - a.dot);
  return candidates.slice(0, limit).map(entry => entry.id);
}

export function isReservedTac(id) {
  validId(id);
  return id === 0 || id === 65534;
}

/** Load once; passing a URL is optional and useful for non-root hosting. */
export async function loadTacModel(url) {
  if (grid) return TAC_MODEL;
  if (loading) return loading;
  loading = (async () => {
    const response = await fetch(url || new URL('../data/tac/grid.bin', import.meta.url));
    if (!response.ok) throw new Error(`TAC grid download failed (${response.status})`);
    const buffer = await response.arrayBuffer();
    const view = new DataView(buffer);
    if (buffer.byteLength < 32 || view.getUint32(0, true) !== 0x31434154 || view.getUint32(4, true) !== 1) {
      throw new Error('Invalid TAC grid format.');
    }
    const n = view.getUint32(8, true), vertexCount = view.getUint32(12, true), neighborCount = view.getUint32(16, true);
    const expectedSize = 32 + (n + 1) * 8 + vertexCount * 8 + neighborCount * 2;
    if (n !== TAC_MODEL.count || buffer.byteLength !== expectedSize) throw new Error('Invalid TAC grid length.');
    let offset = 32;
    const boundaryOffsets = new Uint32Array(buffer, offset, n + 1); offset += (n + 1) * 4;
    const neighborOffsets = new Uint32Array(buffer, offset, n + 1); offset += (n + 1) * 4;
    const coordinates = new Float32Array(buffer, offset, vertexCount * 2); offset += vertexCount * 8;
    const neighbors = new Uint16Array(buffer, offset, neighborCount);
    grid = { boundaryOffsets, neighborOffsets, coordinates, neighbors };
    return TAC_MODEL;
  })();
  try { return await loading; } catch (error) { loading = undefined; throw error; }
}

function requireGrid() {
  if (!grid) throw new Error('Call await loadTacModel() first.');
  return grid;
}

/** Unclosed ring, each element [longitude, latitude], dateline-safe on a globe. */
export function tacBoundary(id) {
  validId(id);
  const { boundaryOffsets, coordinates } = requireGrid();
  const ring = [];
  for (let k = boundaryOffsets[id]; k < boundaryOffsets[id + 1]; k++) {
    ring.push([coordinates[k * 2], coordinates[k * 2 + 1]]);
  }
  return ring;
}

export function tacNeighbors(id) {
  validId(id);
  const { neighborOffsets, neighbors } = requireGrid();
  return Array.from(neighbors.subarray(neighborOffsets[id], neighborOffsets[id + 1]));
}
