import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fetchNews} from '../server/news.mjs';
const snapshot=JSON.parse(await readFile(new URL('../public/data/news.json',import.meta.url),'utf8'));
assert.equal(snapshot.items.length,12);
assert.ok(snapshot.items.every(i=>i.type==='research'&&i.thesisReference));
const result=await fetchNews({fallbackItems:[...snapshot.items,
 {type:'news',url:'https://example.com/news'},
 {type:'post',url:'https://example.com/post'},
 {type:'research',url:'https://example.com/unverified'}],
 fetchImpl:()=>{throw Error('External feeds must not be fetched');}});
assert.deepEqual(result.items,snapshot.items);
console.log('PASS: 12 curated research entries; news, posts and uncurated research excluded.');
