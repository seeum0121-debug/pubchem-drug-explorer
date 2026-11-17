import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='https://seeum0121-debug.github.io/pubchem-drug-explorer/';
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-component-update','--disable-background-networking']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const report={schemaVersion:1,kind:'browser-automation',browser:browser.version(),observedAt:new Date().toISOString(),base,steps:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try{
 const response=await page.goto(base);assert.equal(response.status(),200);
 for(const [name,cid] of [['aspirin',2244],['acetaminophen',1983],['ibuprofen',3672]]){
  await page.locator('#query').fill(name);await page.locator('#search-form button').click();await page.locator('#results .button').first().waitFor({timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#results img')?.naturalWidth>0,{},{timeout:60000});
  assert.match(await page.locator('#results').innerText(),new RegExp(String(cid)));
  report.steps.push({action:'English search and live PubChem confirmation (Korean search tested separately)',input:name,cid,result:await page.locator('#results').innerText(),verdict:'passed'});
  await page.locator('#results .button').first().click();await page.locator('#confirm-compound').waitFor({timeout:60000});assert(page.url().endsWith(`cid=${cid}`));
  await page.reload();await page.locator('#confirm-compound').waitFor({timeout:60000});assert.equal(await page.locator('#products button').count(),0);
  report.steps.push({action:'Detailed chemical fields and fresh explicit confirmation after reload',input:name,cid,result:await page.locator('#compound').innerText(),verdict:'passed'});
  await page.waitForFunction(()=>document.querySelector('#compound img')?.naturalWidth>0,{},{timeout:60000});
  await page.locator('#confirm-compound').click();await page.locator('#products button').first().waitFor({timeout:180000});await page.locator('#products button').first().click();
  const selectionKey=await page.locator('#label').getAttribute('data-selection-key');assert.equal(JSON.parse(selectionKey).length,3);
  await page.waitForFunction(()=>document.querySelector('.translation-state')?.textContent==='한국어로 표시했습니다.',{},{timeout:180000});
  assert.match(await page.locator('#label article h3').first().innerText(),/경고/);
  assert.equal(await page.locator('#label').getAttribute('aria-busy'),'false');
  assert.equal(await page.locator('#products [aria-pressed=true]').count(),1);
  assert.equal(await page.locator('main > :last-child').getAttribute('id'),'data-evidence');
  assert.equal(await page.locator('#data-evidence').getAttribute('open'),null);
  assert.match(await page.locator('#label .translation-text').first().innerText(),/[가-힣]/);
  report.steps.push({action:'Exact product/form/route/label plus native Korean label translation on HTTPS Pages',input:name,cid,selectionKey,result:await page.locator('#label').innerText(),identity:await page.locator('#selected-evidence').textContent(),verdict:'passed'});
  await page.screenshot({path:`docs/evidence/pages-${cid}.png`,fullPage:true});
  if(cid===2244)await page.screenshot({path:'docs/evidence/pages.png',fullPage:true});
  await page.goBack();await page.locator('#query').waitFor();
 }
 report.status=report.errors.length?'failed':'passed';
}catch(error){report.status='failed';report.errors.push(error.message);process.exitCode=1;}
await writeFile('docs/evidence/pages.json',JSON.stringify(report,null,2));console.log({status:report.status,steps:report.steps.map(x=>({action:x.action,input:x.input,selectionKey:x.selectionKey})),errors:report.errors});await browser.close();
