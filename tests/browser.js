import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {server} from '../tools/serve.js';
await new Promise(r=>server.listening?r():server.once('listening',r));
const fixture=JSON.parse(await readFile('tests/fixtures/labels.json'));
const live=JSON.parse(await readFile('docs/evidence/api-browser.json'));
const unii=live.results.find(x=>x.url.includes('pug_view')).body;
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();const transcript={schemaVersion:1,kind:'browser-automation',browser:browser.version(),observedAt:new Date().toISOString(),steps:[]};
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const step=async(name,fn)=>{await fn();transcript.steps.push({action:name,verdict:'passed',url:page.url()});};
await page.route('https://pubchem.ncbi.nlm.nih.gov/**',async route=>{
 const url=route.request().url();
 if(url.includes('/PNG'))return route.fulfill({status:404,body:''});
 if(url.includes('pug_view'))return route.fulfill({json:unii});
 if(url.includes('slow'))await new Promise(r=>setTimeout(r,100));
 return route.fulfill({json:{PropertyTable:{Properties:[{CID:2244,Title:url.includes('slow')?'STALE':'Aspirin',MolecularFormula:'C9H8O4',MolecularWeight:'180.16',IUPACName:'acetylsalicylic acid',ConnectivitySMILES:'CC(=O)Oc1ccccc1C(=O)O'}]}}});
});
await page.route('https://api.fda.gov/**',route=>{
 const url=new URL(route.request().url());
 if(url.pathname.includes('label'))return route.fulfill({json:{meta:{results:{total:1}},results:fixture.labels}});
 const value=url.searchParams.get('search');const records=fixture.ndcs.filter(n=>value.includes(n.product_ndc));
 return route.fulfill({json:{meta:{results:{total:records.length}},results:records}});
});
try {
 await step('Browser fixture contracts',async()=>{await page.goto('http://127.0.0.1:4173/tests/');await page.waitForFunction(()=>document.body.dataset.result);assert.equal(await page.locator('body').getAttribute('data-result'),'passed');});
 await step('Invalid CID never offers product connection',async()=>{await page.goto('http://127.0.0.1:4173/detail.html?cid=1e3');assert.match(await page.locator('#status').innerText(),/유효하지/);assert.equal(await page.locator('#confirm-compound').isVisible(),false);});
 await step('Unsupported native translator keeps English input available',async()=>{await page.addInitScript(()=>Object.defineProperty(window,'Translator',{value:undefined,configurable:true}));await page.goto('http://127.0.0.1:4173');await page.locator('#query').fill('아스피린');await page.locator('#search-form button').click();await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));assert.equal(await page.locator('#translation').isVisible(),false);});
 await step('Korean candidate is editable and explicit confirmation required (mock model)',async()=>{
  await page.addInitScript(()=>Object.defineProperty(window,'Translator',{configurable:true,value:{availability:async()=> 'available',create:async()=>({translate:async text=>{await new Promise(r=>setTimeout(r,200));return text==='아스피린'?'aspirin':`번역: ${text}`;}})}}));
  await page.reload();await page.locator('#query').fill('아스피린');await page.locator('#search-form button').click();await page.locator('#translation').waitFor();assert.equal(await page.locator('#results article').count(),0);await page.locator('#candidate').fill('aspirin');await page.locator('#confirm-translation').click();await page.locator('#results .button').waitFor();
 });
 await step('Rapid search cancels stale result',async()=>{await page.locator('#query').fill('slow');await page.locator('#search-form button').click();await page.locator('#query').fill('aspirin');await page.locator('#search-form button').click();await page.locator('#results .button').waitFor();await page.waitForTimeout(300);assert(!await page.locator('#results').innerText().then(x=>x.includes('STALE')));});
 await step('Detail refresh requires explicit CID confirmation',async()=>{await page.locator('#results .button').click();await page.locator('#confirm-compound').waitFor();await page.reload();await page.locator('#confirm-compound').waitFor();assert.equal(await page.locator('#products button').count(),0);});
 await step('Shared label creates only actual NDC products and escaped malicious text',async()=>{await page.locator('#confirm-compound').click();await page.waitForFunction(()=>document.querySelectorAll('#products button').length===2);assert.equal(await page.locator('#products img').count(),0);await page.locator('#products button').first().click();assert.match(await page.locator('#label').innerText(),/TABLET, COATED/);assert.match(await page.locator('#label').innerText(),/이상반응 \(ADR\)[\s\S]*자료 없음/);});
 await step('Late translation cannot overwrite different product sharing label',async()=>{await page.locator('#label button').first().click();await page.locator('#products button').nth(1).click();await page.waitForTimeout(400);assert.match(await page.locator('#label').innerText(),/GEL/);assert.equal(await page.locator('#label .translation-text').allTextContents().then(x=>x.join('')),'');assert.equal(await page.locator('#label img').count(),0);});
 await page.screenshot({path:'docs/evidence/browser-adversarial.png',fullPage:true});
 assert.deepEqual(errors,[]);
 transcript.status='passed';
}catch(e){transcript.status='failed';transcript.error=e.stack;process.exitCode=1;}
await writeFile('docs/evidence/browser-adversarial.json',JSON.stringify(transcript,null,2));console.log(transcript);await browser.close();server.close();
