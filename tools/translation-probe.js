import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {server} from './serve.js';
await new Promise(r=>server.listening?r():server.once('listening',r));
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-component-update','--disable-background-networking']});
const page=await browser.newPage();
const report={browser:browser.version(),observedAt:new Date().toISOString(),mode:'isolated headless Chrome; component updates/background networking enabled',results:[]};
try {
 await page.goto('http://127.0.0.1:4173');
 for(const name of ['아스피린','아세트아미노펜','이부프로펜']){
  await page.locator('#query').fill(name);await page.locator('#search-form button').click();
  await page.waitForFunction(()=>!document.querySelector('#translation').hidden || document.querySelector('#status').classList.contains('error'),{},{timeout:240000});
  const row={input:name,status:await page.locator('#status').innerText(),candidate:await page.locator('#candidate').inputValue()};
  await page.locator('#confirm-translation').click(); await page.locator('#results .button').first().waitFor({timeout:60000});row.pubchem=await page.locator('#results').innerText();report.results.push(row);
 }
 await page.goto('http://127.0.0.1:4173/detail.html?cid=2244');await page.locator('#confirm-compound').waitFor({timeout:60000});await page.locator('#confirm-compound').click();await page.locator('#products button').first().waitFor({timeout:180000});await page.locator('#products button').first().click();await page.locator('#label button').first().click();await page.waitForFunction(()=>[...document.querySelectorAll('.translation-text')].some(x=>x.textContent.trim()),{},{timeout:240000});report.englishToKorean={selectionKey:await page.locator('#label').getAttribute('data-selection-key'),source:await page.locator('#label .source-text').first().innerText(),translated:await page.locator('#label .translation-text').first().innerText()};
}catch(error){report.error=error.message;report.lastStatus=await page.locator('#status').innerText().catch(()=> 'browser closed');}
await page.screenshot({path:'docs/evidence/translation-browser.png',fullPage:true}).catch(()=>{});
await writeFile('docs/evidence/translation-browser.json',JSON.stringify(report,null,2));console.log(report);await browser.close();server.close();
