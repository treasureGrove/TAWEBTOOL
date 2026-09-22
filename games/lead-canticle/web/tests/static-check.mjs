import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
let errors=0,files=0,bytes=0;
function need(from,ref){if(!ref.startsWith('.'))return;const target=path.resolve(path.dirname(from),ref.split(/[?#]/)[0]);if(!fs.existsSync(target)){console.error('Missing local reference:',ref,'from',from);errors++;}}
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory()){walk(p);continue;}files++;bytes+=fs.statSync(p).size;const ext=path.extname(p);if(ext==='.js'){const result=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);errors++;}const text=fs.readFileSync(p,'utf8');for(const m of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))need(p,m[1]);}if(ext==='.html'){for(const m of fs.readFileSync(p,'utf8').matchAll(/(?:src|href)="(\.[^"]+)"/g))need(p,m[1]);}}}
walk(root);const manifest=JSON.parse(fs.readFileSync(new URL('../.openai/hosting.json',import.meta.url)));if(manifest.static.directory!=='dist')errors++;
console.log(`Static validation: ${files} files, ${(bytes/1024/1024).toFixed(2)} MiB, ${errors} errors.`);process.exitCode=errors?1:0;
