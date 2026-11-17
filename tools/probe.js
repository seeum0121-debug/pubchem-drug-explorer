import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {server} from './serve.js';
await new Promise(r=>server.listening?r():server.once('listening',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
await page.goto('http://127.0.0.1:4173');
const report={browser:browser.version(),observedAt:new Date().toISOString(),origin:page.url(),results:[]};
for(const name of ['aspirin','acetaminophen','ibuprofen']) {
 const url=`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${name}/property/Title,MolecularFormula,MolecularWeight/JSON`;
 report.results.push(await page.evaluate(async url=>{try{const r=await fetch(url);return {url,status:r.status,body:await r.json()};}catch(e){return {url,error:e.message};}},url));
 await page.waitForTimeout(1100);
}
for(const url of ['https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/2244/JSON?heading=UNII','https://api.fda.gov/drug/ndc.json?search=product_ndc:%2259726-065%22&limit=1','https://api.fda.gov/drug/label.json?search=openfda.product_ndc:%2259726-065%22&limit=1'])report.results.push(await page.evaluate(async url=>{try{const r=await fetch(url);return {url,status:r.status,body:await r.json()};}catch(e){return {url,error:e.message};}},url));
report.translator=await page.evaluate(async()=>{if(!globalThis.Translator)return {supported:false};try{return {supported:true,koEn:await Translator.availability({sourceLanguage:'ko',targetLanguage:'en'}),enKo:await Translator.availability({sourceLanguage:'en',targetLanguage:'ko'})};}catch(e){return {error:e.message};}});
await mkdir('docs/evidence',{recursive:true});
await writeFile('docs/evidence/api-browser.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:report.results.map(({url,status,error})=>({url,status,error}))},null,2));
await browser.close();server.close();
