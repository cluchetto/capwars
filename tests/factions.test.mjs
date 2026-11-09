import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationCatalog} from '../scripts/register-factions.mjs';
import {collectMarkets} from '../collector/collect.mjs';
import {factionProfile,imageURL} from '../public/faction-profile.js';
const mint='72mKYVkGn4wYNnNJpCjp4hKfdfe9hrQvjQGjpsS2hR5a'; // Fixture only; no real token is published.
const input={schemaVersion:1,network:'mainnet-beta',simulationOnly:false,factions:[{city:1,mint,name:'CapWars France',symbol:'CWFR',description:'Raise your flag. https://capwars.pages.dev/',image:'/faction-art/paris.svg',privateKey:'must-not-publish'}]};
const goodAccount={result:{value:{owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',data:{parsed:{type:'mint',info:{isInitialized:true,supply:'1000000000000000'}}}}}};
const response=data=>async()=>({ok:true,json:async()=>structuredClone(data)});
test('Registration requires real mainnet mint, excludes local fields and replaces demo catalog',async()=>{
 const {catalog}=await registrationCatalog(input,{fetchImpl:response(goodAccount)});
 assert.equal(catalog.tokens.length,1);assert.equal(catalog.tokens[0].country,'France');assert.equal(catalog.tokens[0].source.mint,mint);assert(!JSON.stringify(catalog).includes('must-not-publish'));
 await assert.rejects(registrationCatalog({...input,simulationOnly:true},{fetchImpl:response(goodAccount)}),/simulation/);
 await assert.rejects(registrationCatalog(input,{fetchImpl:response({result:{value:null}})}),/mint not found/);
 await assert.rejects(registrationCatalog({...input,factions:[...input.factions,...input.factions]},{fetchImpl:response(goodAccount)}),/duplicate/);
});
test('Mint based markets preserve country profiles and reject missing caps or FDV-only estimates',async()=>{
 const {catalog}=await registrationCatalog(input,{fetchImpl:response(goodAccount)});
 const now=Date.now();const pair={chainId:'solana',pairAddress:'pair',baseToken:{address:mint},priceUsd:'0.001',marketCap:1e6,liquidity:{usd:1000},volume:{h24:12},priceChange:{h24:3}};
 const collect=rows=>collectMarkets(catalog,{now,fetchImpl:response(rows)});
 const s=await collect([{...pair,chainId:'ethereum',marketCap:1e12},pair]);
 assert.equal(s.coins[0].market_cap,1e6);assert.equal(s.factions[0].image,'/faction-art/paris.svg');assert.equal(s.factions[0].symbol,'CWFR');
 await assert.rejects(collect([{...pair,marketCap:null,fdv:1e9}]),/No indexed/);
 await assert.rejects(collect([{...pair,baseToken:{address:'wrong'}}]),/No indexed/);
});
test('Public profiles escape content and reject executable image URLs',()=>{
 assert.equal(imageURL('javascript:alert(1)'),null);assert.equal(imageURL('data:image/svg+xml,unsafe'),null);
 const html=factionProfile({name:'France',description:'<script>alert(1)</script>',image:'/faction-art/paris.svg',mint,website:'https://capwars.pages.dev/'},en=>en);
 assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('https://solscan.io/token/'));assert(html.includes('paris.svg'));
});
