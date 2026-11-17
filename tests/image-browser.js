import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {server} from '../tools/serve.js';
await new Promise(r=>server.listening?r():server.once('listening',r));
const browser=await chromium.launch({channel:'chrome'});
const fixture=JSON.parse(await readFile('tests/fixtures/labels.json'));
const unii=JSON.parse(await readFile('docs/evidence/api-browser.json')).results.find(x=>x.url.includes('pug_view')).body;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64');
const report={schemaVersion:1,kind:'browser-automation',browser:browser.version(),observedAt:new Date().toISOString(),steps:[]};
let page;
async function fresh(){await page?.close();page=await browser.newPage();await page.addInitScript(()=>{window.urls={created:[],revoked:[]};const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const url=create(b);window.urls.created.push(url);return url;};URL.revokeObjectURL=url=>{window.urls.revoked.push(url);revoke(url);};});await page.goto('http://127.0.0.1:4173');}
async function step(action,run){const evidence=await run();report.steps.push({action,verdict:'passed',...evidence});}
try{
 await step('Mixed JSON and two image requests serialize at one-second intervals; loaded object URLs revoked',async()=>{
  await fresh();const starts=[];
  await page.route('https://pubchem.ncbi.nlm.nih.gov/**',async route=>{starts.push(Date.now());await route.fulfill(route.request().url().endsWith('/PNG')?{body:png,contentType:'image/png'}:{json:{ok:true}});});
  await page.evaluate(async()=>{const {compoundCard}=await import('./js/render.js');const {requestJSON}=await import('./js/http.js');document.querySelector('#results').append(compoundCard({CID:2244}),compoundCard({CID:1983}));window.jsonDone=false;requestJSON('https://pubchem.ncbi.nlm.nih.gov/test.json').then(()=>window.jsonDone=true);});
  await page.waitForFunction(()=>window.urls.revoked.length===2&&window.jsonDone);assert.equal(starts.length,3);const gaps=starts.slice(1).map((t,i)=>t-starts[i]);assert(gaps.every(t=>t>=990));assert.equal(await page.locator('#results img').evaluateAll(xs=>xs.filter(x=>x.naturalWidth>0).length),2);return {startGapsMs:gaps};
 });
 await step('Already dispatched obsolete image is aborted and never receives a blob URL',async()=>{
  await fresh();let dispatched;const started=new Promise(r=>dispatched=r);
  await page.route('https://pubchem.ncbi.nlm.nih.gov/**',async route=>{dispatched();await new Promise(r=>setTimeout(r,250));await route.fulfill({body:png,contentType:'image/png'}).catch(()=>{});});
  await page.evaluate(async()=>{const {compoundCard}=await import('./js/render.js');window.imageController=new AbortController();window.oldCard=compoundCard({CID:2244},{signal:window.imageController.signal});document.querySelector('#results').append(window.oldCard);});
  await started;await page.evaluate(()=>{window.imageController.abort();window.oldCard.remove();});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.urls.created.length),0);assert.equal(await page.locator('#results').innerText(),'');
 });
 await step('Image timeout is visible instead of silent success',async()=>{
  await fresh();await page.evaluate(()=>{const timer=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timer(fn,ms===20000?30:ms,...args);});
  await page.route('https://pubchem.ncbi.nlm.nih.gov/**',async route=>{await new Promise(r=>setTimeout(r,150));await route.fulfill({body:png,contentType:'image/png'}).catch(()=>{});});
  await page.evaluate(async()=>{const {compoundCard}=await import('./js/render.js');document.querySelector('#results').append(compoundCard({CID:2244}));});
  await page.getByText('구조 이미지 조회 실패',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.urls.created.length),0);
 });
 await step('Decode failure revokes allocated URL and preserves explicit image error',async()=>{
  await fresh();await page.route('https://pubchem.ncbi.nlm.nih.gov/**',route=>route.fulfill({body:'not png',contentType:'image/png'}));
  await page.evaluate(async()=>{const {compoundCard}=await import('./js/render.js');document.querySelector('#results').append(compoundCard({CID:2244}));});await page.getByText('구조 이미지 조회 실패',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.urls.created.length),1);assert.equal(await page.evaluate(()=>window.urls.revoked.length),1);
 });
 await step('Product confirmation retains pending detail image; failed page retry retains selected product',async()=>{
  await fresh();let retries=0;const offsets=[];
  await page.route('https://pubchem.ncbi.nlm.nih.gov/**',async route=>{const url=route.request().url();if(url.endsWith('/PNG')){await new Promise(r=>setTimeout(r,1200));return route.fulfill({body:png,contentType:'image/png'});}return route.fulfill({json:url.includes('pug_view')?unii:{PropertyTable:{Properties:[{CID:2244,Title:'Aspirin',ConnectivitySMILES:'test'}]}}});});
  await page.route('https://api.fda.gov/**',route=>{const url=new URL(route.request().url());if(url.pathname.includes('label')){const skip=url.searchParams.get('skip');offsets.push(skip);if(skip==='1' && retries++===0)return route.fulfill({status:400,json:{error:{code:'BAD_REQUEST',message:'temporary fixture page failure'}}});return route.fulfill({json:{meta:{results:{total:2}},results:fixture.labels}});}const records=fixture.ndcs.filter(n=>url.searchParams.get('search').includes(n.product_ndc));return route.fulfill({json:{meta:{results:{total:records.length}},results:records}});});
  await page.goto('http://127.0.0.1:4173/detail.html?cid=2244');await page.locator('#confirm-compound').waitFor();await page.locator('#confirm-compound').click();
  await page.waitForFunction(()=>document.querySelector('#compound img')?.naturalWidth>0);await page.locator('#products button').first().waitFor();await page.locator('#products button').first().click();const key=await page.locator('#label').getAttribute('data-selection-key');await page.locator('#more').click();await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));assert(await page.locator('#more').isVisible());assert.equal(await page.locator('#label').getAttribute('data-selection-key'),key);await page.locator('#more').click();await page.waitForFunction(()=>!document.querySelector('#confirm-compound').disabled);assert.equal(await page.locator('#label').getAttribute('data-selection-key'),key);assert.deepEqual(offsets,['0','1','1']);return {requestedOffsets:offsets};
 });
 await page.screenshot({path:'docs/evidence/image-browser.png',fullPage:true});report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}
await writeFile('docs/evidence/image-browser.json',JSON.stringify(report,null,2));console.log(report);await browser.close();server.close();
