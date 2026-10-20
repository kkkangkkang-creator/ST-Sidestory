// Builds the converter module (for tests) and the Marinara extension package.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
const stripExports = (source) => source.replace(/^export \{[^}]*\};?\s*$/gm, '');

const converterSource = `${read('src/st-registry.js')}\n${stripExports(read('src/converter.js'))}`;
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(
  join(dist, 'converter.mjs'),
  `${converterSource}\nexport { convertStMacros, parseDocument, BRIDGE_PREFIX, GLOBAL_PREFIX, CONVERTED_MARK };\n`,
);
writeFileSync(
  join(dist, 'bridge.mjs'),
  `${stripExports(read('src/bridge.js'))}\nexport { computeBridgeValues, formatMoment, bridgeNeeds };\n`,
);

// The installable package is committed so users can import it without building.
const extensionDir = join(root, 'release', 'SillyTavern Macro Compatibility');
rmSync(extensionDir, { recursive: true, force: true });
mkdirSync(extensionDir, { recursive: true });
try {
  const manifest = JSON.parse(read('manifest.json'));
  const extensionSource = `${converterSource}\n${stripExports(read('src/bridge.js'))}\n${stripExports(read('src/extension.js'))}`;
  writeFileSync(join(extensionDir, 'extension.js'), extensionSource);
  writeFileSync(join(extensionDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Built dist/converter.mjs, dist/bridge.mjs and release/SillyTavern Macro Compatibility/');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log('Built dist/converter.mjs (extension sources not present yet)');
}
