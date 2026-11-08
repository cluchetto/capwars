import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,readdir,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {update} from '../scripts/update.mjs';

const root=new URL('../',import.meta.url);
const now=Date.parse('2026-11-09T12:00:00Z');
const rows=JSON.parse(await readFile(new URL('./fixtures/markets.json',import.meta.url))).map(r=>({...r,last_updated:new Date(now-1000).toISOString()}));
const fetchImpl=async()=>({ok:true,json:async()=>structuredClone(rows)});
test('Durable state, retry idempotency, incomplete data and concurrent writers',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'capwars-update-'));
  try{
    await cp(new URL('config/',root),join(directory,'config'),{recursive:true});
    await cp(new URL('public/data/',root),join(directory,'public/data'),{recursive:true});
    assert.equal((await update({directory,check:true})).activeTokens,6);
    assert.equal((await update({directory,now,env:{},fetchImpl})).revision,1);
    const before=await readFile(join(directory,'state/current.json'),'utf8');
    assert.equal((await update({directory,now,env:{},fetchImpl})).changed,false);
    assert.equal((await readdir(join(directory,'state/history'))).length,1);
    await assert.rejects(update({directory,now,env:{},fetchImpl:async()=>({ok:true,json:async()=>rows.slice(1)})}));
    assert.equal(await readFile(join(directory,'state/current.json'),'utf8'),before);
    await mkdir(join(directory,'.collector-lock'));
    await assert.rejects(update({directory,now,env:{},fetchImpl}),{code:'EEXIST'});
    assert.equal(await readFile(join(directory,'state/current.json'),'utf8'),before);
    await rm(join(directory,'.collector-lock'),{recursive:true});
    await assert.rejects(update({directory,now,env:{},timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Timed out')),{once:true}))}),/Timed out/);
    assert.equal(await readFile(join(directory,'state/current.json'),'utf8'),before);
  }finally{await rm(directory,{recursive:true,force:true});}
});
