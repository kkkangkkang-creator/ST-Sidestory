// Differential test: SillyTavern's real macro engine vs. Marinara's engine on the converted text.
// Run through `npm run test:diff` with ST_DIR and MARINARA_DIR pointing at checkouts.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { cases } from './corpus.mjs';
import { convertStMacros } from '../../dist/converter.mjs';
import { computeBridgeValues } from '../../dist/bridge.mjs';

const marinaraDir = process.env.MARINARA_DIR;
if (!marinaraDir) throw new Error('Set MARINARA_DIR to a Marinara Engine checkout.');
const { resolveMacros } = await import(pathToFileURL(join(marinaraDir, 'packages/shared/src/utils/macro-engine.ts')).href);
const { stEval, stReset, stState } = await import('../st-harness/.work/st-engine.mjs');

const NAMES = { user: 'User', char: 'Alice' };
const CARD = {
  description: 'DESC', personality: 'PERS', scenario: 'SCEN', persona: 'PERSONA', mesExamples: 'EXAMPLES',
  system: 'CHARSYS', jailbreak: 'CHARPHI', version: '1.2', charDepthPrompt: 'DEPTH', creatorNotes: 'NOTES',
  firstMessage: 'Hello!', alternateGreetings: ['Hi again', 'Yo'],
};
const MARINARA_CARD = {
  first_mes: CARD.firstMessage, alternate_greetings: CARD.alternateGreetings, creator_notes: CARD.creatorNotes,
  character_version: CARD.version, extensions: { depth_prompt: { prompt: CARD.charDepthPrompt } },
};
const DEFAULT_CHAT = [
  { role: 'assistant', content: 'Hello!' },
  { role: 'user', content: 'How are you?' },
  { role: 'assistant', content: 'Fine.', swipeCount: 3, activeSwipeIndex: 1 },
  { role: 'user', content: 'Great' },
];

const toStChat = (chat) => chat.map((m) => ({
  mes: m.content, is_user: m.role === 'user', is_system: m.role === 'system',
  ...(m.role === 'user' ? {} : { swipes: Array.from({ length: m.swipeCount ?? 1 }, () => m.content), swipe_id: m.activeSwipeIndex ?? 0 }),
}));
const norm = (s) => String(s).replace(/​/g, '').replace(/\s+/g, ' ').trim();
const IGNORED_VAR = /^(st_|stc_)/;

function runSt(c) {
  stReset({ locals: c.locals ?? {}, globals: c.globals ?? {}, card: CARD, chat: toStChat(c.chat ?? DEFAULT_CHAT) });
  const out = stEval(c.text);
  const state = stState();
  const stringify = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));
  return { out, locals: stringify(state.locals), globals: stringify(state.globals) };
}

function runMarinara(c, converted) {
  const globals = Object.fromEntries(Object.entries(c.globals ?? {}).map(([k, v]) => [`stg_${k.replace(/[^\w]/g, '_')}`, String(v)]));
  const bridge = computeBridgeValues({
    names: converted.bridge, params: converted.bridgeParams, messages: c.chat ?? DEFAULT_CHAT,
    character: MARINARA_CARD, parameters: { maxContext: 2000, maxTokens: 500 }, isMobile: false, now: new Date(),
  });
  const ctx = {
    user: NAMES.user, char: NAMES.char, characters: [NAMES.char], variables: {},
    localVariables: { ...(c.locals ?? {}), ...globals, ...bridge },
    characterFields: { description: CARD.description, personality: CARD.personality, scenario: CARD.scenario, example: CARD.mesExamples, systemPrompt: CARD.system, postHistoryInstructions: CARD.jailbreak },
    personaFields: { description: CARD.persona }, model: 'test-model',
  };
  const out = resolveMacros(converted.text, ctx);
  const locals = {};
  const outGlobals = {};
  for (const [k, v] of Object.entries(ctx.localVariables)) {
    if (k.startsWith('stg_')) outGlobals[k] = v;
    else if (!IGNORED_VAR.test(k)) locals[k] = v;
  }
  return { out, locals, globals: outGlobals };
}

const sameVars = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

let pass = 0;
let fail = 0;
let known = 0;
let exact = 0;
const verbose = process.argv.includes('--verbose');
for (const c of cases) {
  const converted = convertStMacros(c.text, { scopeKey: c.name });
  const st = runSt(c);
  const ma = runMarinara(c, converted);
  const stGlobals = Object.fromEntries(Object.entries(st.globals).map(([k, v]) => [`stg_${k.replace(/[^\w]/g, '_')}`, v]));
  const outOk = c.compare === 'vars' || norm(st.out) === norm(ma.out);
  const varsOk = sameVars(st.locals, ma.locals) && sameVars(stGlobals, ma.globals);
  const exactOk = st.out === ma.out.replace(/\u200B/g, '');
  if (outOk && varsOk) {
    pass++;
    if (exactOk) exact++;
    else if (verbose) console.log(`~ ${c.name}: whitespace differs\n  ST:       ${JSON.stringify(st.out)}\n  Marinara: ${JSON.stringify(ma.out)}`);
    continue;
  }
  if (c.knownDiff) {
    known++;
    if (verbose) console.log(`· ${c.name} (${c.knownDiff})\n  ST:       ${JSON.stringify(st.out)}\n  Marinara: ${JSON.stringify(ma.out)}`);
    continue;
  }
  fail++;
  console.log(`✗ ${c.name}`);
  console.log(`  input:     ${JSON.stringify(c.text)}`);
  console.log(`  converted: ${JSON.stringify(converted.text)}`);
  if (!outOk) console.log(`  ST:        ${JSON.stringify(st.out)}\n  Marinara:  ${JSON.stringify(ma.out)}`);
  if (!varsOk) console.log(`  ST vars:   ${JSON.stringify({ ...st.locals, ...stGlobals })}\n  M vars:    ${JSON.stringify({ ...ma.locals, ...ma.globals })}`);
}
console.log(`\n${pass} same (${exact} identical including whitespace), ${known} known differences, ${fail} different (of ${cases.length})`);
process.exitCode = fail ? 1 : 0;
