const fs = require('fs');
const path = require('path');

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'gif_worker.js'), 'utf8');
const escaped = workerSrc
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

const snippet = `var WORKER_CODE = \`${escaped}\`;`;

const mainPath = path.join(__dirname, '..', 'js', 'gif_compress.js');
let mainSrc = fs.readFileSync(mainPath, 'utf8');

// Replace old WORKER_CODE
mainSrc = mainSrc.replace(/var WORKER_CODE = `[\s\S]*?`;/, snippet);

// Ensure createWorker uses module worker
mainSrc = mainSrc.replace(
    /function createWorker\(\) \{[\s\S]*?\n\}/m,
    `function createWorker() {
    return new Worker(URL.createObjectURL(new Blob([WORKER_CODE], { type: 'text/javascript' })), { type: 'module' });
}`
);

fs.writeFileSync(mainPath, mainSrc, 'utf8');
console.log('Inlined gif_worker.js (module) into gif_compress.js');
