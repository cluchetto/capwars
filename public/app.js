import {Globe} from './globe.js';
import {influenceWeights} from './engine.js';
import {factionIcon,factionProfile} from './faction-profile.js';
import {STATE_URL,CATALOG_URL} from './settings.js';
const $ = s => document.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let language = localStorage.getItem('capwars-language') === 'fr' ? 'fr' : 'en';
let pendingFactions=null;
let state, geo, grid, globe, signature, selected, layer = 1, busy = false, failed = false;
const t = (en, fr) => language === 'fr' ? fr : en;
const locale = () => language === 'fr' ? 'fr-FR' : 'en-US';
const number = (n, digits = 2) => Number(n).toLocaleString(locale(), {maximumFractionDigits: digits});
const money = n => Number(n).toLocaleString(locale(), {style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2});
const cityName = f => language==='en' ? ({'Pékin':'Beijing','Le Cap':'Cape Town'}[f.city]||f.city) : f.city;
const name = c => language === 'fr' ? c.name : c.name_en || c.name;
const date = v => new Date(v).toLocaleString(locale(), {dateStyle:'short',timeStyle:'short'});
function translate() {
  document.documentElement.lang = language; $('#language-select').value = language;
  document.querySelectorAll('[data-en]').forEach(el => el.textContent = el.dataset[language]);
  if(pendingFactions){renderPending();return;}
  if (state) {
    if(globe)globe.buttons.forEach((button,i)=>{const f=state.factions[i];button.querySelector('span').firstChild.textContent='★ '+cityName(f);button.setAttribute('aria-label',f.name+', '+t('starting capital','capitale de départ')+' '+cityName(f));});
    render();
  }
}
function choose(id, country = false) {
  selected = {id, country};
  if (country) { const c = geo.countries.find(c => c.code === id); globe.selected = c.id; }
  else { const f = state.factions.find(f => f.id === id); globe.selected = 0; globe.fly(f.lat, f.lon); }
  globe.dirty = true; details();
}
function details() {
  if (!selected) return;
  if (selected.country) {
    const c = state.countries[selected.id], f = state.factions.find(f => f.id === c.ownerId);
    $('#detail-content').innerHTML = `<h2>${escape(name(c))}</h2><p>${f ? escape(f.name) : t('Disputed country','Pays disputé')}</p><div class="reserve-card"><span>${t('COUNTRY RESERVE','RÉSERVE DU PAYS')}</span><strong>${number(c.reserveLamports/1e9)} <small>SOL</small></strong></div>${state.factions.map(f=>`<div class="country-share" style="--faction:${f.color}"><div><span>${escape(f.symbol)}</span><b>${number(c.shares[f.id]*100)} %</b></div><div class="bar-track"><span style="width:${c.shares[f.id]*100}%"></span></div></div>`).join('')}`;
  } else {
    const f = state.factions.find(f => f.id === selected.id), c = state.coins.find(c => c.id === f.id);
    const countries = Object.values(state.countries).filter(c => c.ownerId === f.id);
    $('#detail-content').innerHTML = `<h2>${escape(f.name)}</h2><p>${escape(f.country||cityName(f))} · ${escape(f.symbol)}</p>${factionProfile(f,t)}<div class="detail-metrics"><div><small>${t('Market cap','Capitalisation')}</small><strong>${money(c.market_cap)}</strong></div><div><small>${t('Countries','Pays')}</small><strong>${countries.length}</strong></div><div><small>${t('24 h volume','Volume / 24 h')}</small><strong>${c.total_volume===null?'—':money(c.total_volume)}</strong></div><div><small>${t('Land influence','Influence terrestre')}</small><strong>${number(state.influence[f.id]*100)} %</strong></div></div><div class="reserve-card"><span>${t('AVAILABLE RESERVE','RÉSERVE DISPONIBLE')}</span><strong>${number(countries.reduce((s,c)=>s+c.reserveLamports,0)/1e9)} <small>SOL</small></strong></div><p>${t('Fee collection is not connected.','La collecte des frais n’est pas connectée.')}</p>`;
  }
}
function status() {
  if(pendingFactions)return;
  if (!state) return;
  const stale = Date.now()-Date.parse(state.marketAt)>15*60*1000;
  $('.status-strip').classList.toggle('stale',stale||failed);
  $('#status').textContent = `${failed?t('Refresh unavailable · ','Actualisation indisponible · '):''}${stale?t('Older observation · ','Relevé ancien · '):''}${t('Market','Marché')} : ${date(state.marketAt)} · ${t('Revision','Révision')} ${state.revision}`;
}
function render() {
  const all = Object.values(state.countries);
  $('#total-cap').textContent = money(state.coins.reduce((s,c)=>s+c.market_cap,0));
  $('#token-count').textContent = `${state.factions.length} ${t('assets','actifs')} · USD`;
  $('#country-count').textContent = all.filter(c=>c.ownerId).length;
  $('#capture-count').textContent = state.captureCount; $('#faction-count').textContent = String(state.factions.length).padStart(2,'0');
  $('#faction-list').innerHTML = state.factions.map(f=>{
    const coin=state.coins.find(c=>c.id===f.id),owned=all.filter(c=>c.ownerId===f.id),change=coin.price_change_percentage_24h;
    return `<button class="faction-card" data-id="${escape(f.id)}" style="--faction:${f.color}"><div class="faction-top">${factionIcon(f)}<span class="token-name"><strong>${escape(f.name)}</strong><small>${escape(f.symbol)} · ${escape(f.country||cityName(f))}</small></span><span class="faction-share">${number(state.influence[f.id]*100)}<small>%</small></span></div><div class="faction-bottom"><span>${money(coin.market_cap)}</span><span class="${change>=0?'change-positive':'change-negative'}">${change===null?'—':number(change)+' %'}</span></div><div class="bar-track"><span style="width:${state.influence[f.id]*100}%"></span></div><div class="faction-ledger"><span><small>${t('Countries','Pays')}</small><strong>${owned.length}</strong></span><span><small>${t('Reserve','Réserve')}</small><strong>${number(owned.reduce((s,c)=>s+c.reserveLamports,0)/1e9)} SOL</strong></span></div></button>`;
  }).join('');
  $('#faction-list').querySelectorAll('button').forEach(b=>b.onclick=()=>choose(b.dataset.id));
  $('#capture-history').innerHTML = state.recentCaptures.length ? state.recentCaptures.map(e=>`<div class="history-row"><span>${date(e.observedAt)}</span><strong>${escape(name(state.countries[e.country]))}</strong><span>${escape(e.previousOwnerId)} → ${escape(e.newOwnerId)}</span><span>${number(e.budgetLamports/1e9)} SOL</span></div>`).join('') : `<p class="empty-state">${t('No conquests recorded yet. Initial ownership is not a conquest.','Aucune conquête enregistrée. L’attribution initiale des pays n’est pas une conquête.')}</p>`;
  details(); status();
}
function renderPending(){
 $('#globe').hidden=true;$('#city-labels').hidden=true;$('#globe-loading').hidden=false;
 $('#globe-loading').textContent=t('Waiting for prices for the launched factions.','En attente des prix des factions lancées.');
 $('#status').textContent=t('Tokens registered · first complete market observation pending.','Tokens enregistrés · premier relevé de marché complet en attente.');
 for(const id of ['total-cap','country-count','capture-count'])$('#'+id).textContent='—';
 $('#token-count').textContent=`${pendingFactions.length} ${t('launched tokens','tokens lancés')}`;$('#faction-count').textContent=String(pendingFactions.length).padStart(2,'0');
 $('#capture-history').textContent=t('The map will start with the first complete observation.','La carte démarrera avec le premier relevé complet.');
 $('#faction-list').innerHTML=pendingFactions.map(f=>`<button class="faction-card" data-id="${escape(f.id)}" style="--faction:${f.color}"><div class="faction-top">${factionIcon(f)}<span class="token-name"><strong>${escape(f.name)}</strong><small>${escape(f.symbol)} · ${escape(f.country||f.city)}</small></span></div><p>${t('Awaiting market data','Données de marché en attente')}</p></button>`).join('');
 const show=f=>$('#detail-content').innerHTML=`<h2>${escape(f.name)}</h2>${factionProfile(f,t)}`;
 $('#faction-list').querySelectorAll('button').forEach(b=>b.onclick=()=>show(pendingFactions.find(f=>f.id===b.dataset.id)));show(pendingFactions[0]);
}
async function refresh() {
  if (busy) return; busy=true;$('#refresh').disabled=true;
  try {
    const [response,catalogResponse] = await Promise.all([fetch(STATE_URL,{cache:'no-store',signal:AbortSignal.timeout(15000)}),fetch(CATALOG_URL,{cache:'no-store',signal:AbortSignal.timeout(15000)})]);
    if(!catalogResponse.ok)throw Error('Catalog unavailable');
    const catalog=await catalogResponse.json();
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const next = await response.json();
    if (next.schemaVersion!==1||!Array.isArray(next.factions)||!next.factions.length||next.factions.length>16||!next.countries||!Number.isInteger(next.revision)) throw Error('Invalid state');
    const launched=catalog.tokens?.filter(f=>f.enabled&&f.network==='mainnet-beta'&&f.mint);
    if(launched?.length&&JSON.stringify(launched.map(f=>f.id+':'+f.mint).sort())!==JSON.stringify(next.factions.map(f=>f.id+':'+f.mint).sort())){pendingFactions=launched;renderPending();return;}
    pendingFactions=null;$('#globe').hidden=false;$('#city-labels').hidden=false;
    if (state&&next.revision<state.revision) throw Error('Older state');
    if (!geo) {
      const [a,b] = await Promise.all([fetch('./data/countries.json'),fetch('./data/land-hires.bin')]);
      if(!a.ok||!b.ok)throw Error('Geography unavailable');
      geo=await a.json();grid=new Uint8Array(await b.arrayBuffer());
    }
    const nextSignature=JSON.stringify(next.factions);
    state=next;
    if(signature!==nextSignature){
      if(globe){globe.destroy();$('#globe').replaceWith($('#globe').cloneNode());}
      $('#city-labels').replaceChildren();
      globe=new Globe($('#globe'),$('#city-labels'),id=>choose(geo.countries.find(c=>c.id===id).code,true),i=>choose(state.factions[i].id),state.factions.map(f=>({...f,city:cityName(f)})));
      signature=nextSignature;selected=null;
    }
    const owners=new Int16Array(geo.countries.length+1).fill(-1);
    for(const c of Object.values(state.countries))owners[c.id]=state.factions.findIndex(f=>f.id===c.ownerId);
    globe.setMap(grid,null,2880,1440,owners,layer,influenceWeights(state.coins.map(c=>c.market_cap)));
    failed=false;$('#globe-loading').hidden=true;render();
  } catch(error) {
    failed=true;
    if(state)status();else $('#status').textContent=t('No published observation available yet. The map will appear after the first successful run.','Aucun relevé publié disponible. La carte apparaîtra après la première exécution réussie.');
  } finally {busy=false;$('#refresh').disabled=false;}
}
$('#language-select').onchange=e=>{language=e.target.value;localStorage.setItem('capwars-language',language);translate();};
$('#refresh').onclick=refresh;
$('#home-view').onclick=()=>globe?.fly(16,12);
for(const [id,value] of [['layer-influence',0],['layer-countries',1]])$("#"+id).onclick=()=>{layer=value;if(globe){globe.layer=value;globe.dirty=true;}$('#layer-influence').classList.toggle('active',!value);$('#layer-countries').classList.toggle('active',!!value);};
translate();refresh();setInterval(refresh,60000);setInterval(status,30000);
