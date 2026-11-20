import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { renderHome } from '../../scripts/build-lolicode-home.mjs';
const before = renderHome(execFileSync('git', ['show', '422d982:lolicode/index.html'], {encoding:'utf8'})).replace(/\r\n/g, '\n');
const after = renderHome(await readFile('lolicode/index.html','utf8')).replace(/\r\n/g, '\n');
const oldHero = before.match(/      <section class="hero harness-hero[\s\S]*?<\/section>/)[0];
const newHero = after.match(/      <section class="hero atelier-hero[\s\S]*?<\/figure>/)[0];
const anchor = '<link rel="stylesheet" href="/desktop-assets/home-20261120-cherry.css" />';
const paper = '      <div class="paper">\n';
const ribbon = after.match(/        <div class="studio-ribbon"[\s\S]*?(?=\n\n        <section)/)[0];
const footerToggle = before.match(/      <div class="site-motion-row[^\n]*\n/)[0];
const edits = [[anchor, anchor+'\n    <link rel="stylesheet" href="/desktop-assets/home-20261120-atelier.css" />'],[oldHero,newHero],[paper,paper+ribbon+'\n\n'],[footerToggle,'']];
let check=before;
for(const [marker,replacement] of edits) { if(check.split(marker).length !== 2) throw Error('Ambiguous insertion');check=check.replace(marker,replacement); }
if(check !== after) throw Error('Deployment patch differs from source');
const root = 'tmp/home-atelier-payload';
await mkdir(root+'/site/desktop-assets',{recursive:true});
const files={'homepage-edits.json':Buffer.from(JSON.stringify(edits,null,2)+'\n'),'desktop-assets/home-20261120-atelier.css':await readFile('lolicode/assets/home-20261120-atelier.css')};
const sha=data=>createHash('sha256').update(data).digest('hex');
const manifest={batch:'20261120-home-atelier-v2',files:{}};
for(const [name,data] of Object.entries(files)){await writeFile(root+'/site/'+name,data);manifest.files[name]=sha(data);}
const raw=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(root+'/manifest.json',raw);
console.log(sha(raw));
