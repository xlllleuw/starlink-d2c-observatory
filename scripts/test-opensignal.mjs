import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeD2D,cellBounds} from '../public/js/opensignal.js';
const bytes=readFileSync(new URL('../public/data/d2d-data.314191eadb65.bin',import.meta.url));
const data=decodeD2D(bytes);
assert.equal(data.cells.length,373703);
assert.equal(data.date,'October 31, 2026');
const alphabet='0123456789bcdefghjkmnpqrstuvwxyz';
const hash=[...'u4pruy'].reduce((n,c)=>n*32+alphabet.indexOf(c),0);
const bounds=cellBounds(hash);
assert.ok(bounds.west<10.41 && bounds.east>10.41);
assert.ok(bounds.south<57.648 && bounds.north>57.648);
for(const h of data.cells){const b=cellBounds(h);assert.ok(b.west>=-180&&b.east<=180&&b.south>=-90&&b.north<=90);}
assert.throws(()=>decodeD2D(bytes.subarray(0,bytes.length-1)));
assert.throws(()=>decodeD2D(new Uint8Array([0,0,0,0,0])));
console.log('PASS: Opensignal snapshot count, date, geohash coordinates, bounds and truncated input.');
