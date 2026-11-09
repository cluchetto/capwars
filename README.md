# CapWars

**Live site: https://capwars.pages.dev**

**Markets move. Empires rise.** A public, automatic world-conquest prototype driven by cryptocurrency market capitalizations. English by default, French available in the globe.

## What runs here

- A configurable CoinGecko collector, with an adapter boundary for future providers.
- A deterministic geographical calculation: square root of USD market cap divided by squared great-circle distance from the capital.
- Strictly more than 50% of a country's estimated surface is required for a new owner. Without a new majority, the incumbent keeps the country.
- One shared state and an immutable observation journal, committed to Git. The public browser only displays that state.
- A scheduled GitHub Actions job every five minutes, a manual trigger, and an initial run on code/configuration changes.

**Financial scope:** fee collection is not connected. Reserves start at zero; market trading volume is never counted as collected fees. Captures record a budget of zero until an actual fee-accounting integration is added. No wallet keys, admin interface, transaction signing, buybacks or burns are included. The target game fee split remains 25% project / 75% reserves on 2% net game fees; this repository neither creates tokens nor enforces those fees on-chain.

## Configure tokens

Edit `config/tokens.json`, then run `npm run tokens:check` and `npm test` before pushing. Up to 16 active factions are supported by the public globe. Each token has:

```json
{
  "id": "bitcoin",
  "name": "Bitcoin",
  "symbol": "BTC",
  "enabled": true,
  "city": "New York",
  "lat": 40.7128,
  "lon": -74.006,
  "color": "#f0b45a",
  "glyph": "₿",
  "source": {"provider": "coingecko", "coinId": "bitcoin"}
}
```

`id` identifies the faction permanently; `source.coinId` identifies the asset at CoinGecko. Do not reuse a faction id for a different token. Provider changes for the same underlying asset can retain the id. Do not identify tokens by symbol alone. `enabled: false` removes a faction from the next active board.

Adding/removing a faction or moving a capital creates a **catalog-reconfigured** observation: ownership is reinitialized without invented conquests. Earlier journal entries remain available with their original catalog. Such changes are blocked once any country reserve or committed buyback budget is nonzero, pending an explicit migration. Reordering the catalog does not change identities or tie breaking (stable ids are sorted).

Only CoinGecko is implemented. To support a different provider, register an adapter in `collector/collect.mjs` implementing `validateSource`, `sourceKey` and `fetch`; return the same normalized USD fields. A Solana mint or pool feed will require its own verified adapter, including a precise definition of circulating market cap. Fully diluted valuation must not silently replace market cap.

## Run locally

Node.js 24+, no third-party runtime dependencies or installation required:

```sh
npm run tokens:check
npm test
npm run update
npm run build
npm run dev
```

Preview: http://127.0.0.1:4174/. The browser reads the authoritative snapshot from the public GitHub raw URL in `public/settings.js`, even in local preview. The original private administration remains on its separate local server.

For offline UI verification after a local collection, use `CAPWARS_PREVIEW_LOCAL=1 npm run dev`. Only this development server then serves the local `state/current.json`; the packaged public site always uses the configured public URL.

## GitHub Actions

`Update world` runs at minutes 2, 7, 12, …, 57 UTC, away from the top of the hour, and can be started with **Actions → Update world → Run workflow**. GitHub can delay or skip scheduled executions; five minutes is a requested interval, not a guarantee. Scheduled workflows in public repos may be disabled after 60 days without repository activity.

If the unauthenticated CoinGecko endpoint is rate limited, add `COINGECKO_DEMO_API_KEY` in **Settings → Secrets and variables → Actions**. Alternatively use `COINGECKO_PRO_API_KEY` for a paid Pro account. No keys belong in JSON files. The automatic `GITHUB_TOKEN` gets `contents: write` only in the update job; pull-request checks are read-only. Branch protection must permit the bot to push state commits, otherwise publication fails visibly.

