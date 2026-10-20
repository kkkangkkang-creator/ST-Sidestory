/* SillyTavern → Marinara macro converter.
 *
 * Parses text the way SillyTavern's macro engine (MacroLexer/MacroParser/MacroCstWalker) does,
 * then writes the same behaviour in Marinara Engine's macro syntax. Anything Marinara has no
 * macro for is read from a chat variable that the runtime bridge fills before each generation
 * (names start with `st_`). Every approximation is reported in `notes`.
 *
 * Depends on ST_MACROS (st-registry.js). Plain script: no imports, no DOM.
 */

const BRIDGE_PREFIX = 'st_';
/** Comment put in front of converted text, so a second conversion leaves it alone (Marinara strips comments). */
const CONVERTED_MARK = '{{// ST→Marinara}}';
const GLOBAL_PREFIX = 'stg_';
const TEMP_IF = 'stc_if';
const TEMP_CMP = 'stc_cmp';
const TEMP_ROLL = 'stc_roll';
const ZWSP = '\u200B';
const ESC_OPEN = '\uE000';
const ESC_CLOSE = '\uE001';

const IDENT_RE = /^[a-zA-Z][\w-]*/;
const VAR_IDENT_RE = /^[a-zA-Z](?:[\w-]*\w)?/;
const VAR_SHORTHAND_RE = /^([.$])([a-zA-Z](?:[\w-]*\w)?)$/;
const FLAG_CHARS = '!?~#/>';
const VAR_OPERATORS = ['++', '--', '??=', '??', '||=', '||', '-=', '==', '!=', '>=', '>', '<=', '<', '+=', '='];
const MARINARA_VAR_NAME_RE = /^[\w.-]+$/;

/** Bare operands Marinara's {{#if}} understands without a variable lookup. */
const NATIVE_OPERANDS = {
  user: 'user', char: 'char', description: 'description', personality: 'personality',
  scenario: 'scenario', mesexamples: 'example', mesexamplesraw: 'example', charprompt: 'charSysInfo',
  charinstruction: 'charPostHistory', input: 'input', model: 'model', persona: 'personaDescription',
};

// ── Registry lookups ───────────────────────────────────────────

const REGISTRY = (() => {
  const map = new Map();
  for (const [name, def] of Object.entries(ST_MACROS)) {
    map.set(name.toLowerCase(), { name, min: def[0], max: def[1], list: def[2], strict: def[3], aliasOf: def[4], types: def[5] });
  }
  return map;
})();

function getMacroDef(name) {
  return REGISTRY.get(String(name).toLowerCase()) || null;
}

function getPrimaryDef(name) {
  const def = getMacroDef(name);
  if (!def) return null;
  return def.aliasOf ? getMacroDef(def.aliasOf) : def;
}

const TYPE_CHECKS = {
  integer: (v) => /^-?\d+$/.test(v.trim()),
  number: (v) => Number.isFinite(Number(v.trim())),
  boolean: (v) => ['on', 'true', '1', 'off', 'false', '0'].includes(v.trim().toLowerCase()),
};

/** SillyTavern rejects a call whose literal argument has the wrong type; dynamic values pass here. */
function argTypesValid(def, args) {
  if (!def.types) return true;
  return def.types.every((types, i) => {
    if (!types || !args[i]) return true;
    const value = staticText(args[i].nodes);
    return value === null || types.some((t) => TYPE_CHECKS[t]?.(value));
  });
}

function argsValid(def, count) {
  if (def.list) {
    const min = def.min + def.list[0];
    const max = def.list[1] === null ? Infinity : def.max + def.list[1];
    return count >= min && count <= max;
  }
  return count >= def.min && count <= def.max;
}

// ── Lexing / parsing (mirrors MacroLexer + MacroParser) ────────

/**
 * Parse a document into a flat list of nodes:
 *   { type: 'text', value }
 *   { type: 'macro', start, end, flags, name, args: [{ start, end, raw, nodes }], argsStart, argsEnd, separators }
 *   { type: 'var', start, end, flags, scope, name, op, value: { raw, nodes } | null }
 * Offsets are relative to `text`.
 */
function parseDocument(text) {
  const nodes = [];
  let pos = 0;
  let textStart = 0;
  const flushText = (until) => {
    if (until > textStart) nodes.push({ type: 'text', value: text.slice(textStart, until) });
  };
  while (pos < text.length) {
    let open = text.indexOf('{{', pos);
    if (open < 0) break;
    // A run of braces: the last two open the macro, the rest are text (PlaintextOpenBrace).
    while (text[open + 2] === '{') open++;
    const parsed = parseMacro(text, open);
    if (!parsed) {
      // Error recovery: keep the opener as text and keep scanning inside it.
      pos = open + 2;
      continue;
    }
    flushText(open);
    nodes.push(parsed);
    pos = parsed.end;
    textStart = pos;
  }
  flushText(text.length);
  return nodes;
}

function skipWs(text, pos) {
  while (pos < text.length && /\s/.test(text[pos])) pos++;
  return pos;
}

/** Find the `}}` that ends the macro region starting at `pos`, skipping nested macros. */
function scanRegion(text, pos) {
  const nested = [];
  while (pos < text.length) {
    if (text.startsWith('}}', pos)) return { end: pos, nested };
    if (text.startsWith('{{', pos)) {
      let open = pos;
      while (text[open + 2] === '{') open++;
      const inner = parseMacro(text, open);
      if (inner) {
        nested.push(inner);
        pos = inner.end;
        continue;
      }
      pos = open + 2;
      continue;
    }
    pos++;
  }
  return null;
}

