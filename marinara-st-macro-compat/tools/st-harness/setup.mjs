// Prepares a runnable copy of SillyTavern's macro engine for differential tests.
// Usage: ST_DIR=/path/to/SillyTavern node tools/st-harness/setup.mjs
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stDir = process.env.ST_DIR;
if (!stDir) throw new Error('Set ST_DIR to a SillyTavern checkout.');
const work = join(here, '.work');
const pub = join(work, 'pub');
rmSync(work, { recursive: true, force: true });
mkdirSync(pub, { recursive: true });
cpSync(join(here, 'shims'), pub, { recursive: true });
cpSync(join(stDir, 'public/scripts/macros'), join(pub, 'scripts/macros'), { recursive: true });
cpSync(join(stDir, 'public/scripts/util/SimpleMutex.js'), join(pub, 'scripts/util/SimpleMutex.js'));

const utils = readFileSync(join(stDir, 'public/scripts/utils.js'), 'utf8');
const pick = (name) => {
  const match = new RegExp(`^export function ${name}\\b[\\s\\S]*?^}`, 'm').exec(utils);
  if (!match) throw new Error(`utils.js: ${name} not found`);
  return match[0];
};
writeFileSync(join(pub, 'scripts/utils.js'), [
  pick('getStringHash'), pick('isTrueBoolean'), pick('isFalseBoolean'),
  "export function escapeRegex(s) { return s.replace(/[/\\-\\\\^$*+?.()|[\\]{}]/g, '\\\\$&'); }",
  'export function timestampToMoment() { return null; }',
].join('\n'));

writeFileSync(join(work, 'package.json'), '{"type":"module"}\n');
writeFileSync(join(work, 'loader.mjs'), `const root = ${JSON.stringify(pathToFileURL(pub + '/').href)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('/scripts/')) return next(root + spec.slice(1), ctx);
  return next(spec, ctx);
}
`);
writeFileSync(join(work, 'register.mjs'), "import { register } from 'node:module';\nregister('./loader.mjs', import.meta.url);\n");
cpSync(join(here, 'st-engine.mjs'), join(work, 'st-engine.mjs'));
console.log(`SillyTavern macro engine prepared in ${work}`);
