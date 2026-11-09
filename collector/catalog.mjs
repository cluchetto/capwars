import {createHash} from 'node:crypto';

const identifier = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100;

// The faction id belongs to the game; the provider's id can change independently.
export function validateCatalog(catalog, providers) {
  if (catalog?.schemaVersion !== 1 || catalog.currency !== 'usd') throw Error('Unsupported catalog schema or currency');
  if (!Number.isInteger(catalog.maxAgeSeconds) || catalog.maxAgeSeconds < 1) throw Error('Invalid maximum data age');
  if (!Array.isArray(catalog.tokens) || !catalog.tokens.length) throw Error('Empty token catalog');
  const ids = new Set(), sources = new Set();
  for (const token of catalog.tokens) {
    if (!identifier.test(token.id ?? '') || ids.has(token.id)) throw Error('Invalid or duplicate faction id');
    ids.add(token.id);
    if (typeof token.enabled !== 'boolean' || ![token.name, token.symbol, token.city, token.glyph].every(label)) throw Error(`Invalid faction: ${token.id}`);
    if (!Number.isFinite(token.lat) || Math.abs(token.lat) > 90 || !Number.isFinite(token.lon) || Math.abs(token.lon) > 180 || !/^#[a-f0-9]{6}$/i.test(token.color)) throw Error(`Invalid geography or color: ${token.id}`);
    if(token.description!==undefined&&(typeof token.description!=='string'||token.description.length>1000))throw Error('Invalid description');
    if(token.image!==undefined&&!(typeof token.image==='string'&&(/^https:\/\//.test(token.image)||/^\/faction-art\/[a-z0-9-]+\.svg$/.test(token.image))))throw Error('Invalid public image');
    if(token.website!==undefined&&token.website!=='https://capwars.pages.dev/')throw Error('Invalid faction website');
    if(token.mint!==undefined&&(token.source?.provider!=='dexscreener'||token.mint!==token.source.mint||token.network!=='mainnet-beta'))throw Error('Invalid mainnet identity');
    const provider = token.source && Object.hasOwn(providers, token.source.provider) && providers[token.source.provider];
    if (!provider || typeof provider.fetch !== 'function' || typeof provider.validateSource !== 'function' || typeof provider.sourceKey !== 'function') throw Error(`Unsupported provider for ${token.id}`);
    provider.validateSource(token.source);
    // Each adapter supplies the canonical identity (coin id today, mint/pool later).
    const sourceKey = `${token.source.provider}:${provider.sourceKey(token.source)}`;
    if (token.enabled && sources.has(sourceKey)) throw Error(`Duplicate active market source: ${token.id}`);
    if (token.enabled) sources.add(sourceKey);
  }
  const active = catalog.tokens.filter(token => token.enabled);
  if (!active.length) throw Error('No active tokens');
  return active;
}

export function catalogFingerprint(catalog) {
  // Independent of input order: consumers must match stable ids, never array positions.
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const tokens = [...catalog.tokens].sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(canonical({...catalog, tokens}))).digest('hex');
}