function parseMacro(text, start) {
  let pos = start + 2;
  const flags = [];
  for (;;) {
    pos = skipWs(text, pos);
    if (pos >= text.length) return null;
    if (text.startsWith('}}', pos)) return null;
    if (text.startsWith('//', pos)) return parseMacroBody(text, start, pos, flags, '//', pos + 2);
    const ch = text[pos];
    if (ch === '.' || ch === '$') return parseVarExpr(text, start, pos, flags);
    if (FLAG_CHARS.includes(ch)) {
      flags.push(ch);
      pos++;
      continue;
    }
    const ident = IDENT_RE.exec(text.slice(pos));
    if (!ident) return null;
    let after = pos + ident[0].length;
    // Characters that cannot end an identifier are skipped by the lexer's error recovery.
    while (after < text.length && !/[\s:|}]/.test(text[after])) {
      if (text.startsWith('{{', after)) return null;
      after++;
    }
    return parseMacroBody(text, start, pos, flags, ident[0], after);
  }
}

function parseMacroBody(text, start, namePos, flags, name, argsPos) {
  const region = scanRegion(text, argsPos);
  if (!region) return null;
  const argsStart = argsPos;
  const argsEnd = region.end;
  const args = splitArguments(text, argsStart, argsEnd, region.nested);
  if (args === null) return null;
  return {
    type: 'macro', start, end: argsEnd + 2, flags, name, namePos,
    args: args.list, separators: args.separators, argsStart, argsEnd,
    source: text.slice(start, argsEnd + 2),
  };
}

/** Split an argument region into arguments the way the `arguments` grammar rule does. */
function splitArguments(text, from, to, nested) {
  // Separators are only found outside nested macros.
  const isInsideNested = (i) => nested.some((m) => i >= m.start && i < m.end);
  const first = skipWs(text, from);
  if (first >= to) return { list: [], separators: 'none' };
  const makeArg = (s, e) => {
    let a = skipWs(text, s);
    let b = e;
    while (b > a && /\s/.test(text[b - 1]) && !isInsideNested(b - 1)) b--;
    const raw = text.slice(a, b);
    return { start: a, end: b, raw, nodes: parseDocument(raw) };
  };
  if (text.startsWith('::', first) && !text.startsWith(':::', first)) {
    const list = [];
    let segStart = first + 2;
    let i = segStart;
    while (i < to) {
      if (isInsideNested(i)) { i++; continue; }
      if (text.startsWith('::', i)) {
        list.push(makeArg(segStart, i));
        i += 2;
        segStart = i;
        continue;
      }
      i++;
    }
    list.push(makeArg(segStart, to));
    return { list, separators: 'double' };
  }
  if (text.startsWith(':::', first)) {
    // `:::` lexes as `::` + `:` → first argument starts with a colon.
    const list = [];
    let segStart = first + 2;
    let i = segStart + 1;
    while (i < to) {
      if (isInsideNested(i)) { i++; continue; }
      if (text.startsWith('::', i)) { list.push(makeArg(segStart, i)); i += 2; segStart = i; continue; }
      i++;
    }
    list.push(makeArg(segStart, to));
    return { list, separators: 'double' };
  }
  let s = first;
  if (text[s] === ':') s++;
  if (skipWs(text, s) >= to) return { list: [], separators: 'single' };
  return { list: [makeArg(s, to)], separators: 'single' };
}

function parseVarExpr(text, start, prefixPos, flags) {
  const scope = text[prefixPos] === '.' ? 'local' : 'global';
  let pos = skipWs(text, prefixPos + 1);
  const ident = VAR_IDENT_RE.exec(text.slice(pos));
  if (!ident) return null;
  const name = ident[0];
  pos = skipWs(text, pos + name.length);
  let op = null;
  let value = null;
  if (!text.startsWith('}}', pos)) {
    op = VAR_OPERATORS.find((o) => text.startsWith(o, pos));
    if (!op) return null;
    pos += op.length;
    if (op === '++' || op === '--') {
      pos = skipWs(text, pos);
      if (!text.startsWith('}}', pos)) return null;
    } else {
      const region = scanRegion(text, pos);
      if (!region) return null;
      const raw = text.slice(pos, region.end).trim();
      value = { raw, nodes: parseDocument(raw) };
      pos = region.end;
    }
  }
  return { type: 'var', start, end: pos + 2, flags, scope, name, op, value, source: text.slice(start, pos + 2) };
}

// ── Scoped macro pairing (mirrors MacroCstWalker#processScopedMacros) ──

function macroInfo(node) {
  if (node.type !== 'macro') return null;
  let isClosing = node.flags.includes('/');
  if (!isClosing && node.name === '//' && node.args[0] && node.args[0].raw.startsWith('/')) isClosing = true;
  return { name: node.name, isClosing, argCount: node.args.length };
}

function canAcceptScoped(node) {
  const def = getPrimaryDef(node.name);
  if (!def) return true;
  if (def.list) return false;
  const count = node.args.length + 1;
  return count >= def.min && count <= def.max;
}

