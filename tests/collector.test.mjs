import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectMarkets, providers} from '../collector/collect.mjs';
import {catalogFingerprint, validateCatalog} from '../collector/catalog.mjs';
import {InfluenceEngine} from '../public/engine.js';

const catalog = JSON.parse(await readFile(new URL('../config/tokens.json', import.meta.url)));
const raw = JSON.parse(await readFile(new URL('./fixtures/markets.json', import.meta.url)));
const now = Date.parse('2026-11-09T12:00:00Z');
const rows = raw.map(row => ({...row, last_updated: new Date(now - 1000).toISOString()}));
const response = data => async () => ({ok: true, json: async () => structuredClone(data)});
const clone = () => structuredClone(catalog);

test('Collector uses configured provider ids, preserves game ids and ignores response ordering', async () => {
  const config = clone(); config.tokens[0].id = 'new-york-faction';
  config.tokens.reverse();
  let calls = 0;
  const snapshot = await collectMarkets(config, {now, env: {}, fetchImpl: async url => {
    calls++; assert.equal(url.searchParams.get('vs_currency'), 'usd');
    assert(url.searchParams.get('ids').split(',').includes('bitcoin'));
    assert(!url.searchParams.get('ids').includes('new-york-faction'));
    return {ok: true, json: async () => [...rows].reverse()};
  }});
  assert.equal(calls, 1);
  assert.deepEqual(snapshot.coins.map(c => c.id), config.tokens.map(t => t.id));
  assert.equal(snapshot.coins.find(c => c.id === 'new-york-faction').market_cap, rows.find(r => r.id === 'bitcoin').market_cap);
  assert.equal(catalogFingerprint(catalog), catalogFingerprint({...catalog, tokens: [...catalog.tokens].reverse()}));
  assert.notEqual(catalogFingerprint(config), catalogFingerprint(catalog));
});

test('Adding or disabling a token requires only catalog changes, including a seventh faction', async () => {
  const config = clone();
  config.tokens.push({...config.tokens[0], id: 'tokyo', name: 'Tokyo', symbol: 'TOK', city: 'Tokyo', lat: 35.6762, lon: 139.6503, source: {provider: 'coingecko', coinId: 'test-tokyo'}});
  const data = [...rows, {...rows[0], id: 'test-tokyo'}];
  const seven = await collectMarkets(config, {now, env: {}, fetchImpl: response(data)});
  assert.equal(seven.coins.length, 7);
  // The existing calculation engine accepts the catalog directly without hardcoded token ids.
  const engine = new InfluenceEngine(new Uint8Array([1]), 1, 1, [{id: 1}], seven.factions);
  assert.equal(engine.solve(seven.coins.map(c => c.market_cap)).actual.length, 7);
  config.tokens[0].enabled = false;
  const six = await collectMarkets(config, {now, env: {}, fetchImpl: response(data)});
  assert.equal(six.coins.length, 6);
  assert(!six.coins.some(c => c.id === config.tokens[0].id));
});

test('Unknown providers, duplicate identities and invalid coordinates fail before fetching', async () => {
  for (const mutate of [
    c => c.tokens[0].source.provider = 'unknown',
    c => c.tokens[1].id = c.tokens[0].id,
    c => c.tokens[1].source.coinId = c.tokens[0].source.coinId,
    c => c.tokens[0].lat = 91,
    c => c.tokens[0].enabled = 'yes',
    c => c.tokens[0].source.apiKey = 'must-not-be-in-config',
    c => c.tokens.forEach(t => t.enabled = false),
  ]) {
    const config = clone(); mutate(config);
    assert.throws(() => validateCatalog(config, providers));
  }
});

test('A second provider adapter works without changing the collector or influence rules', async () => {
  const config = clone(); config.tokens[0].source = {provider: 'fixture', mint: 'fake-test-mint'};
  const adapters = {...providers, fixture: {
    validateSource(s) { assert.equal(s.mint, 'fake-test-mint'); },
    sourceKey: s => s.mint,
    async fetch(tokens) { return tokens.map(t => ({...rows[0], id: t.id, source: t.source})); },
  }};
  const snapshot = await collectMarkets(config, {now, adapters, env: {}, fetchImpl: response(rows)});
  assert.equal(snapshot.coins[0].source.provider, 'fixture');
  assert.equal(snapshot.coins.length, 6);
});

test('Missing data, zero/null caps, duplicate records and stale or regressed prices are rejected', async () => {
  const collect = data => collectMarkets(catalog, {now, env: {}, fetchImpl: response(data)});
  await assert.rejects(collect(rows.slice(1)), /Missing/);
  await assert.rejects(collect([...rows, rows[0]]), /duplicate/);
  for (const patch of [
    {market_cap: 0}, {market_cap: null, fully_diluted_valuation: 1e12}, {current_price: -1},
    {last_updated: new Date(now - 901000).toISOString()}, {last_updated: new Date(now + 61000).toISOString()},
  ]) await assert.rejects(collect([{...rows[0], ...patch}, ...rows.slice(1)]));
  const previous = await collect(rows);
  const older = rows.map((row, i) => i === 0 ? {...row, last_updated: new Date(now - 2000).toISOString()} : row);
  await assert.rejects(collectMarkets(catalog, {now, previous, env: {}, fetchImpl: response(older)}), /regressed/);
  await assert.rejects(collectMarkets(catalog, {now, env: {}, fetchImpl: async () => ({ok: false, status: 429})}), /429/);
});

test('API keys travel only in request headers; missing optional indicators stay null', async () => {
  const data = rows.map(row => ({...row, total_volume: null, price_change_percentage_24h: null}));
  const snapshot = await collectMarkets(catalog, {now, env: {COINGECKO_DEMO_API_KEY: 'fixture-key'}, fetchImpl: async (url, options) => {
    assert.equal(options.headers['x-cg-demo-api-key'], 'fixture-key');
    assert(!url.href.includes('fixture-key'));
    return {ok: true, json: async () => data};
  }});
  assert(!JSON.stringify(snapshot).includes('fixture-key'));
  assert.equal(snapshot.coins[0].total_volume, null);
});
