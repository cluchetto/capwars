// Official API: https://docs.coingecko.com/reference/coins-markets
export const coingecko = {
  validateSource(source) {
    if (Object.keys(source).some(key => !['provider', 'coinId'].includes(key))) throw Error('Unknown CoinGecko source field; keep API keys in environment variables');
    if (typeof source.coinId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,199}$/.test(source.coinId)) throw Error('Invalid CoinGecko id');
  },
  sourceKey: source => source.coinId,
  async fetch(tokens, {fetchImpl, signal, env}) {
    const proKey = env.COINGECKO_PRO_API_KEY;
    const demoKey = env.COINGECKO_DEMO_API_KEY;
    const origin = proKey ? 'https://pro-api.coingecko.com' : 'https://api.coingecko.com';
    const headers = proKey ? {'x-cg-pro-api-key': proKey} : demoKey ? {'x-cg-demo-api-key': demoKey} : {};
    const output = [];
    for (let start = 0; start < tokens.length; start += 250) {
      const batch = tokens.slice(start, start + 250);
      const url = new URL('/api/v3/coins/markets', origin);
      url.search = new URLSearchParams({vs_currency: 'usd', ids: batch.map(t => t.source.coinId).join(','), per_page: '250', page: '1', sparkline: 'false', price_change_percentage: '24h'}).toString();
      const response = await fetchImpl(url, {headers, signal, cache: 'no-store'});
      if (!response.ok) throw Error(`CoinGecko HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw Error('Invalid CoinGecko response');
      for (const token of batch) {
        const matches = rows.filter(row => row?.id === token.source.coinId);
        if (matches.length !== 1) throw Error(`Missing or duplicate CoinGecko record: ${token.id}`);
        const row = matches[0];
        output.push({id: token.id, symbol: token.symbol, name: token.name, source: {...token.source},
          current_price: row.current_price, market_cap: row.market_cap,
          total_volume: row.total_volume ?? null, price_change_percentage_24h: row.price_change_percentage_24h ?? null,
          last_updated: row.last_updated});
      }
    }
    return output;
  },
};
