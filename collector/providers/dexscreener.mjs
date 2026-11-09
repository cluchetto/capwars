const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const dexscreener={
 validateSource(s){if(s.provider!=='dexscreener'||!address.test(s.mint??'')||Object.keys(s).some(k=>!['provider','mint'].includes(k)))throw Error('Invalid Solana market source');},
 sourceKey:s=>s.mint,
 async fetch(tokens,{fetchImpl,signal,now=Date.now()}){
  const response=await fetchImpl(new URL(`https://api.dexscreener.com/tokens/v1/solana/${tokens.map(t=>t.source.mint).join(',')}`),{signal,headers:{accept:'application/json'}});
  if(!response.ok)throw Error(`DEX Screener HTTP ${response.status}`);
  const pairs=await response.json();if(!Array.isArray(pairs))throw Error('Invalid DEX Screener response');
  return tokens.map(t=>{
   // Match the mint, never the symbol. Use the most liquid priced pair, with a
   // deterministic tie break. A new mint may not be indexed immediately.
   const choices=pairs.filter(p=>p.chainId==='solana'&&p.baseToken?.address===t.source.mint&&Number(p.priceUsd)>0&&Number.isFinite(p.marketCap)&&p.marketCap>0&&Number.isFinite(p.liquidity?.usd)&&p.liquidity.usd>0);
   choices.sort((a,b)=>b.liquidity.usd-a.liquidity.usd||String(a.pairAddress).localeCompare(String(b.pairAddress)));
   const p=choices[0];if(!p)throw Error(`No indexed price and market cap for ${t.id}`);
   // The API has no price-update timestamp. This is a retrieval timestamp;
   // pairCreatedAt is NOT price freshness and FDV is NOT market cap.
   return {id:t.id,source:t.source,current_price:Number(p.priceUsd),market_cap:p.marketCap,total_volume:p.volume?.h24??null,price_change_percentage_24h:p.priceChange?.h24??null,last_updated:new Date(now).toISOString()};
  });
 }
};
