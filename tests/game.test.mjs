import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evolve, hash} from '../lib/game.mjs';
import {InfluenceEngine, influenceWeights} from '../public/engine.js';
import {catalogFingerprint} from '../collector/catalog.mjs';

const catalog=JSON.parse(await readFile(new URL('../config/tokens.json',import.meta.url)));
const geo={width:4,height:1,countries:[{id:1,code:'AAA',name:'West',name_en:'West',area:1,sampled:true},{id:2,code:'BBB',name:'East',name_en:'East',area:1,sampled:true}]};
const grid=new Uint8Array([1,1,2,2]);
function snapshot(caps=[100,100],time='2026-11-09T12:00:00Z'){
  const factions=catalog.tokens.slice(0,2).map((f,i)=>({...f,lat:0,lon:i?60:-60}));
  return {schemaVersion:1,currency:'usd',fetched_at:time,catalogFingerprint:catalogFingerprint({...catalog,tokens:factions}),factions,
    coins:factions.map((f,i)=>({id:f.id,symbol:f.symbol,name:f.name,source:f.source,current_price:1,market_cap:caps[i],total_volume:null,price_change_percentage_24h:null,last_updated:time}))};
}
test('First observation is initialization; captures have stable ids and repeated inputs are idempotent',()=>{
  const first=evolve(null,snapshot(),geo,grid);
  assert.equal(first.record.type,'initialization');assert.equal(first.record.events.length,0);
  assert.equal(first.state.countries.AAA.ownerId,'bitcoin');assert.equal(first.state.countries.BBB.ownerId,'ethereum');
  const boosted=snapshot([1e8,100],'2026-11-09T12:05:00Z');
  const second=evolve(first.state,boosted,geo,grid);
  assert.equal(second.record.events.length,1);assert.equal(second.record.events[0].country,'BBB');
  assert.equal(second.record.events[0].previousOwnerId,'ethereum');assert.equal(second.record.events[0].newOwnerId,'bitcoin');
  assert.equal(second.record.events[0].budgetLamports,0);assert.equal(second.state.buybackPlans.length,0);
  assert.equal(second.record.previousRecordHash,first.record.recordHash);
  const {recordHash,...body}=second.record;assert.equal(hash(body),recordHash);
  assert.deepEqual(evolve(first.state,boosted,geo,grid),second);
  assert.equal(evolve(second.state,{...boosted,fetched_at:'2026-11-09T12:06:00Z'},geo,grid).record,null);
});
test('Country reserve is committed once, remains attached to the original capture, and never inferred from volume',()=>{
  const first=evolve(null,snapshot(),geo,grid).state;first.countries.BBB.reserveLamports=75000000000;
  const second=evolve(first,snapshot([1e8,100],'2026-11-09T12:05:00Z'),geo,grid).state;
  assert.equal(second.countries.BBB.reserveLamports,0);assert.equal(second.buybackPlans.length,1);assert.equal(second.buybackPlans[0].budgetLamports,75000000000);
  const third=evolve(second,snapshot([100,100],'2026-11-09T12:10:00Z'),geo,grid).state;
  assert.equal(third.buybackPlans.length,1);assert.equal(third.buybackPlans[0].factionId,'bitcoin');
  assert.equal(third.recentCaptures[0].budgetLamports,0);
});
test('Catalog additions/removals/capital moves reinitialize ownership without captures; funded changes are blocked',()=>{
  const first=evolve(null,snapshot(),geo,grid).state;
  const moved=snapshot([100,100],'2026-11-09T12:05:00Z');moved.factions[0].lon=90;moved.catalogFingerprint='different';
  const next=evolve(first,moved,geo,grid);
  assert.equal(next.record.type,'catalog-reconfigured');assert.equal(next.record.events.length,0);
  first.countries.AAA.reserveLamports=1;
  assert.throws(()=>evolve(first,moved,geo,grid),/migration/);
});
test('Reordering token definitions never reassigns country owners; geometry and time changes are checked',()=>{
  const input=snapshot(), first=evolve(null,input,geo,grid).state;
  const reordered={...input,factions:[...input.factions].reverse(),coins:[...input.coins].reverse()};
  assert.equal(evolve(first,reordered,geo,grid).record,null);
  assert.throws(()=>evolve(first,snapshot([101,100],'2026-11-09T11:00:00Z'),geo,grid),/regressed/);
  assert.throws(()=>evolve(first,input,geo,new Uint8Array([1,2,1,2])),/migration/);
});
test('Strict majority retains the incumbent at exactly 50%; squared distance differs from linear distance',()=>{
  const first=evolve(null,snapshot(),geo,grid).state;
  const tieGeo={...geo,countries:[{...geo.countries[0]}]};
  const tieGrid=new Uint8Array([1,1,1,1]);
  const tie=evolve(null,snapshot(),tieGeo,tieGrid).state;
  assert.equal(tie.countries.AAA.ownerId,null);
  tie.countries.AAA.ownerId='ethereum';
  const next=evolve(tie,snapshot([100,100],'2026-11-09T12:05:00Z'),tieGeo,tieGrid);
  assert.equal(next.state.countries.AAA.ownerId,'ethereum');assert.equal(next.record.events.length,0);
  const simple=new InfluenceEngine(new Uint8Array([1]),1,1,[{id:1}],[{lat:0,lon:-20},{lat:0,lon:10}]);
  assert.equal(simple.solve([9,1]).pixels[0],2);assert.equal(simple.solve([25,1]).pixels[0],1);
  assert.throws(()=>influenceWeights([0,10]));
});
