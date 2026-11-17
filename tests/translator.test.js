import test from 'node:test';
import assert from 'node:assert/strict';
const fresh=()=>import(`../js/translator.js?test=${Math.random()}`);
test('create starts synchronously; same pair shares pending promise; translations are sequential and cached',async()=>{
 const original=globalThis.Translator;let creates=0,release,active=0,max=0,calls=0;
 globalThis.Translator={create:()=>{creates++;return new Promise(r=>release=()=>r({translate:async text=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;return '한국어 '+text;}}));}};
 try{const m=await fresh();const a=m.prepareTranslator('en','ko');assert.equal(creates,1);assert.equal(m.prepareTranslator('en','ko'),a);release();await a;assert.deepEqual(await Promise.all([m.translate('a','en','ko'),m.translate('b','en','ko'),m.translate('a','en','ko')]),['한국어 a','한국어 b','한국어 a']);assert.equal(max,1);assert.equal(calls,2);assert.equal(creates,1);}finally{globalThis.Translator=original;}
});
test('failed model creation is evicted and next gesture retries; failed translation does not poison queue',async()=>{
 const original=globalThis.Translator;let creates=0;
 globalThis.Translator={create:()=>{if(++creates===1)return Promise.reject(new Error('download failed'));return Promise.resolve({translate:async text=>{if(text==='bad')throw new Error('translation failed');return '번역 '+text;}});}};
 try{const m=await fresh();await assert.rejects(m.prepareTranslator('en','ko'),/download failed/);await m.prepareTranslator('en','ko');await assert.rejects(m.translate('bad','en','ko'),/translation failed/);assert.equal(await m.translate('ok','en','ko'),'번역 ok');assert.equal(creates,2);}finally{globalThis.Translator=original;}
});
