import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCompounds,getCompound} from '../js/pubchem.js';
import {findProducts} from '../js/openfda.js';
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('./fixtures/labels.json',import.meta.url)));
test('recognized PubChem not found differs from arbitrary 404; name URL is encoded',async()=>{
 const original=globalThis.fetch;let requested;
 try{
  globalThis.fetch=async url=>{requested=url;return new Response(JSON.stringify({Fault:{Code:'PUGREST.NotFound',Message:'No CID found'}}),{status:404});};
  assert.deepEqual(await searchCompounds('not/a name'),[]);assert(requested.includes('not%2Fa%20name'));
  globalThis.fetch=async()=>new Response(JSON.stringify({Fault:{Code:'Unknown',Message:'bad endpoint'}}),{status:404});
  await assert.rejects(searchCompounds('other404'),e=>e.status===404&&e.code==='Unknown');
 }finally{globalThis.fetch=original;}
});
test('one missing NDC does not discard independently linked product; fixed 20-label page',async()=>{
 const original=globalThis.fetch;const urls=[];
 try{
  globalThis.fetch=async url=>{
   urls.push(new URL(url));const u=new URL(url);
   if(u.pathname.includes('label'))return new Response(JSON.stringify({meta:{results:{total:1}},results:fixture.labels}));
   if(u.searchParams.get('search').includes('59726-065'))return new Response(JSON.stringify({error:{code:'NOT_FOUND',message:'No matches found!'}}),{status:404});
   return new Response(JSON.stringify({meta:{results:{total:1}},results:[fixture.ndcs[1]]}));
  };
  const r=await findProducts({CID:2244},fixture.evidence);assert.equal(r.products.length,1);assert.equal(r.products[0].ndc.product_ndc,'12345-678');assert(r.lookupHeld.length>0);assert.equal(urls[0].searchParams.get('limit'),'20');assert.equal(r.nextSkip,null);
 }finally{globalThis.fetch=original;}
});
test('recognized no-label response is empty, not a network-success invention',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'NOT_FOUND',message:'No matches found!'}}),{status:404});const r=await findProducts({CID:2244},fixture.evidence,{skip:20});assert.deepEqual(r.products,[]);assert.equal(r.nextSkip,null);assert.equal(r.held.length,0);}finally{globalThis.fetch=original;}
});
test('direct CID mismatches are rejected',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(JSON.stringify({PropertyTable:{Properties:[{CID:999}]}}));await assert.rejects(getCompound(2244),/different compound identity/);}finally{globalThis.fetch=original;}
});
