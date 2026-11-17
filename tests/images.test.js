import test from 'node:test';
import assert from 'node:assert/strict';
const fresh=()=>import(`../js/http.js?image=${Math.random()}`);
const image='https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2244/PNG';
const json='https://api.fda.gov/drug/label.json?image-test=1';
const png=()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
test('JSON and PNG share serial one-second scheduler, cache and dedup',async()=>{
 const original=globalThis.fetch;const starts=[];let active=0,maxActive=0;
 globalThis.fetch=async url=>{starts.push(Date.now());active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,30));active--;return url===image?png():new Response('{"ok":true}');};
 try{const m=await fresh();const [a,b,c]=await Promise.all([m.requestJSON(json),m.requestBlob(image),m.requestBlob(image)]);assert(a.ok);assert.equal(await b.text(),await c.text());assert.equal(starts.length,2);assert(starts[1]-starts[0]>=990);assert.equal(maxActive,1);assert.equal(await m.requestBlob(image),b);assert.equal(starts.length,2);}finally{globalThis.fetch=original;}
});
test('cancelled image consumer does not cancel remaining consumer',async()=>{
 const original=globalThis.fetch;let release;
 globalThis.fetch=async()=>{await new Promise(r=>release=r);return png();};
 try{const m=await fresh();const c=new AbortController();const a=m.requestBlob(image,{signal:c.signal});const b=m.requestBlob(image);const rejected=assert.rejects(a,{name:'AbortError'});await new Promise(r=>setTimeout(r,10));c.abort();release();await rejected;assert.equal((await b).type,'image/png');}finally{globalThis.fetch=original;}
});
test('image fetch timeout surfaces error and is not cached',async()=>{
 const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;let calls=0;
 globalThis.setTimeout=(fn,ms,...args)=>originalTimer(fn,ms===20000?25:ms,...args);
 globalThis.fetch=async(_url,{signal})=>{calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));};
 try{const m=await fresh();await assert.rejects(m.requestBlob(image),/timed out/);globalThis.fetch=async()=>{calls++;return png();};await m.requestBlob(image);assert.equal(calls,2);}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}
});
test('image 429 exhausts exactly two retries and preserves provider error',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('{"error":{"code":"RATE_LIMIT","message":"slow down"}}',{status:429,headers:{'Retry-After':'0'}});};
 try{const m=await fresh();await assert.rejects(m.requestBlob(image),e=>e.status===429&&e.code==='RATE_LIMIT');assert.equal(calls,3);}finally{globalThis.fetch=original;}
});
