// Random templates built from macro fragments, compared like run.mjs. Usage: node ... tools/diff/fuzz.mjs [count] [seed]
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { convertStMacros } from '../../dist/converter.mjs';

const marinaraDir = process.env.MARINARA_DIR;
const { resolveMacros } = await import(pathToFileURL(join(marinaraDir, 'packages/shared/src/utils/macro-engine.ts')).href);
const { stEval, stReset, stState } = await import('../st-harness/.work/st-engine.mjs');

let seed = Number(process.argv[3] ?? 1);
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (list) => list[Math.floor(rand() * list.length)];
const VARS = ['a', 'b', 'flag'];
const VALUES = ['on', 'off', '1', '0', '', 'yes', 'x y', '3', '10'];
const ATOMS = [
  () => ' text ', () => '\n', () => '{{user}}', () => '{{char}}', () => `{{.${pick(VARS)}}}`, () => `{{$${pick(VARS)}}}`,
  () => `{{.${pick(VARS)} = ${pick(VALUES)}}}`, () => `{{.${pick(VARS)}++}}`, () => `{{.${pick(VARS)} += ${pick(VALUES)}}}`,
  () => `{{.${pick(VARS)} || ${pick(VALUES)}}}`, () => `{{.${pick(VARS)} == ${pick(VALUES)}}}`,
  () => `{{.${pick(VARS)} > ${pick(VALUES)}}}`, () => `{{setvar::${pick(VARS)}::${pick(VALUES)}}}`,
  () => `{{getvar::${pick(VARS)}}}`, () => `{{addvar::${pick(VARS)}::${pick(VALUES)}}}`, () => `{{incvar::${pick(VARS)}}}`,
  () => `{{hasvar::${pick(VARS)}}}`, () => '{{trim}}', () => '{{// note}}', () => '{{noop}}', () => '{{newline}}',
  () => `{{reverse::${pick(VALUES)}}}`, () => '{{description}}',
];
const CONDS = [() => `.${pick(VARS)}`, () => `!.${pick(VARS)}`, () => `{{.${pick(VARS)} == ${pick(VALUES)}}}`,
  () => `!{{getvar::${pick(VARS)}}}`, () => 'description', () => pick(VALUES) || 'x', () => `$${pick(VARS)}`];
function gen(depth) {
  let out = '';
  const n = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (depth < 3 && r < 0.3) {
      const hash = rand() < 0.3 ? '#' : '';
      out += `{{${hash}if ${pick(CONDS)()}}}${gen(depth + 1)}${rand() < 0.5 ? `{{else}}${gen(depth + 1)}` : ''}{{/if}}`;
    } else if (depth < 3 && r < 0.35) {
      out += `{{setvar::${pick(VARS)}}}${gen(depth + 1)}{{/setvar}}`;
    } else out += pick(ATOMS)();
  }
  return out;
}
const norm = (s) => String(s).replace(/​/g, '').replace(/\s+/g, ' ').trim();
const count = Number(process.argv[2] ?? 2000);
let bad = 0;
const seen = new Set();
for (let i = 0; i < count; i++) {
  const text = gen(0);
  const locals = {};
  for (const v of VARS) if (rand() < 0.5) locals[v] = pick(VALUES);
  stReset({ locals, card: { description: 'DESC' }, chat: [] });
  const st = stEval(text);
  const stVars = Object.fromEntries(Object.entries(stState().locals).map(([k, v]) => [k, String(v)]));
  const conv = convertStMacros(text);
  const ctx = { user: 'User', char: 'Alice', characters: ['Alice'], variables: {}, localVariables: { ...locals }, characterFields: { description: 'DESC' } };
  const ma = resolveMacros(conv.text, ctx);
  const maVars = Object.fromEntries(Object.entries(ctx.localVariables).filter(([k]) => !/^(st_|stc_|stg_)/.test(k)));
  const same = norm(st) === norm(ma) && JSON.stringify(Object.entries(stVars).sort()) === JSON.stringify(Object.entries(maVars).sort());
  if (same) continue;
  bad++;
  const key = norm(st) + '|' + norm(ma);
  if (seen.size < 25 && !seen.has(key)) {
    seen.add(key);
    console.log(`✗ ${JSON.stringify(text)}\n  locals ${JSON.stringify(locals)}\n  conv  ${JSON.stringify(conv.text)}\n  ST    ${JSON.stringify(st)} ${JSON.stringify(stVars)}\n  M     ${JSON.stringify(ma)} ${JSON.stringify(maVars)}`);
  }
}
console.log(`\n${count - bad}/${count} identical after whitespace normalisation`);
