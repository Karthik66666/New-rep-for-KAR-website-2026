import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tamil = JSON.parse(await readFile(new URL('../dist/locales/ta.json',import.meta.url),'utf8'));
test('Tamil catalogue remains readable Unicode after editing on Windows',() => {
  for (const [key,value] of Object.entries(tamil)) {
    assert.equal(typeof value,'string',key);
    assert.ok(value.trim(),key);
    assert.ok(!value.includes('??'),`Damaged translation for ${key}`);
    assert.ok(!value.includes('\uFFFD'),`Replacement characters in ${key}`);
  }
});
test('public enquiry and recruitment labels have exact Tamil catalogue keys',() => {
  for (const key of ['Let’s start your project','Let’s start','your project.','Country code','Phone number','I’m not a robot','Address','Degree / highest qualification','Experience level','Latest company name','Notice period','Submit application','Your application is saved.','Sending your enquiry…','Sending your application…','This role is no longer available.']) {
    assert.ok(Object.hasOwn(tamil,key),`Missing exact translation key: ${key}`);
    assert.match(tamil[key],/\p{Script=Tamil}/u,`Tamil copy missing for ${key}`);
  }
});
