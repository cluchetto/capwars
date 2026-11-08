import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {collectMarkets, providers} from '../collector/collect.mjs';
import {validateCatalog} from '../collector/catalog.mjs';
import {evolve, hash} from '../lib/game.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function optionalJSON(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function atomic(path, contents) {
  await mkdir(dirname(path), {recursive: true});
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, contents, {flag: 'wx'}); await rename(temp, path); }
  finally { await rm(temp, {force: true}); }
}

export async function update({directory = root, check = false, ...options} = {}) {
  const catalog = JSON.parse(await readFile(resolve(directory, 'config/tokens.json'), 'utf8'));
  const active = validateCatalog(catalog, options.adapters ?? providers);
  if (active.length > 16) throw Error('Public globe limit: 16 active factions');
  if (check) return {checked: true, activeTokens: active.length};
  // One writer per checkout. GitHub's workflow concurrency additionally serializes remote runs.
  const lock = resolve(directory, '.collector-lock');
  await mkdir(lock);
  try {
    const statePath = resolve(directory, 'state/current.json');
    const previous = await optionalJSON(statePath);
    const snapshot = await collectMarkets(catalog, {...options, previous});
    const geo = JSON.parse(await readFile(resolve(directory, 'public/data/countries.json'), 'utf8'));
    const grid = new Uint8Array(await readFile(resolve(directory, 'public/data/land.bin')));
    const {state, record} = evolve(previous, snapshot, geo, grid);
    if (!record) return {changed: false, revision: state.revision};
    // Immutable full observation, including catalog and captures; state points to this exact record.
    const recordPath = resolve(directory, `state/history/${String(state.revision).padStart(8, '0')}.json`);
    const existing = await optionalJSON(recordPath);
    if (existing && hash(existing) !== hash(record)) throw Error('Conflicting history record; recover the interrupted run before retrying');
    if (!existing) await atomic(recordPath, JSON.stringify(record) + '\n');
    await atomic(statePath, JSON.stringify(state) + '\n');
    return {changed: true, revision: state.revision, captures: record.events.length};
  } finally { await rm(lock, {recursive: true, force: true}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--check')) throw Error('Usage: node scripts/update.mjs [--check]');
    console.log(JSON.stringify(await update({check: process.argv.includes('--check')})));
  } catch (error) { console.error(`Update failed; no publication: ${error.message}`); process.exitCode = 1; }
}
