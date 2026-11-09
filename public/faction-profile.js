export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function imageURL(value){
 if(typeof value!=='string')return null;
 if(/^\/faction-art\/[a-z0-9-]+\.svg$/.test(value))return value;
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
 return null;
}
export function factionIcon(f){const url=imageURL(f.image);return url?`<img class="faction-image" src="${escape(url)}" alt="${escape(f.name)}" loading="lazy" referrerpolicy="no-referrer">`:`<span class="token-icon">${escape(f.glyph)}</span>`;}
export function factionProfile(f,t){
 const mint=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(f.mint??'')?f.mint:null;
 return `${f.image&&imageURL(f.image)?`<img class="faction-portrait" src="${escape(imageURL(f.image))}" alt="${escape(f.name)}" referrerpolicy="no-referrer">`:''}${f.description?`<p class="faction-description">${escape(f.description)}</p>`:''}${mint?`<div class="faction-contract"><small>SOLANA · MAINNET</small><code>${escape(mint)}</code><a href="https://solscan.io/token/${mint}" target="_blank" rel="noopener noreferrer">${t('View token','Voir le token')} ↗</a></div>`:''}${f.website==='https://capwars.pages.dev/'?'<a class="faction-website" href="https://capwars.pages.dev/">capwars.pages.dev ↗</a>':''}`;
}