/** Turn a flat node list into a list where scoped openers carry their `content` (flat nodes). */
function pairScopes(nodes) {
  const infos = [];
  nodes.forEach((node, index) => {
    const info = macroInfo(node);
    if (info) infos.push({ index, node, ...info, matched: false });
  });
  const pairs = [];
  const inside = new Set();
  const raw = new Set();
  for (let i = 0; i < infos.length; i++) {
    const open = infos[i];
    if (open.isClosing || open.matched || inside.has(open.index)) continue;
    let depth = 1;
    let closeIdx = -1;
    for (let j = i + 1; j < infos.length; j++) {
      const other = infos[j];
      if (other.name.toLowerCase() !== open.name.toLowerCase() || other.matched) continue;
      if (other.isClosing) {
        depth--;
        if (depth === 0) { closeIdx = j; break; }
      } else if (canAcceptScoped(other.node)) {
        depth++;
      }
    }
    if (closeIdx === -1) continue;
    const close = infos[closeIdx];
    open.matched = true;
    close.matched = true;
    if (!canAcceptScoped(open.node)) {
      // A complete macro cannot take content: ST prints both tags as written.
      raw.add(open.index);
      raw.add(close.index);
      continue;
    }
    pairs.push([open.index, close.index]);
    for (let k = open.index + 1; k < close.index; k++) inside.add(k);
  }
  for (const info of infos) if (info.isClosing && !info.matched) raw.add(info.index);
  const result = [];
  let cursor = 0;
  const plain = (until) => {
    for (; cursor < until; cursor++) result.push({ node: nodes[cursor], keepRaw: raw.has(cursor) });
  };
  for (const [o, c] of pairs) {
    plain(o);
    result.push({ node: nodes[o], content: nodes.slice(o + 1, c), closing: nodes[c] });
    cursor = c + 1;
  }
  plain(nodes.length);
  return result;
}

// ── Emission ───────────────────────────────────────────────────

function createContext(options) {
  return {
    scopeKey: options.scopeKey || '',
    notes: [],
    bridge: new Set(),
    bridgeParams: {},
    globals: new Set(),
    pickIndex: 0,
  };
}

function note(ctx, level, code, macro, message) {
  ctx.notes.push({ level, code, macro, message });
}

function bridgeVar(ctx, key, params) {
  const name = BRIDGE_PREFIX + key;
  ctx.bridge.add(name);
  if (params) ctx.bridgeParams[name] = params;
  return `{{getvar::${name}}}`;
}

