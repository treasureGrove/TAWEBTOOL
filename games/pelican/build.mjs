// Bundles src/main.js (+ three.js) into one classic script, dist/pelican.js.
// A classic <script> (not an ES module) keeps index.html working when opened from file://.
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/pelican.js',
  minify: !dev,
  keepNames: dev,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  await build(options);
}
