import test from 'node:test';
import assert from 'node:assert/strict';
const fresh=()=>import(`../js/http.js?test=${Math.random()}`);
const url='https://api.fda.gov/drug/label.json?test=1';
const response=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers});
test('deduplicates concurrent and cached requests; isolates cancelled consumer',async()=>{
 const original=globalThis.fetch;let calls=0,release;
 globalThis.fetch=async()=>{calls++;await new Promise(r=>release=r);return response(200,{results:[1]});};
 try{const {requestJSON}=await fresh();const c=new AbortController();const a=requestJSON(url,{signal:c.signal});const b=requestJSON(url);const rejected=assert.rejects(a,{name:'AbortError'});await new Promise(r=>setTimeout(r,10));c.abort();release();await rejected;assert.deepEqual((await b).results,[1]);await requestJSON(url);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('429/503 retry bounded at two; one second starts',async()=>{
 const original=globalThis.fetch;const times=[];
 globalThis.fetch=async()=>{times.push(Date.now());return response(times.length<3?503:200,{results:[]});};
 try{const {requestJSON}=await fresh();await requestJSON(url);assert.equal(times.length,3);assert(times[1]-times[0]>=990);assert(times[2]-times[1]>=990);}finally{globalThis.fetch=original;}
});
test('long Retry-After rejected and 404 error code retained without retries',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return response(429,{error:{code:'RATE_LIMIT',message:'rate'}},{'Retry-After':'60'});};let mod=await fresh();await assert.rejects(mod.requestJSON(url),/long wait/);assert.equal(calls,1);
 globalThis.fetch=async()=>{calls++;return response(404,{error:{code:'NOT_FOUND',message:'No matches found!'}});};mod=await fresh();await assert.rejects(mod.requestJSON(url),e=>e.status===404&&e.code==='NOT_FOUND');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('malformed JSON, network failures and unsafe hosts are explicit',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('bad',{status:200});let m=await fresh();await assert.rejects(m.requestJSON(url),/invalid JSON/);globalThis.fetch=async()=>{throw new Error('offline');};m=await fresh();await assert.rejects(m.requestJSON(url),/Network request failed/);await assert.rejects(m.requestJSON('https://evil.test/x'),/approved/);}finally{globalThis.fetch=original;}
});
test('timeout and aborted queue cannot populate cache',async()=>{
 const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;
 globalThis.setTimeout=(fn,ms,...args)=>originalTimer(fn,ms===20000?25:ms,...args);
 globalThis.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 try{const m=await fresh();await assert.rejects(m.requestJSON(url),/timed out/);const c=new AbortController();c.abort();await assert.rejects(m.requestJSON(url,{signal:c.signal}),{name:'AbortError'});}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}
});
