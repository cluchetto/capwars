import {createHash} from 'node:crypto';
import {InfluenceEngine} from '../public/engine.js';

export const MODEL = 'sqrt-cap-over-distance-squared-v1';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const geometry = factions => sorted(factions).map(({id, lat, lon}) => ({id, lat, lon}));

export function evolve(previous, snapshot, geo, grid) {
  if (previous && (previous.schemaVersion !== 1 || previous.model !== MODEL)) throw Error('Explicit state migration required');
  const factions = sorted(snapshot.factions), coins = sorted(snapshot.coins);
  if (!factions.length || factions.length > 16) throw Error('The public globe supports 1–16 active factions');
  if (factions.length !== coins.length || factions.some((f, i) => f.id !== coins[i].id)) throw Error('Market/faction identity mismatch');
  const geographyHash = hash({width: geo.width, height: geo.height, countries: geo.countries, gridHash: createHash('sha256').update(grid).digest('hex')});
  if (previous && previous.geographyHash !== geographyHash) throw Error('Geography migration required');
  const inputHash = hash({catalog: snapshot.catalogFingerprint, coins, model: MODEL, geographyHash});
  if (previous?.inputHash === inputHash) return {state: previous, record: null};
  if (previous && Date.parse(snapshot.fetched_at) < Date.parse(previous.updatedAt)) throw Error('Snapshot time regressed');
  const reconfigured = previous && hash(geometry(previous.factions)) !== hash(geometry(factions));
  // Changing the game board must not trigger economic captures or move existing funds.
  if (reconfigured && (Object.values(previous.countries).some(c => c.reserveLamports !== 0) || previous.buybackPlans.some(p => p.budgetLamports !== 0))) throw Error('Funded game requires an explicit catalog migration');
  const engine = new InfluenceEngine(grid, geo.width, geo.height, geo.countries, factions);
  const result = engine.solve(coins.map(c => c.market_cap));
  const revision = (previous?.revision ?? 0) + 1;
  const countries = {}, events = [], plans = [...(previous?.buybackPlans ?? [])];
  for (const country of geo.countries) {
    const shares = result.countryShares[country.id];
    const majority = shares.findIndex(share => share > .5);
    const old = previous?.countries[country.code];
    const incumbent = reconfigured ? null : old?.ownerId ?? null;
    const ownerId = majority >= 0 ? factions[majority].id : incumbent;
    const reserveLamports = old?.reserveLamports ?? 0;
    if (!Number.isSafeInteger(reserveLamports) || reserveLamports < 0) throw Error('Invalid reserve balance');
    const captured = Boolean(previous && !reconfigured && incumbent && ownerId && incumbent !== ownerId);
    countries[country.code] = {id: country.id, code: country.code, name: country.name, name_en: country.name_en,
      area: country.area, sampled: country.sampled, ownerId, reserveLamports: captured ? 0 : reserveLamports,
      shares: Object.fromEntries(factions.map((f, i) => [f.id, shares[i]]))};
    if (captured) {
      const id = hash({previous: previous.inputHash, inputHash, country: country.code});
      events.push({id, type: 'capture', country: country.code, previousOwnerId: incumbent, newOwnerId: ownerId,
        budgetLamports: reserveLamports, observedAt: snapshot.fetched_at, marketAt: coins.reduce((a, c) => a < c.last_updated ? a : c.last_updated, coins[0].last_updated)});
      if (reserveLamports > 0) plans.push({captureId: id, factionId: ownerId, budgetLamports: reserveLamports, status: 'pending-local-approval'});
    }
  }
  const record = {schemaVersion: 1, revision, type: previous ? reconfigured ? 'catalog-reconfigured' : 'market-observation' : 'initialization',
    inputHash, previousRecordHash: previous?.recordHash ?? null, observedAt: snapshot.fetched_at, snapshot, events};
  record.recordHash = hash(record);
  const state = {schemaVersion: 1, model: MODEL, geographyHash, revision, inputHash, recordHash: record.recordHash,
    updatedAt: snapshot.fetched_at, marketAt: coins.reduce((a, c) => a < c.last_updated ? a : c.last_updated, coins[0].last_updated),
    catalogFingerprint: snapshot.catalogFingerprint, factions, coins, countries,
    influence: Object.fromEntries(factions.map((f, i) => [f.id, result.actual[i]])),
    recentCaptures: [...events, ...(previous?.recentCaptures ?? [])].slice(0, 100),
    captureCount: (previous?.captureCount ?? 0) + events.length, buybackPlans: plans,
    fees: {status: 'not-connected', currency: 'SOL', targetGameBps: 200, ownerPercent: 25, reservePercent: 75},
  };
  return {state, record};
}
