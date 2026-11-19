import assert from 'node:assert/strict';
import {parseObserverCoordinates} from '../public/js/coordinates.js';
assert.deepEqual(parseObserverCoordinates('35.681236','139.767125'),{lat:35.681236,lon:139.767125});
assert.deepEqual(parseObserverCoordinates('-33.86','151.2'),{lat:-33.86,lon:151.2});
assert.deepEqual(parseObserverCoordinates('0','0'),{lat:0,lon:0});
assert.deepEqual(parseObserverCoordinates('-90','180'),{lat:-90,lon:180});
for(const [lat,lon] of [['','0'],['0',''],['91','0'],['0','-180.1'],['NaN','0'],['0','Infinity']])assert.throws(()=>parseObserverCoordinates(lat,lon));
console.log('PASS coordinate input: hemispheres, zero, limits, empty and invalid values');
