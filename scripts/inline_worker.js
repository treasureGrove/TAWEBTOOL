const fs = require('fs');
const path = require('path');

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'gif_worker_v2.js'), 'utf8');
const escaped = workerSrc
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

const snippet = 'var WORKER_CODE = `' + escaped + '`;';

const mainPath = path.join(__dirname, '..', 'js', 'gif_compress.js');
let mainSrc = fs.readFileSync(mainPath, 'utf8');

// Check if WORKER_CODE already exists
if (mainSrc.includes('var WORKER_CODE =')) {
    mainSrc = mainSrc.replace(/var WORKER_CODE = `[\s\S]*?`;/, snippet);
} else {
    mainSrc = snippet + '\n' + mainSrc;
}

fs.writeFileSync(mainPath, mainSrc, 'utf8');
console.log('Inlined gif_worker_v2.js into gif_compress.js');