/** Hash for stable generated names (FNV-1a, base36). */
function shortHash(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Static text of a node list, or null when it contains macros. */
function staticText(nodes) {
  let out = '';
  for (const n of nodes) {
    if (n.type !== 'text') return null;
    out += n.value;
  }
  return unescapeBraces(out);
}

function unescapeBraces(text) {
  return text.replace(/\\([{}])/g, '$1');
}

function isStFalsy(value) {
  const v = String(value).trim().toLowerCase();
  return value === '' || v === 'off' || v === 'false' || v === '0';
}

function localName(ctx, raw, macro) {
  if (MARINARA_VAR_NAME_RE.test(raw)) return raw;
  const fixed = raw.replace(/[^\w.-]/g, '_') || '_';
  note(ctx, 'warn', 'var-name', macro, `변수 이름 "${raw}"을(를) Marinara에서 쓸 수 있는 "${fixed}"(으)로 바꿨어요.`);
  return fixed;
}

function globalName(ctx, raw) {
  const fixed = GLOBAL_PREFIX + raw.replace(/[^\w]/g, '_');
  ctx.globals.add(fixed);
  return fixed;
}

/** Name argument of a variable macro: static → Marinara name, dynamic → converted text. */
function varNameArg(ctx, arg, macro, isGlobal) {
  const value = staticText(arg.nodes);
  if (value !== null) return isGlobal ? globalName(ctx, value) : localName(ctx, value, macro);
  note(ctx, 'warn', 'dynamic-var-name', macro, '변수 이름에 매크로가 들어 있어요. Marinara는 이름이 고정된 변수만 확실히 처리해요.');
  return emitNodes(ctx, arg.nodes);
}

function quoteLiteral(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** Marinara condition operand for a value: a quoted literal, or a temp variable when it is dynamic. */
function valueOperand(ctx, nodes, tempName) {
  const value = staticText(nodes);
  if (value !== null && !value.includes('}}') && !value.includes('{{')) {
    return { setup: '', operand: quoteLiteral(value) };
  }
  return { setup: `{{setvar::${tempName}::${emitNodes(ctx, nodes)}}}`, operand: `var.${tempName}` };
}

function emitNodes(ctx, nodes) {
  let out = '';
  for (const item of pairScopes(nodes)) out += emitItem(ctx, item);
  return out;
}

function emitItem(ctx, item) {
  const node = item.node;
  if (node.type === 'text') return emitText(node.value);
  if (item.keepRaw) return node.source;
  if (node.type === 'var') return emitVarExpr(ctx, node);
  return emitMacro(ctx, node, item.content || null, item.closing || null);
}

function emitText(value) {
  return value.replace(/\\\{/g, ESC_OPEN).replace(/\\\}/g, ESC_CLOSE);
}

/**
 * Static version of MacroEngine.trimScopedContent: dedent by the first non-empty line's indent,
 * then trim. Works on the literal text around macros; macro output is left as is.
 */
function trimScopedNodes(nodes) {
  // Macros stand in as one non-space character so indentation is measured on the literal layout.
  const layout = nodes.map((n) => (n.type === 'text' ? n.value : '\uE002')).join('');
  const firstLine = layout.split('\n').find((line) => line.trim() !== '');
  const baseIndent = firstLine ? /^[ \t]*/.exec(firstLine)[0].length : 0;
  const copy = [];
  let lineStart = true;
  for (const n of nodes) {
    if (n.type !== 'text') { copy.push(n); lineStart = false; continue; }
    let value = n.value;
    if (baseIndent > 0) {
      value = value.split('\n').map((line, i) => {
        if (i === 0 && !lineStart) return line;
        const indent = /^[ \t]*/.exec(line)[0].length;
        return indent >= baseIndent ? line.slice(baseIndent) : line.trimStart();
      }).join('\n');
    }
    lineStart = value.endsWith('\n') || (lineStart && !value.includes('\n') && value.trim() === '');
    copy.push({ ...n, value });
  }
  // Trim through macros that print nothing, as ST trims the evaluated text.
  for (let i = 0; i < copy.length; i++) {
    const n = copy[i];
    if (n.type === 'text') {
      copy[i] = { ...n, value: n.value.trimStart() };
      if (copy[i].value) break;
    } else if (!isSilent(n)) break;
  }
  for (let i = copy.length - 1; i >= 0; i--) {
    const n = copy[i];
    if (n.type === 'text') {
      copy[i] = { ...n, value: n.value.trimEnd() };
      if (copy[i].value) break;
    } else if (!isSilent(n)) break;
  }
  return copy.filter((n) => n.type !== 'text' || n.value !== '');
}

const SILENT_MACROS = new Set(['//', 'noop', 'setvar', 'addvar', 'deletevar', 'setglobalvar', 'addglobalvar', 'deleteglobalvar', 'banned', 'else']);

/** Nodes that always print an empty string in SillyTavern. */
function isSilent(node) {
  if (node.type === 'var') return ['=', '+=', '-='].includes(node.op);
  if (node.type !== 'macro' || node.flags.includes('/')) return false;
  const def = getPrimaryDef(node.name);
  return !!def && SILENT_MACROS.has(def.name) && argsValid(def, node.args.length);
}

/** Whether trimmed scoped content can still start or end with macro output (whitespace ST would trim). */
function hasDynamicEdges(nodes) {
  const edge = (list) => {
    for (const n of list) {
      if (n.type === 'text') return false;
      if (!isSilent(n)) return true;
    }
    return false;
  };
  return edge(nodes) || edge(nodes.slice().reverse());
}

/** Raw macro as ST leaves it (unknown name or wrong arity), with nested macros converted. */
function emitRaw(ctx, node, scoped, { inertOuter = false } = {}) {
  const src = node.source;
  let out = '';
  let cursor = 0;
  for (const arg of node.args) {
    const from = arg.start - node.start;
    out += src.slice(cursor, from) + emitNodes(ctx, arg.nodes);
    cursor = arg.end - node.start;
  }
  out += src.slice(cursor);
  // A macro SillyTavern prints as written must not run in Marinara either.
  if (inertOuter) out = `{${ZWSP}${out.slice(1)}`;
  if (scoped) out += emitNodes(ctx, scoped.nodes) + scoped.closing.source;
  return out;
}

function emitVarExpr(ctx, node) {
  const isGlobal = node.scope === 'global';
  const label = node.source;
  const name = isGlobal ? globalName(ctx, node.name) : localName(ctx, node.name, label);
  const value = node.value ? node.value.nodes : [];
  const valueText = () => emitNodes(ctx, value);
  const get = `{{getvar::${name}}}`;
  switch (node.op) {
    case null: return get;
    case '=': return `{{setvar::${name}::${valueText()}}}`;
    case '+=': return `{{addvar::${name}::${valueText()}}}`;
    case '-=': {
      const lit = staticText(value);
      if (lit !== null && lit.trim() !== '' && !isNaN(Number(lit))) return `{{addnumvar::${name}::${-Number(lit)}}}`;
      note(ctx, 'warn', 'sub-dynamic', label, '빼는 값이 숫자로 고정되어 있지 않아 근사치로 바꿨어요.');
      return `{{addnumvar::${name}::-${valueText()}}}`;
    }
    // addvar keeps SillyTavern's rule that a non-numeric value gets "1" appended.
    case '++': return `{{addvar::${name}::1}}${get}`;
    case '--': return `{{addvar::${name}::-1}}${get}`;
    case '||': return `{{#if var.${name}}}${get}{{else}}${valueText()}{{/if}}`;
    case '??': return `{{#if var.${name} != ""}}${get}{{else}}${valueText()}{{/if}}`;
    case '||=': return `{{#if var.${name}}}{{else}}{{setvar::${name}::${valueText()}}}{{/if}}${get}`;
    case '??=': return `{{#if var.${name} == ""}}{{setvar::${name}::${valueText()}}}{{/if}}${get}`;
    default: {
      const rhs = valueOperand(ctx, value, TEMP_CMP);
      noteComparison(ctx, node.op, label);
      return `${rhs.setup}{{#if var.${name} ${node.op} ${rhs.operand}}}true{{else}}false{{/if}}`;
    }
  }
}

function noteComparison(ctx, op, label) {
  if (op === '==' || op === '!=') {
    note(ctx, 'info', 'compare-case', label, 'Marinara의 ==, != 비교는 대소문자를 구분하지 않고 숫자는 숫자로 비교해요 (SillyTavern은 글자 그대로 비교).');
  }
}

/** ST {{if}} condition → Marinara { setup, expr } or { constant }. */
function convertCondition(ctx, nodes, label) {
  const plain = staticText(nodes);
  if (plain !== null) {
    const cond = plain.trim();
    const shorthand = VAR_SHORTHAND_RE.exec(cond);
    if (shorthand) {
      const name = shorthand[1] === '$' ? globalName(ctx, shorthand[2]) : localName(ctx, shorthand[2], label);
      noteTruthiness(ctx, label);
      return { setup: '', expr: `var.${name}` };
    }
    const def = getPrimaryDef(cond);
    if (def && def.min === 0) {
      const native = NATIVE_OPERANDS[def.name.toLowerCase()];
      if (native) return { setup: '', expr: native };
      return tempCondition(emitNodes(ctx, parseDocument(`{{${cond}}}`)));
    }
    if (isMarinaraCondition(cond)) return { setup: '', expr: cond };
    note(ctx, 'info', 'constant-condition', label,`조건 "${cond}"은(는) 변수가 아니라 글자라서 SillyTavern에서 항상 ${isStFalsy(cond) ? '거짓' : '참'}이에요. 같은 결과가 나오게 고정했어요.`);
    return { constant: !isStFalsy(cond) };
  }
  const significant = nodes.filter((n) => !(n.type === 'text' && n.value.trim() === ''));
  if (significant.length === 1) {
    const only = significant[0];
    if (only.type === 'var') {
      const name = only.scope === 'global' ? globalName(ctx, only.name) : localName(ctx, only.name, label);
      if (only.op === null) {
        noteTruthiness(ctx, label);
        return { setup: '', expr: `var.${name}` };
      }
      if (['==', '!=', '>', '>=', '<', '<='].includes(only.op)) {
        const rhs = valueOperand(ctx, only.value.nodes, TEMP_CMP);
        noteComparison(ctx, only.op, label);
        return { setup: rhs.setup, expr: `var.${name} ${only.op} ${rhs.operand}` };
      }
    }
    if (only.type === 'macro' && !only.flags.includes('/') && only.args.length === 1) {
      const def = getPrimaryDef(only.name);
      const varName = only.args[0] && staticText(only.args[0].nodes);
      if (def && varName !== null) {
        if (def.name === 'getvar') { noteTruthiness(ctx, label); return { setup: '', expr: `var.${localName(ctx, varName, label)}` }; }
        if (def.name === 'getglobalvar') { noteTruthiness(ctx, label); return { setup: '', expr: `var.${globalName(ctx, varName)}` }; }
        if (def.name === 'hasvar') return { setup: '', expr: `var.${localName(ctx, varName, label)} != ""` };
        if (def.name === 'hasglobalvar') return { setup: '', expr: `var.${globalName(ctx, varName)} != ""` };
      }
    }
  }
  noteTruthiness(ctx, label);
  return tempCondition(emitNodes(ctx, nodes));
}

/**
 * A condition already written for Marinara (for example by an earlier conversion). SillyTavern would read
 * it as plain text, but nobody writes `var.x == "on"` for SillyTavern, so it is kept and converting twice
 * changes nothing. ST shorthand operands (.x, $x) rule this out.
 */
function isMarinaraCondition(cond) {
  if (/(?:^|[\s(!&|=<>])[.$][a-zA-Z]/.test(cond)) return false;
  if (/(?:^|[\s(!&|])var[.:][\w.-]/.test(cond)) return true;
  if (/&&|\|\|/.test(cond)) return true;
  return /"[^"]*"/.test(cond) && /==|!=|>=|<=|[<>]|\bis\b|\bcontains\b|\bincludes\b/.test(cond);
}

/** Condition on a computed value: read it directly when it is one variable, else through a temp. */
function tempCondition(value) {
  const single = /^\{\{getvar::([\w.-]+)\}\}$/.exec(value);
  if (single) return { setup: '', expr: `var.${single[1]}` };
  return { setup: `{{setvar::${TEMP_IF}::${value}}}`, expr: `var.${TEMP_IF}` };
}

function noteTruthiness(ctx, label) {
  note(ctx, 'info', 'truthiness', label, 'Marinara는 값이 no, null, undefined일 때도 거짓으로 봐요 (SillyTavern은 빈 값, off, false, 0만 거짓).');
}

/** Split scoped {{if}} content on the first top-level {{else}} (mirrors splitOnTopLevelElse). */
function splitElse(nodes) {
  let depth = 0;
  for (let i = 0; i < nodes.length; i++) {
    const info = macroInfo(nodes[i]);
    if (!info) continue;
    if (info.name === 'if' && !info.isClosing && info.argCount === 1) depth++;
    else if (info.name === 'if' && info.isClosing) depth--;
    else if (info.name === 'else' && depth === 0) return { then: nodes.slice(0, i), otherwise: nodes.slice(i + 1) };
  }
  return { then: nodes, otherwise: null };
}

function emitIf(ctx, node, condArg, contentNodes) {
  const label = `{{if ${condArg.raw}}}`;
  let condNodes = condArg.nodes;
  let inverted = false;
  if (/^\s*!/.test(condArg.raw)) {
    inverted = true;
    const stripped = condArg.raw.replace(/^\s*!\s*/, '');
    condNodes = parseDocument(stripped);
  }
  const { then, otherwise } = splitElse(contentNodes);
  let thenNodes = then;
  let elseNodes = otherwise;
  if (!node.flags.includes('#')) {
    thenNodes = trimScopedNodes(thenNodes);
    if (elseNodes) elseNodes = trimScopedNodes(elseNodes);
  }
  if (inverted) [thenNodes, elseNodes] = [elseNodes || [], thenNodes];
  const cond = convertCondition(ctx, condNodes, label);
  if ('constant' in cond) return cond.constant ? emitNodes(ctx, thenNodes) : emitNodes(ctx, elseNodes || []);
  const thenText = emitNodes(ctx, thenNodes);
  const elseText = elseNodes && elseNodes.length ? emitNodes(ctx, elseNodes) : '';
  return `${cond.setup}{{#if ${cond.expr}}}${thenText}${elseText ? `{{else}}${elseText}` : ''}{{/if}}`;
}

/** ST {{random}} / {{pick}} list semantics → list of node lists, one per choice. */
function randomItems(ctx, args, label) {
  if (args.length !== 1) return args.map((a) => a.nodes);
  const single = staticText(args[0].nodes);
  if (single === null) {
    note(ctx, 'warn', 'random-dynamic', label, '항목 목록이 매크로로 만들어져서 쉼표로 나누지 못해요. 값 전체를 하나의 항목으로 넣었어요.');
    return [args[0].nodes];
  }
  const parts = single.includes('::')
    ? single.split('::').map((s) => s.trim())
    : single.replace(/\\,/g, '\u0000').split(',').map((s) => s.trim().replace(/\u0000/g, ','));
  return parts.map((p) => [{ type: 'text', value: p }]);
}

function emitRandomChoice(ctx, items) {
  if (items.length === 0) return '';
  const texts = items.map((nodes) => {
    let t = emitNodes(ctx, nodes);
    // Marinara reads a trailing @number as a weight; SillyTavern does not.
    if (/@(?:\d+|\d*\.\d+)$/.test(t)) t += ZWSP;
    return t;
  });
  if (texts.length === 1) return texts[0];
  return `{{random::${texts.join('::')}}}`;
}

function emitRoll(ctx, formulaNodes, label) {
  const formula = staticText(formulaNodes);
  if (formula === null) {
    note(ctx, 'error', 'roll-dynamic', label, '주사위 식이 매크로로 만들어져서 바꾸지 못했어요.');
    return '';
  }
  let f = formula.trim();
  if (/^\d+$/.test(f)) f = `1d${f}`;
  const m = /^(\d*)d(\d+)(?:([+-])(\d+))?$/i.exec(f);
  if (!m) {
    note(ctx, 'error', 'roll-formula', label, `주사위 식 "${formula}"은(는) Marinara에서 지원하지 않아요.`);
    return '';
  }
  const dice = `{{roll:${m[1] || '1'}d${m[2]}}}`;
  if (!m[3]) return dice;
  const mod = (m[3] === '-' ? '-' : '') + m[4];
  return `{{setvar::${TEMP_ROLL}::${dice}}}{{addnumvar::${TEMP_ROLL}::${mod}}}{{getvar::${TEMP_ROLL}}}`;
}

function emitPick(ctx, items, label) {
  if (items.length === 0) return '';
  const index = ctx.pickIndex++;
  const name = `${BRIDGE_PREFIX}pick_${shortHash(`${ctx.scopeKey}|${index}|${label}`)}`;
  note(ctx, 'info', 'pick', label, `{{pick}}은 채팅마다 한 번 고른 값을 변수 ${name}에 저장해 유지해요.`);
  return `{{#if var.${name} == ""}}{{setvar::${name}::${emitRandomChoice(ctx, items)}}}{{/if}}{{getvar::${name}}}`;
}

function emitComment(text) {
  if (!text || text.includes('}}') || text.includes('{{')) return '';
  return `{{// ${text}}}`;
}

const UNSUPPORTED_VALUE_DEFAULTS = {
  exampleSeparator: '***', chatStart: '<START>',
};

function emitMacro(ctx, node, scopedNodes, closing) {
  const scoped = scopedNodes ? { nodes: scopedNodes, closing } : null;
  const def = getMacroDef(node.name);
  const primary = getPrimaryDef(node.name);
  const label = node.source.length > 80 ? `${node.source.slice(0, 77)}...` : node.source;
  if (!def) {
    // SillyTavern leaves unknown macros as written; so does Marinara unless it knows the name.
    note(ctx, 'info', 'unknown-macro', label, `SillyTavern 기본 매크로가 아니에요 (다른 확장 매크로일 수 있어요). 그대로 두었어요.`);
    return emitRaw(ctx, node, scoped);
  }
  const args = node.args.slice();
  if (scopedNodes) {
    // Scoped content is trimmed and dedented unless the # flag asks to keep whitespace.
    const preserve = node.flags.includes('#');
    const trimmed = preserve || primary?.name === 'if' ? scopedNodes : trimScopedNodes(scopedNodes);
    args.push({ raw: '', nodes: trimmed, scoped: true, preserve, trimEdges: !preserve && primary?.name !== 'if' && hasDynamicEdges(trimmed) });
  }
  if (!argsValid(primary, args.length) || !argTypesValid(primary, args)) {
    note(ctx, 'warn', 'arity', label, `SillyTavern에서도 인자 개수가 맞지 않아 글자 그대로 출력되는 매크로예요. Marinara에서도 실행되지 않게 그대로 두었어요.`);
    return emitRaw(ctx, node, scoped, { inertOuter: true });
  }
  const a = (i) => args[i];
  const text = (i) => {
    const value = emitNodes(ctx, args[i].nodes);
    return args[i].trimEdges ? `{{trimStart}}${value}{{trimEnd}}` : value;
  };
  const lit = (i) => staticText(args[i].nodes);
  const name = primary.name;
  switch (name) {
    // core
    case 'space': {
      const n = args.length ? Number(lit(0)) : 1;
      return ' '.repeat(Number.isFinite(n) && n > 0 ? n : 1);
    }
    case 'newline': {
      const n = args.length ? Number(lit(0)) : 1;
      return '{{newline}}'.repeat(Number.isFinite(n) && n > 0 ? n : 1);
    }
    case 'noop': return '';
    case 'trim':
      // Scoped content is trimmed; the plain form removes the line breaks around it.
      if (args.length && a(0).scoped) return `{{trimStart}}${text(0)}{{trimEnd}}`;
      return '{{trimEnd}}{{trimStart}}';
    case 'if': return emitIf(ctx, node, a(0), a(1).nodes);
    case 'else': return '';
    case 'input':
      note(ctx, 'info', 'input', label, 'Marinara의 {{input}}은 마지막 사용자 메시지예요 (SillyTavern은 입력창 내용).');
      return '{{input}}';
    case 'maxPrompt': case 'maxContext': case 'maxResponse': return bridgeVar(ctx, name);
    case 'reverse': {
      const value = lit(0);
      if (value !== null) return emitText(Array.from(value).reverse().join(''));
      note(ctx, 'error', 'reverse-dynamic', label, '매크로로 만든 값은 뒤집지 못해요. 원래 순서대로 넣었어요.');
      return text(0);
    }
    case '//': {
      const value = lit(0);
      return value === null ? '' : emitComment(value.trim());
    }
    case 'roll': return emitRoll(ctx, a(0).nodes, label);
    case 'random': return emitRandomChoice(ctx, randomItems(ctx, args, label));
    case 'pick': return emitPick(ctx, randomItems(ctx, args, label), label);
    case 'banned':
      note(ctx, 'info', 'banned', label, 'Marinara는 {{banned}}를 지원하지 않아 지웠어요.');
      return '';
    case 'outlet': return `{{outlet::${text(0)}}}`;
    // names / card
    case 'user': return '{{user}}';
    case 'char': return '{{char}}';
    case 'group':
      return '{{char}}{{#if group}}, {{group}}{{/if}}';
    case 'groupNotMuted':
      return '{{char}}{{#if group}}, {{group}}{{/if}}';
    case 'notChar': return '{{#if group}}{{group}}{{else}}{{user}}{{/if}}';
    case 'charPrompt': return '{{charSysInfo}}';
    case 'charInstruction': return '{{charPostHistory}}';
    case 'charDescription': return '{{description}}';
    case 'charPersonality': return '{{personality}}';
    case 'charScenario': return '{{scenario}}';
    case 'persona': return '{{personaDescription}}';
    case 'mesExamplesRaw': case 'mesExamples': return '{{example}}';
    case 'charDepthPrompt': return bridgeVar(ctx, 'charDepthPrompt');
    case 'charCreatorNotes': return bridgeVar(ctx, 'charCreatorNotes');
    case 'charVersion': return bridgeVar(ctx, 'charVersion');
    case 'charFirstMessage': {
      const idx = args.length ? lit(0) : '0';
      const n = Number(idx);
      if (idx === null || !Number.isInteger(n) || n < 0) {
        note(ctx, 'error', 'greeting-index', label, '인사말 번호가 고정된 숫자가 아니라서 첫 인사말을 넣었어요.');
        return bridgeVar(ctx, 'greeting_0', { kind: 'greeting', index: 0 });
      }
      return bridgeVar(ctx, `greeting_${n}`, { kind: 'greeting', index: n });
    }
    case 'model': return '{{model}}';
    case 'original': return '';
    case 'isMobile': return bridgeVar(ctx, 'isMobile');
    // state
    case 'lastGenerationType':
      note(ctx, 'info', 'generation-type', label, 'Marinara가 붙이는 생성 종류 이름은 SillyTavern과 다를 수 있어요.');
      return '{{lastGenerationType}}';
    case 'hasExtension':
      note(ctx, 'warn', 'has-extension', label, 'Marinara에는 SillyTavern 확장이 없어서 항상 false로 바꿨어요.');
      return 'false';
    // chat
    case 'lastMessage': case 'lastMessageId': case 'lastUserMessage': case 'lastCharMessage':
    case 'firstIncludedMessageId': case 'firstDisplayedMessageId': case 'lastSwipeId': case 'currentSwipeId':
    case 'allChatRange':
      return bridgeVar(ctx, name);
    // time
    case 'time': {
      if (!args.length) {
        note(ctx, 'info', 'time-format', label, 'Marinara의 {{time}}은 24시간 HH:MM 형식이에요.');
        return '{{time}}';
      }
      const spec = lit(0);
      const m = spec === null ? null : /^UTC([+-]\d+)$/.exec(spec.trim());
      if (!m) return '{{time}}';
      const offset = Number.parseInt(m[1], 10);
      return bridgeVar(ctx, `time_utc${offset < 0 ? 'm' : 'p'}${Math.abs(offset)}`, { kind: 'utcTime', offset });
    }
    case 'date':
      note(ctx, 'info', 'date-format', label, 'Marinara의 {{date}}는 YYYY-MM-DD 형식이에요.');
      return '{{date}}';
    case 'weekday': return '{{weekday}}';
    case 'isotime': return '{{time}}';
    case 'isodate': return '{{date}}';
    case 'datetimeformat': {
      const format = lit(0);
      if (format === null) {
        note(ctx, 'error', 'datetime-dynamic', label, '날짜 형식이 매크로로 만들어져서 바꾸지 못했어요.');
        return '{{datetime}}';
      }
      return bridgeVar(ctx, `dtf_${shortHash(format)}`, { kind: 'datetimeformat', format });
    }
    case 'idleDuration': return '{{idle_duration}}';
    case 'timeDiff':
      note(ctx, 'error', 'time-diff', label, 'Marinara에는 두 시간의 차이를 구하는 매크로가 없어 지웠어요.');
      return '';
    // variables
    case 'setvar': case 'setglobalvar':
      return `{{setvar::${varNameArg(ctx, a(0), label, name === 'setglobalvar')}::${text(1)}}}`;
    case 'addvar': case 'addglobalvar':
      return `{{addvar::${varNameArg(ctx, a(0), label, name === 'addglobalvar')}::${text(1)}}}`;
    case 'incvar': case 'incglobalvar': case 'decvar': case 'decglobalvar': {
      const v = varNameArg(ctx, a(0), label, name.endsWith('globalvar'));
      return `{{addvar::${v}::${name.startsWith('inc') ? 1 : -1}}}{{getvar::${v}}}`;
    }
    case 'getvar': case 'getglobalvar':
      return `{{getvar::${varNameArg(ctx, a(0), label, name === 'getglobalvar')}}}`;
    case 'hasvar': case 'hasglobalvar': {
      const v = varNameArg(ctx, a(0), label, name === 'hasglobalvar');
      return `{{#if var.${v} != ""}}true{{else}}false{{/if}}`;
    }
    case 'deletevar': case 'deleteglobalvar':
      return `{{setvar::${varNameArg(ctx, a(0), label, name === 'deleteglobalvar')}::}}`;
    case 'setvarkey': case 'getvarkey': case 'setglobalvarkey': case 'getglobalvarkey':
      note(ctx, 'error', 'var-key', label, 'Marinara 변수는 JSON 배열/객체 안의 값을 읽고 쓰지 못해요. 이 매크로는 지웠어요.');
      return '';
    // instruct / context templates (text completion settings)
    case 'exampleSeparator': case 'chatStart':
      note(ctx, 'info', 'context-template', label, 'SillyTavern 컨텍스트 템플릿 기본값으로 바꿨어요.');
      return UNSUPPORTED_VALUE_DEFAULTS[name];
    default:
      if (/^instruct|^defaultSystemPrompt$|^systemPrompt$/.test(name)) {
        note(ctx, 'info', 'instruct', label, '텍스트 완성용 Instruct/시스템 프롬프트 설정값이라 Marinara에서는 비워요.');
        return '';
      }
      note(ctx, 'warn', 'unmapped', label, '대응하는 Marinara 매크로가 없어 그대로 두었어요.');
      return emitRaw(ctx, node, scoped);
  }
}

/** Legacy forms SillyTavern rewrites before parsing (MacroEngine pre-processors). */
function preprocess(text) {
  return text
    .replace(/{{time_(UTC[+-]\d+)}}/gi, (_m, offset) => `{{time::${offset}}}`)
    .replace(/<USER>/gi, '{{user}}')
    .replace(/<BOT>/gi, '{{char}}')
    .replace(/<CHAR>/gi, '{{char}}')
    .replace(/<GROUP>/gi, '{{group}}')
    .replace(/<CHARIFNOTGROUP>/gi, '{{group}}');
}

/** Escaped braces become real braces; a zero-width space keeps them from forming a macro. */
function finalize(text) {
  return text.replace(/[\uE000\uE001]/g, (ch, offset, whole) => {
    const brace = ch === ESC_OPEN ? '{' : '}';
    const next = whole[offset + 1];
    const forms = (brace === '{' && (next === '{' || next === ESC_OPEN)) || (brace === '}' && (next === '}' || next === ESC_CLOSE));
    return forms ? brace + ZWSP : brace;
  });
}

/**
 * Convert SillyTavern macro text to Marinara macro text.
 * @param {string} text
 * @param {{ scopeKey?: string, mark?: boolean }} [options] scopeKey keeps generated {{pick}} names stable per prompt;
 *   mark: false leaves out the leading CONVERTED_MARK comment.
 * @returns {{ text: string, changed: boolean, notes: Array<{level:string, code:string, macro:string, message:string}>, bridge: string[], bridgeParams: Record<string, object>, globals: string[] }}
 */
function convertStMacros(text, options = {}) {
  const source = String(text ?? '');
  const ctx = createContext(options);
  if (source.startsWith(CONVERTED_MARK)) {
    return { text: source, changed: false, alreadyConverted: true, notes: [], bridge: [], bridgeParams: {}, globals: [] };
  }
  if (!source.includes('{{') && !/\\[{}]|<(?:USER|BOT|CHAR|GROUP|CHARIFNOTGROUP)>/i.test(source)) {
    return { text: source, changed: false, notes: [], bridge: [], bridgeParams: {}, globals: [] };
  }
  const converted = finalize(emitNodes(ctx, parseDocument(preprocess(source))));
  const changed = converted !== source;
  const out = changed && options.mark !== false ? CONVERTED_MARK + converted : converted;
  return {
    text: out,
    changed,
    notes: ctx.notes,
    bridge: [...ctx.bridge],
    bridgeParams: ctx.bridgeParams,
    globals: [...ctx.globals],
  };
}

export { convertStMacros, parseDocument, BRIDGE_PREFIX, GLOBAL_PREFIX, CONVERTED_MARK };
