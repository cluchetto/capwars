import {cp, mkdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = new URL('../', import.meta.url), dist = new URL('dist/', root);
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
await cp(new URL('public/',root),dist,{recursive:true});
// Only public assets are packaged. Admin code and local wallets never enter this repo.
console.log(`Static site ready: ${fileURLToPath(dist)}`);
