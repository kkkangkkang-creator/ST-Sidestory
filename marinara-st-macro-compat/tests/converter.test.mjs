import test from 'node:test';
import assert from 'node:assert/strict';
import { convertStMacros, CONVERTED_MARK } from '../dist/converter.mjs';

const conv = (text) => convertStMacros(text, { mark: false }).text;

test('converts the variable shorthand and negated if', () => {
  assert.equal(
    conv('{{.main_statements = on}}{{#if !.macro_cleaner}}{{.order_error_core = on}}{{/if}}{{trim}}'),
    '{{setvar::main_statements::on}}{{#if var.macro_cleaner}}{{else}}{{setvar::order_error_core::on}}{{/if}}{{trimEnd}}{{trimStart}}',
  );
});

test('leaves text without macros untouched', () => {
  const result = convertStMacros('plain text { not a macro }');
  assert.equal(result.text, 'plain text { not a macro }');
  assert.equal(result.changed, false);
});

test('keeps Marinara-compatible macros as they are', () => {
  assert.equal(conv('{{user}} {{char}} {{setvar::a::1}}{{getvar::a}}'), '{{user}} {{char}} {{setvar::a::1}}{{getvar::a}}');
});

test('turns comparisons inside if into Marinara conditions', () => {
  assert.equal(conv('{{if {{.pov == first}}}}I{{else}}they{{/if}}'), '{{#if var.pov == "first"}}I{{else}}they{{/if}}');
});

test('folds conditions that SillyTavern always reads as literal text', () => {
  const result = convertStMacros('{{if .x == on}}yes{{/if}}', { mark: false });
  assert.equal(result.text, 'yes');
  assert.ok(result.notes.some((n) => n.code === 'constant-condition'));
});

test('maps global variables to stg_ chat variables', () => {
  const result = convertStMacros('{{$g = 1}}{{getglobalvar::g}}', { mark: false });
  assert.equal(result.text, '{{setvar::stg_g::1}}{{getvar::stg_g}}');
  assert.deepEqual(result.globals, ['stg_g']);
});

test('reads runtime-only macros from bridge variables', () => {
  const result = convertStMacros('{{lastMessage}} {{charFirstMessage::1}} {{datetimeformat::YYYY}}', { mark: false });
  assert.match(result.text, /^\{\{getvar::st_lastMessage\}\} \{\{getvar::st_greeting_1\}\} \{\{getvar::st_dtf_\w+\}\}$/);
  assert.deepEqual(result.bridgeParams.st_greeting_1, { kind: 'greeting', index: 1 });
});

test('keeps macros that also fail in SillyTavern from running in Marinara', () => {
  const out = conv('{{setvar::a::b::c}}');
  assert.equal(out.replace(/\u200B/g, ''), '{{setvar::a::b::c}}');
  assert.notEqual(out, '{{setvar::a::b::c}}');
});

test('dedents and trims scoped content', () => {
  assert.equal(conv('{{setvar::k}}\n  one\n  two\n{{/setvar}}'), '{{setvar::k::one\ntwo}}');
});

test('pick keeps one choice per chat', () => {
  const out = conv('{{pick::a::b}}');
  assert.match(out, /^\{\{#if var\.(st_pick_\w+) == ""\}\}\{\{setvar::\1::\{\{random::a::b\}\}\}\}\{\{\/if\}\}\{\{getvar::\1\}\}$/);
});

test('never throws or hangs on random input', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const alphabet = ['{{', '}}', '{', '}', ':', '::', '.', '$', '!', '#', '/', 'if', 'else', 'setvar', ' ', '\n', 'x', '=', '+', '|', '\\'];
  for (let i = 0; i < 3000; i++) {
    let text = '';
    const length = Math.floor(rand() * 30);
    for (let j = 0; j < length; j++) text += alphabet[Math.floor(rand() * alphabet.length)];
    assert.equal(typeof convertStMacros(text).text, 'string', text);
  }
});

test('marks converted text and leaves it alone the second time', () => {
  const once = convertStMacros('{{group}} {{.x = 1}}');
  assert.ok(once.text.startsWith(CONVERTED_MARK));
  const twice = convertStMacros(once.text);
  assert.equal(twice.text, once.text);
  assert.equal(twice.changed, false);
  assert.equal(twice.alreadyConverted, true);
});

test('keeps conditions already written for Marinara', () => {
  assert.equal(conv('{{#if var.mode == "dark"}}D{{else}}L{{/if}}'), '{{#if var.mode == "dark"}}D{{else}}L{{/if}}');
  assert.equal(conv('{{#if var.a && var.b}}AB{{/if}}'), '{{#if var.a && var.b}}AB{{/if}}');
});
