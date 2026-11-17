import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {server} from './serve.js';
await new Promise(r=>server.listening?r():server.once('listening',r));
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
const transcript={browser:browser.version(),observedAt:new Date().toISOString(),steps:[],errors:[]};
page.on('pageerror',e=>transcript.errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:4173');await page.locator('#query').fill('aspirin');await page.locator('#search-form button').click();
 await page.locator('#results .button').first().waitFor({timeout:60000});
 transcript.steps.push({action:'Search aspirin',result:await page.locator('#results').innerText()});
 await page.locator('#results .button').first().click();await page.locator('#confirm-compound').waitFor({timeout:60000});await page.locator('#confirm-compound').click();
 await page.waitForFunction(()=>!document.querySelector('#confirm-compound').disabled,{},{timeout:180000});
 transcript.steps.push({action:'Confirm CID and fetch product page',result:await page.locator('#status').innerText(),products:await page.locator('#products').innerText()});
 if(await page.locator('#products button').count()) {await page.locator('#products button').first().click();transcript.steps.push({action:'Select exact linked product',result:await page.locator('#label').innerText()});}
 // Independently verify the approved known positive with current live response records.
 transcript.positive=await page.evaluate(async()=>{
  const {getUnii}=await import('./js/pubchem.js');const {requestJSON}=await import('./js/http.js');const {linkProducts}=await import('./js/identity.js');
  const evidence=await getUnii(2244);
  const nurl='https://api.fda.gov/drug/ndc.json?search=product_ndc:%2259726-065%22&limit=1';
  const lurl='https://api.fda.gov/drug/label.json?search=openfda.product_ndc:%2259726-065%22&limit=1';
  const ndc=await requestJSON(nurl),label=await requestJSON(lurl);
  return linkProducts(2244,evidence,label.results.map(x=>({...x,_sourceUrl:lurl,_retrievedAt:label._retrievedAt})),ndc.results.map(x=>({...x,_sourceUrl:nurl,_retrievedAt:ndc._retrievedAt})));
 });
 await page.screenshot({path:'docs/evidence/live-app.png',fullPage:true});
}catch(e){transcript.errors.push(e.message);}
await writeFile('docs/evidence/live-app.json',JSON.stringify(transcript,null,2));console.log({steps:transcript.steps.map(x=>({action:x.action,result:x.result.slice(0,250)})),positive:transcript.positive?.products.length,errors:transcript.errors});await browser.close();server.close();
