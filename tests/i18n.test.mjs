import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {messages} from '../public/locales/messages.js';
import {languages,normalizeLanguage,languageLocale,languageDirection,translateMessage,localizedCity,localizedCountry} from '../public/i18n.js';
test('every supported language covers all public static and dynamic messages',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const code=await readFile(new URL('../public/app.js',import.meta.url),'utf8')+await readFile(new URL('../public/faction-profile.js',import.meta.url),'utf8');
 const keys=new Set([...html.matchAll(/data-en="([^"]+)"/g),...code.matchAll(/\bt\('([^']+)'/g)].map(m=>m[1]));
 for(const [lang] of languages){
  for(const key of keys)assert.ok(messages[lang][key]?.trim(),`${lang}: ${key}`);
  assert.ok(new Intl.NumberFormat(languageLocale(lang)).format(123456));
  assert.ok(new Intl.DateTimeFormat(languageLocale(lang)).format(new Date('2026-11-09')));
 }
});
test('language fallback, RTL and country labels work across scripts',()=>{
 assert.equal(normalizeLanguage('unsupported'),'en');
 assert.equal(translateMessage('unsupported','Countries'),'Countries');
 assert.equal(translateMessage('ar','missing'),'missing');
 assert.equal(languageDirection('ar'),'rtl');assert.equal(languageDirection('he'),'rtl');assert.equal(languageDirection('zh'),'ltr');
 assert.equal(localizedCity('Pékin','zh'),'北京');
 assert.equal(localizedCountry({code:'FRA',name:'France'},'ja'),'フランス');
 assert.equal(localizedCountry({code:'ZZZ',name:'Unknown'},'de'),'Unknown');
});
