import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contractTests} from './tests.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/labels.json',import.meta.url)));
for(const result of contractTests(fixture))test(result.name,()=>assert.equal(result.passed,true,result.error));
