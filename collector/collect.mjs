import {validateCatalog, catalogFingerprint} from './catalog.mjs';
import {coingecko} from './providers/coingecko.mjs';

export const providers = Object.freeze({coingecko});

export async function collectMarkets(catalog, {
  adapters = providers, fetchImpl = globalThis.fetch, env = process.env,
  now = Date.now(), previous = null, timeoutMs = 30000,
} = {}) {
  const active = validateCatalog(catalog, adapters);
  const groups = new Map();
  for (const token of active) {
    const group = groups.get(token.source.provider) ?? [];
    group.push(token); groups.set(token.source.provider, group);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let records;
  try {
    records = (await Promise.all([...groups].map(([name, tokens]) => adapters[name].fetch(tokens, {
      fetchImpl, env, signal: controller.signal,
    })))).flat();
  } finally { clearTimeout(timer); controller.abort(); }
  if (records.length !== active.length) throw Error('Incomplete market snapshot');
  const coins = active.map(token => {
    const matches = records.filter(row => row?.id === token.id);
    if (matches.length !== 1) throw Error(`Missing or duplicate faction record: ${token.id}`);
    const row = matches[0], at = Date.parse(row.last_updated);
    const adapter = adapters[token.source.provider];
    if (!row.source || row.source.provider !== token.source.provider || adapter.sourceKey(row.source) !== adapter.sourceKey(token.source)) throw Error(`Market source mismatch: ${token.id}`);
    if (!Number.isFinite(row.market_cap) || row.market_cap <= 0 || !Number.isFinite(row.current_price) || row.current_price <= 0) throw Error(`Invalid market cap or price: ${token.id}`);
    if (!Number.isFinite(at) || now - at > catalog.maxAgeSeconds * 1000 || at > now + 60000) throw Error(`Stale or invalid market timestamp: ${token.id}`);
    if (row.total_volume !== null && (!Number.isFinite(row.total_volume) || row.total_volume < 0)) throw Error(`Invalid volume: ${token.id}`);
    if (row.price_change_percentage_24h !== null && !Number.isFinite(row.price_change_percentage_24h)) throw Error(`Invalid daily change: ${token.id}`);
    const old = previous?.coins?.find(coin => coin.id === token.id);
    if (old?.source?.provider === token.source.provider && adapter.sourceKey(old.source) === adapter.sourceKey(token.source) && Date.parse(old.last_updated) > at) throw Error(`Market data regressed: ${token.id}`);
    // Whitelist public output fields: an adapter cannot accidentally publish credentials.
    return {id: token.id, symbol: token.symbol, name: token.name, source: {...token.source},
      current_price: row.current_price, market_cap: row.market_cap, total_volume: row.total_volume,
      price_change_percentage_24h: row.price_change_percentage_24h, last_updated: new Date(at).toISOString()};
  });
  return {schemaVersion: 1, currency: catalog.currency, fetched_at: new Date(now).toISOString(),
    catalogFingerprint: catalogFingerprint(catalog), factions: active.map(token => ({...token})), coins};
}
