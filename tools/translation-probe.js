import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {server} from './serve.js';
await new Promise(r=>server.listening?r():server.once('listening',r));
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-component-update','--disable-background-networking']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const report={browser:browser.version(),observedAt:new Date().toISOString(),mode:'isolated headless Chrome; component updates/background networking enabled',results:[]};
try {
 await page.goto('http://127.0.0.1:4173');
 for(const name of ['아스피린','아세트아미노펜','이부프로펜']){
  await page.locator('#query').fill(name);await page.locator('#search-form button').click();
  await page.waitForFunction(()=>!document.querySelector('#translation').hidden || document.querySelector('#status').classList.contains('error'),{},{timeout:240000});
  const row={input:name,status:await page.locator('#status').innerText(),candidate:await page.locator('#candidate').inputValue()};
  if(await page.locator('#translation').isHidden()){report.results.push({...row,error:row.status});continue;}
  await page.locator('#confirm-translation').click(); await page.locator('#results .button').first().waitFor({timeout:60000});row.pubchem=await page.locator('#results').innerText();report.results.push(row);
 }
 await page.goto('http://127.0.0.1:4173/detail.html?cid=2244');await page.locator('#confirm-compound').waitFor({timeout:60000});await page.locator('#confirm-compound').click();await page.locator('#products button').first().waitFor({timeout:180000});await page.locator('#products button').first().click();await page.waitForFunction(()=>document.querySelector('.translation-state')?.textContent==='한국어로 표시했습니다.',{},{timeout:240000});report.englishToKorean={selectionKey:await page.locator('#label').getAttribute('data-selection-key'),source:await page.locator('#label .source-text').first().textContent(),translated:await page.locator('#label .translation-text').first().innerText()};
 assert.match(report.englishToKorean.translated,/[가-힣]/);
 assert.notEqual(report.englishToKorean.translated,report.englishToKorean.source);
 await page.screenshot({path:'docs/evidence/readability-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'docs/evidence/readability-mobile.png',fullPage:true});
 report.status=report.results.some(row=>row.error)?'failed':'passed';
 if(report.status==='failed')process.exitCode=1;
}catch(error){report.status='failed';process.exitCode=1;report.error=error.message;report.lastStatus=await page.locator('#status').innerText().catch(()=> 'browser closed');}
await page.screenshot({path:'docs/evidence/translation-browser.png',fullPage:true}).catch(()=>{});
await writeFile('docs/evidence/translation-browser.json',JSON.stringify(report,null,2));console.log(report);await browser.close();server.close();
