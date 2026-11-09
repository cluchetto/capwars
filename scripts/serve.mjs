import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.bin':'application/octet-stream'};
createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(process.env.CAPWARS_PREVIEW_LOCAL==='1'&&path==='/settings.js'){
      res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'});res.end("export const STATE_URL = '/_preview/current.json'; export const CATALOG_URL = '/_preview/catalog.json';");return;
    }
    if(process.env.CAPWARS_PREVIEW_LOCAL==='1'&&path==='/_preview/catalog.json'){const body=await readFile(new URL('../config/tokens.json',import.meta.url));res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'});res.end(body);return;}
    if(process.env.CAPWARS_PREVIEW_LOCAL==='1'&&path==='/_preview/current.json'){
      const body=await readFile(new URL('../state/current.json',import.meta.url));res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'});res.end(body);return;
    }
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root))throw Error('Invalid path');
    const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.CAPWARS_PORT||4174),'127.0.0.1',()=>console.log('CapWars public preview ready'));
