import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {server} from '../tools/serve.js';
await new Promise(r=>server.listening?r():server.once('listening',r));
const fixture=JSON.parse(await readFile('tests/fixtures/labels.json'));
const unii=JSON.parse(await readFile('docs/evidence/api-browser.json')).results.find(x=>x.url.includes('pug_view')).body;
const b=await chromium.launch({channel:'chrome'});
const p=await b.newPage();
const report={schemaVersion:1,kind:'browser-automation',observedAt:new Date().toISOString(),steps:[]};
await p.addInitScript(()=>{
 window.modelCreates=0;window.activation=[];window.failModel=false;window.failText=false;window.calls=[];
 window.Translator={create:()=>{
  window.modelCreates++;window.activation.push(navigator.userActivation.isActive);
  if(window.failModel)return Promise.reject(new Error('모델 다운로드 실패'));
  return new Promise(resolve=>setTimeout(()=>resolve({translate:async text=>{
   window.calls.push(text);
   const fail=window.failText;
   await new Promise(r=>setTimeout(r,180));
   if(fail)throw new Error('본문 번역 실패');
   return '한국어: '+text;
  }}),300));
 }};
});
await p.route('https://pubchem.ncbi.nlm.nih.gov/**',r=>r.fulfill(r.request().url().includes('pug_view')?{json:unii}:r.request().url().endsWith('/PNG')?{status:404,body:''}:{json:{PropertyTable:{Properties:[{CID:2244,Title:'Aspirin'}]}}}));
await p.route('https://api.fda.gov/**',r=>{
 const u=new URL(r.request().url());
 const records=u.pathname.includes('label')?fixture.labels:fixture.ndcs.filter(n=>u.searchParams.get('search').includes(n.product_ndc));
 return r.fulfill({json:{meta:{results:{total:records.length}},results:records}});
});
async function open(){
 await p.goto('http://127.0.0.1:4173/detail.html?cid=2244');
 await p.locator('#confirm-compound').waitFor();await p.locator('#confirm-compound').click();
 await p.locator('#products button').first().waitFor();
}
const completed=()=>p.waitForFunction(()=>document.querySelector('.translation-state').textContent==='한국어로 표시했습니다.');
try{
 await open();
 await p.locator('#products button').first().click();
 await p.locator('#products button').nth(1).click();
 await completed();
 assert.equal(await p.evaluate(()=>window.modelCreates),1);
 assert.deepEqual(await p.evaluate(()=>window.activation),[true]);
 assert.equal(await p.locator('#label button').count(),0);
 assert.match(await p.locator('#label').innerText(),/GEL/);
 assert.equal(await p.locator('#products [aria-pressed=true]').count(),1);
 assert.equal(await p.locator('#products button').nth(1).getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('#label').getAttribute('aria-busy'),'false');
 assert.equal(await p.locator('#label details[open]').count(),0);
 assert.equal(await p.locator('#data-evidence').getAttribute('open'),null);
 assert.equal(await p.locator('main > :last-child').getAttribute('id'),'data-evidence');
 assert.match(await p.locator('#label article h3').first().innerText(),/경고/);
 assert(!await p.locator('#products').innerText().then(x=>x.includes(fixture.labels[0].id)));
 assert.equal(await p.locator('#label .translation-text').count(),await p.evaluate(()=>window.calls.length));
 report.steps.push({action:'Pending model shared during rapid switch; activation true; all present sections translate; selected state and bottom evidence',verdict:'passed'});
 // Switch after translation has started, not only while model creation is pending.
 await open();await p.locator('#products button').first().click();
 await p.waitForFunction(()=>window.calls.length>0);
 await p.locator('#products button').nth(1).click();await completed();
 assert.match(await p.locator('#label').innerText(),/GEL/);
 assert.equal(await p.locator('#label .translation-text.error').count(),0);
 report.steps.push({action:'In-flight old translation cannot replace newly selected product',verdict:'passed'});
 await open();await p.evaluate(()=>window.failText=true);
 await p.locator('#products button').first().click();
 await p.waitForFunction(()=>window.calls.length>0);
 await p.evaluate(()=>window.failText=false);
 await p.locator('#products button').nth(1).click();await completed();
 assert.equal(await p.locator('#label .error').count(),0);
 assert.equal(await p.locator('#label details[open]').count(),0);
 assert.match(await p.locator('#label').innerText(),/GEL/);
 report.steps.push({action:'Stale rejected translation cannot mark new product failed or expand its originals',verdict:'passed'});
 await open();await p.evaluate(()=>window.failModel=true);
 await p.locator('#products button').first().click();
 await p.waitForFunction(()=>document.querySelector('.translation-state').classList.contains('error'));
 assert.match(await p.locator('.translation-state').innerText(),/다운로드 실패/);
 assert(await p.locator('#label .source-text').first().isVisible());
 assert.equal(await p.locator('#label').getAttribute('aria-busy'),'false');
 report.steps.push({action:'Download failure explicitly shown and original automatically expanded',verdict:'passed'});
 await p.evaluate(()=>window.failModel=false);
 await p.locator('#products button').nth(1).click();await completed();
 assert.equal(await p.evaluate(()=>window.modelCreates),2);
 report.steps.push({action:'Next product gesture retries rejected model',verdict:'passed'});
 await open();await p.evaluate(()=>window.failText=true);
 await p.locator('#products button').first().click();
 await p.waitForFunction(()=>document.querySelector('#label').getAttribute('aria-busy')==='false');
 assert.match(await p.locator('.translation-state').innerText(),/항목 실패/);
 assert.equal(await p.locator('#label .translation-text.error').count(),await p.locator('#label .source-text').count());
 assert(await p.locator('#label .source-text').first().isVisible());
 report.steps.push({action:'Per-section translation failures never claim success and expose original',verdict:'passed'});
 await p.screenshot({path:'docs/evidence/auto-browser.png',fullPage:true});report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}
await writeFile('docs/evidence/auto-browser.json',JSON.stringify(report,null,2));console.log(report);
await b.close();server.close();
