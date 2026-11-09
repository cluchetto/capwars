import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateCatalog} from '../collector/catalog.mjs';
import {providers} from '../collector/collect.mjs';
const places=[
 ['US','United States','New York',40.7128,-74.006,'#f0b45a','new-york'],
 ['FR','France','Paris',48.8566,2.3522,'#a99bf4','paris'],
 ['AU','Australia','Sydney',-33.8688,151.2093,'#66d4b4','sydney'],
 ['CN','China','Beijing',39.9042,116.4074,'#dfd080','beijing'],
 ['ZA','South Africa','Cape Town',-33.9249,18.4241,'#7db9e9','cape-town'],
 ['BR','Brazil','São Paulo',-23.5505,-46.6333,'#e08a8d','sao-paulo'],
 ['IR','Iran','Tehran',35.6892,51.3890,'#ed985e','tehran'],
];
export async function registrationCatalog(input,{fetchImpl=fetch,rpc='https://api.mainnet-beta.solana.com'}={}){
 if(input?.schemaVersion!==1||input.network!=='mainnet-beta'||input.simulationOnly!==false||!Array.isArray(input.factions)||input.factions.length<1||input.factions.length>places.length)throw Error('A real mainnet registration is required; simulation drafts cannot be published');
 const cities=new Set(),mints=new Set(),assets=[];
 const tokens=[];
 for(const f of input.factions){
  if(!Number.isInteger(f.city)||!places[f.city]||cities.has(f.city)||mints.has(f.mint)||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(f.mint??''))throw Error('Invalid or duplicate country/mint');
  cities.add(f.city);mints.add(f.mint);
  const [countryCode,country,city,lat,lon,color,slug]=places[f.city];
  let image=`/faction-art/${slug}.svg`;
  if(f.image&&f.image!==image){
   const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(f.image);if(!match)throw Error('Expected uploaded PNG, JPEG or WebP');
   const data=Buffer.from(match[2],'base64');if(data.length>300000)throw Error('Image too large');
   const file=`${createHash('sha256').update(data).digest('hex')}.${match[1]}`;
   image=`https://raw.githubusercontent.com/cluchetto/capwars/main/public/faction-art/${file}`;assets.push({file,data});
  }
  tokens.push({id:`capwars-${countryCode.toLowerCase()}-${createHash('sha256').update(f.mint).digest('hex').slice(0,12)}`,name:f.name,symbol:f.symbol,country,countryCode,city,lat,lon,color,glyph:countryCode,description:f.description,image,website:'https://capwars.pages.dev/',mint:f.mint,network:'mainnet-beta',enabled:true,source:{provider:'dexscreener',mint:f.mint}});
 }
 const catalog={schemaVersion:1,currency:'usd',maxAgeSeconds:900,tokens};validateCatalog(catalog,providers);
 // Check every mint on the main network before any files are changed. This checks
 // token existence, not the economic safety or fee settings of a launch.
 for(const token of tokens){
  const response=await fetchImpl(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[token.mint,{encoding:'jsonParsed',commitment:'finalized'}]}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Solana RPC unavailable');const result=await response.json();
  const account=result.result?.value,parsed=account?.data?.parsed;
  if(result.error||account?.owner!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'||parsed?.type!=='mint'||!parsed.info?.isInitialized||!/^\d+$/.test(parsed.info.supply)||BigInt(parsed.info.supply)===0n)throw Error(`Mainnet SPL mint not found: ${token.symbol}`);
 }
 return {catalog,assets};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error('Usage: node scripts/register-factions.mjs /path/to/mainnet-factions.json');
  const input=JSON.parse(await readFile(resolve(process.argv[2]),'utf8'));
  const {catalog,assets}=await registrationCatalog(input);
  const root=new URL('../',import.meta.url);
  await mkdir(new URL('public/faction-art/',root),{recursive:true});
  for(const a of assets)await writeFile(new URL(`public/faction-art/${a.file}`,root),a.data);
  await writeFile(new URL('config/tokens.json',root),JSON.stringify(catalog,null,2)+'\n');
  console.log(`${catalog.tokens.length} mainnet factions registered. Review and publish config/tokens.json and public/faction-art/ to GitHub. The next workflow observes these mints.`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
