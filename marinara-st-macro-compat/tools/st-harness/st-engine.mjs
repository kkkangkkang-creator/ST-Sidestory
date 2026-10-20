// Runs SillyTavern's real macro engine in node. setup.mjs copies this next to the shims and the
// engine sources (.work/); shims/script.js reads the chat and card from globalThis.__st.

// SillyTavern logs every macro warning; keep them out of the test output while evaluating.
let quiet = true;
for (const level of ['warn', 'error', 'log', 'info', 'debug']) {
  const original = console[level];
  console[level] = (...args) => { if (!quiet) original(...args); };
}

const st = { chat: [], chat_metadata: { variables: {} }, globals: {}, card: {} };
globalThis.__st = st;

/** Variable store with SillyTavern's semantics (public/scripts/variables.js). */
function createVariables(store) {
  const get = (name, args = {}) => {
    let value = store()[name];
    if (args.index !== undefined) {
      try {
        value = JSON.parse(value);
        value = value[isNaN(Number(args.index)) ? args.index : Number(args.index)];
        if (typeof value == 'object') value = JSON.stringify(value);
      } catch { /* not JSON */ }
    }
    return (value?.trim?.() === '' || isNaN(Number(value))) ? (value || '') : Number(value);
  };
  const set = (name, value, args = {}) => {
    if (!name) throw new Error('Variable name cannot be empty or undefined.');
    if (args.index === undefined) {
      store()[name] = value;
      return value;
    }
    try {
      let parsed = JSON.parse(store()[name] ?? 'null');
      const index = Number(args.index);
      if (isNaN(index)) { parsed ??= {}; parsed[args.index] = value; } else { parsed ??= []; parsed[index] = value; }
      store()[name] = JSON.stringify(parsed);
    } catch { /* not JSON */ }
    return value;
  };
  const add = (name, value) => {
    const current = get(name) || 0;
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) { parsed.push(value); set(name, JSON.stringify(parsed)); return parsed; }
    } catch { /* not JSON */ }
    const increment = Number(value);
    if (isNaN(increment) || isNaN(Number(current))) {
      const text = String(current || '') + value;
      set(name, text);
      return text;
    }
    const sum = Number(current) + increment;
    if (isNaN(sum)) return '';
    set(name, sum);
    return sum;
  };
  return {
    get, set, add,
    inc: (name) => add(name, 1),
    dec: (name) => add(name, -1),
    has: (name) => store()[name] !== undefined,
    del: (name) => { delete store()[name]; return ''; },
  };
}

globalThis.SillyTavern = {
  getContext: () => ({ variables: { local: createVariables(() => st.chat_metadata.variables), global: createVariables(() => st.globals) } }),
};
globalThis.document = { querySelector: () => null };

const { initRegisterMacros } = await import('./pub/scripts/macros/macro-system.js');
const { MacroEngine } = await import('./pub/scripts/macros/engine/MacroEngine.js');
const { MacroEnvBuilder } = await import('./pub/scripts/macros/engine/MacroEnvBuilder.js');
initRegisterMacros();
quiet = false;

export function stReset({ locals = {}, globals = {}, card = {}, chat = [] } = {}) {
  st.chat_metadata.variables = { ...locals };
  st.globals = { ...globals };
  for (const key of Object.keys(st.card)) delete st.card[key];
  Object.assign(st.card, card);
  st.chat.length = 0;
  st.chat.push(...chat);
}

export function stEval(text) {
  quiet = true;
  try {
    const env = MacroEnvBuilder.buildFromRawEnv({ content: text, replaceCharacterCard: true });
    return MacroEngine.evaluate(text, env);
  } finally {
    quiet = false;
  }
}

export const stState = () => ({ locals: { ...st.chat_metadata.variables }, globals: { ...st.globals } });