All writers share one concurrency group. Each run checks out the latest `main`, validates and tests, then fetches prices. Incomplete, invalid, regressed or older-than-15-minute market data aborts the entire update. No zero-price fallback. Identical observations produce no additional capture or commit. A non-fast-forward push fails rather than overwriting a concurrent human change; a later run recalculates from the committed state. No force pushes.

State is published in the same atomic Git commit:

- `state/current.json`: countries keyed by country code, owners by stable faction id, reserves, recent captures, pending budgets and timestamps.
- `state/history/00000001.json`, etc.: complete immutable observations, original catalogs, captures and a chain of record hashes.

The browser checks for updates every minute and labels market data older than 15 minutes. A failed refresh keeps the last displayed state. Events between two observations are not reconstructed. Initial ownership is not a conquest. The hash chain detects accidental inconsistencies; it is not an independently trusted blockchain proof, and repository writers can edit history.

The collector has an exclusive local lock. If a machine is interrupted, inspect `.collector-lock` and any history record newer than `state/current.json` before recovery; do not silently delete conflicting records. A fresh GitHub runner always starts from the last committed state. There is no scheduled re-execution inside a single process.

## Hosting and scope

`npm run build` creates a static `dist/` directory suitable for a separate static host. The public globe is hosted with Cloudflare Pages (Direct Upload) at https://capwars.pages.dev. Market observations continue to come from GitHub automatically. Changes to the website code require rebuilding and republishing the static site; they are not deployed by the market-data workflow. GitHub raw data may be cached and is suitable for this prototype, not a low-latency production API. Raw URLs are fixed in `public/settings.js`.

The immutable full snapshots and frequent commits grow over time. Before a large or financially funded deployment, move the journal to durable database/object storage, provide backups and reconcile real on-chain fee receipts. Keep stable ids and migrate the existing journal; don't reinterpret earlier capture indexes.

## Geography and data

Natural Earth 1:110m, public domain (https://www.naturalearthdata.com/about/terms-of-use/), excludes Antarctica. Country coverage and small islands are approximate. The accounting grid is 720×360 with spherical surface weighting; the display uses a 2880×1440 land grid with continuous influence shading. Country labels and borders are a cartographic dataset, not a political endorsement.

Market API: https://docs.coingecko.com/reference/coins-markets. Values are timestamped observations; provider availability and API quotas apply independently of GitHub Actions.

GitHub schedule documentation: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule.

## Registering real country tokens

Country names, symbols, descriptions, images and mainnet mint addresses are supported on the public globe. Until actual tokens exist, the six demo assets remain unchanged. Register the complete set together to replace the demo board; an identity change resets country assignment without generating captures. Existing funded reserves require a separate migration.

Run `node scripts/register-factions.mjs /absolute/path/mainnet-factions.json` from this repository. The input is `{ "schemaVersion": 1, "network": "mainnet-beta", "simulationOnly": false, "factions": [...] }`. Each faction contains `city` (local city index 0–5), `name`, `symbol`, `description`, `mint`, and optional `image` (the corresponding `/faction-art/<city>.svg` or uploaded PNG/JPEG/WebP data URL). This command verifies that each mint is an initialized SPL mint on finalized mainnet before changing files. It does not verify ownership, pool fees, or launch safety. Private console fields are never copied.

Publish the resulting `config/tokens.json` and any new `public/faction-art/` files to GitHub. GitHub Actions then collects by Solana mint through DEX Screener; no CoinGecko listing is required. The public page reads the catalog and shows the new profiles immediately after GitHub cache refresh, with a pending-market state until a complete observation exists. It never assigns the demo assets’ market caps to the new tokens. DEX Screener indexing is not instantaneous; missing market caps block the observation (FDV is not substituted). Its API lacks a price timestamp, so recorded time for this provider is retrieval time, not guaranteed trade freshness.

The local launch runner is still a simulation. Connecting the real signing path to this registration/publication step remains required before launch-to-publication can be automatic. Do not register sandbox launches as mainnet tokens.
