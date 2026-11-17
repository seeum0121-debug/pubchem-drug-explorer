import {linkProducts} from '../js/identity.js';
import {Generation,validCid} from '../js/render.js';
export function contractTests(fixture) {
 const results=[];
 const test=(name,fn)=>{try{fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}};
 const assert=(v,m='assertion failed')=>{if(!v)throw new Error(m);};
 const clone=()=>structuredClone(fixture);
 const run=f=>linkProducts(2244,f.evidence,f.labels,f.ndcs);
 test('positive exact identity, field ownership and provenance',()=>{const r=run(clone());assert(r.products.length===2);const p=r.products[0];assert(p.ndc.dosage_form==='TABLET, COATED');assert(p.provenance.fields['ndc.route'].fieldPath==='route');assert(p.selectionKey===JSON.stringify(['59726-065',p.label.set_id,p.label.id]));assert(p.label.adverse_reactions===undefined);assert(p.sharedLabel);});
 test('array order does not create phantom variants',()=>{const f=clone();f.labels[0].openfda.route.reverse();f.labels[0].openfda.brand_name.reverse();f.labels[0].openfda.product_ndc.reverse();const a=run(f).products.map(p=>[p.selectionKey,p.ndc.dosage_form,p.ndc.route]).sort();const b=run(clone()).products.map(p=>[p.selectionKey,p.ndc.dosage_form,p.ndc.route]).sort();assert(JSON.stringify(a)===JSON.stringify(b));});
 for(const [name,mutate] of [
  ['version mismatch',f=>f.ndcs[0].spl_id='wrong'],['set mismatch',f=>f.ndcs[0].openfda.spl_set_id=['wrong']],['missing identity',f=>delete f.labels[0].id],['salt mismatch',f=>f.ndcs[0].openfda.unii=['DIFFERENT1']],['combination ambiguity',f=>f.ndcs[0].active_ingredients.push({name:'CAFFEINE',strength:'5 mg'})],['unsourced evidence',f=>delete f.evidence.uniis[0].provider],['wrong CID evidence',f=>f.evidence.cid=999],['conflicting key',f=>f.ndcs.push({...f.ndcs[0],dosage_form:'CAPSULE'})]
 ])test(name,()=>{const f=clone();mutate(f);const r=run(f);assert(!r.products.some(p=>p.ndc.product_ndc==='59726-065'));assert(r.held.length>0);});
 test('missing form and route do not erase exact identity',()=>{const f=clone();delete f.ndcs[0].route;delete f.ndcs[0].dosage_form;const r=run(f);assert(r.products.length===2);assert(r.products[0].ndc.route===undefined);});
 test('only identical duplicates collapse',()=>{const f=clone();f.ndcs.push(structuredClone(f.ndcs[0]));assert(run(f).products.length===2);});
 test('stale response and shared-label selection generations',()=>{const g=new Generation();const a=g.next();const b=g.next();assert(!a.current()&&a.signal.aborted&&b.current());});
 test('strict CID validation',()=>{for(const value of [null,'','0','-1','1e3','<script>','22x'])assert(!validCid(value));assert(validCid('2244'));});
 return results;
}
if(typeof document!=='undefined' && document.querySelector('#test-results')) {
 const fixture=await fetch('./fixtures/labels.json').then(r=>r.json());
 const results=contractTests(fixture);
 document.querySelector('#test-results').textContent=JSON.stringify(results,null,2);
 document.body.dataset.result=results.every(x=>x.passed)?'passed':'failed';
}
