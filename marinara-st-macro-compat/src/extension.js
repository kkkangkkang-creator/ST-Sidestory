/* Marinara full-page extension: converts SillyTavern macros in presets and runs the bridge.
 * Runs inside Marinara's async extension wrapper, so `marinara`, `document` and `window` are in scope.
 */

const STMC_ROOT_ID = 'stmc-root';
const STMC_DEFAULTS = { bridgeEnabled: true, presets: {}, extra: { bridge: [], params: {}, globals: [] }, globals: {}, launcher: null };
const STMC_SUFFIX = ' (Marinara 매크로)';
const LEVEL_LABELS = { error: '지원 안 됨', warn: '확인 필요', info: '참고' };

const stmcApi = createApi(marinara);

async function stmcLoadState() {
  const saved = await marinara.storage.get();
  return { ...STMC_DEFAULTS, ...saved };
}

async function stmcSaveState(patch) {
  return marinara.storage.patch(patch);
}

installBridge({
  marinara,
  api: stmcApi,
  loadState: stmcLoadState,
  saveGlobals: async (updates) => {
    const state = await stmcLoadState();
    await stmcSaveState({ globals: { ...state.globals, ...updates } });
  },
});

// ── Conversion of a whole preset ───────────────────────────────

function stmcParse(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** Convert every section of a preset; nothing is written. */
async function stmcAnalyzePreset(presetId) {
  const full = await stmcApi(`/prompts/${encodeURIComponent(presetId)}/full`);
  const sections = (full.sections ?? []).map((section) => {
    const content = section.content ?? '';
    const result = convertStMacros(content, { scopeKey: section.identifier || section.id });
    return { id: section.id, identifier: section.identifier, name: section.name, enabled: String(section.enabled) !== 'false', before: content, ...result };
  });
  const bridge = new Set();
  const globals = new Set();
  const params = {};
  for (const s of sections) {
    s.bridge.forEach((name) => bridge.add(name));
    s.globals.forEach((name) => globals.add(name));
    Object.assign(params, s.bridgeParams);
  }
  return { preset: full.preset, sections, bridge: [...bridge], globals: [...globals], params };
}

async function stmcApplyConversion(analysis, { inPlace }) {
  let presetId = analysis.preset.id;
  let sectionIds = new Map(analysis.sections.map((s) => [s.id, s.id]));
  let name = analysis.preset.name;
  if (!inPlace) {
    const copy = await stmcApi(`/prompts/${encodeURIComponent(presetId)}/duplicate`, { method: 'POST' });
    presetId = copy.id;
    name = `${analysis.preset.name.replace(/ \(Copy\)$/, '').slice(0, 200 - STMC_SUFFIX.length)}${STMC_SUFFIX}`;
    await stmcApi(`/prompts/${encodeURIComponent(presetId)}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    // The copy keeps section order, so sections pair up by position.
    const copied = await stmcApi(`/prompts/${encodeURIComponent(presetId)}/full`);
    const ordered = copied.sections ?? [];
    sectionIds = new Map(analysis.sections.map((s, i) => [s.id, ordered[i]?.identifier === s.identifier ? ordered[i].id : null]));
  }
  let written = 0;
  for (const section of analysis.sections) {
    if (!section.changed) continue;
    const targetId = sectionIds.get(section.id);
    if (!targetId) throw new Error(`복사본에서 "${section.name}" 섹션을 찾지 못했어요.`);
    await stmcApi(`/prompts/${encodeURIComponent(presetId)}/sections/${encodeURIComponent(targetId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: section.text }),
    });
    written++;
  }
  const state = await stmcLoadState();
  const entry = { name, sourceId: analysis.preset.id, convertedAt: new Date().toISOString(), bridge: analysis.bridge, params: analysis.params, globals: analysis.globals };
  await stmcSaveState({ presets: { ...state.presets, [presetId]: entry } });
  return { presetId, name, written };
}

// ── UI ─────────────────────────────────────────────────────────

const STMC_CSS = `
#stmc-root { --stmc-bg: var(--background, #120f1a); --stmc-fg: var(--foreground, #e5e5e5); --stmc-card: var(--secondary, #1f1b2c);
  --stmc-muted: var(--muted-foreground, #a1a1aa); --stmc-accent: var(--primary, #ec4b97); --stmc-accent-fg: var(--primary-foreground, #0a0a0a);
  --stmc-border: var(--border, rgba(255,255,255,.12)); --stmc-radius: var(--radius, .75rem);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--stmc-fg); }
#stmc-root * { box-sizing: border-box; }
.stmc-launcher { position: fixed; z-index: 2147483000; right: 0; top: 42%; border: 1px solid var(--stmc-border); border-right: 0;
  background: var(--stmc-card); color: var(--stmc-fg); border-radius: 10px 0 0 10px; padding: 8px 6px; font-weight: 600; font-size: 11px;
  writing-mode: vertical-rl; letter-spacing: .04em; cursor: pointer; opacity: .7; box-shadow: 0 2px 10px rgba(0,0,0,.25); touch-action: none; }
.stmc-launcher.moved { writing-mode: horizontal-tb; border-right: 1px solid var(--stmc-border); border-radius: 999px; padding: 6px 12px; }
.stmc-launcher:hover, .stmc-launcher:focus-visible { opacity: 1; }
.stmc-backdrop { position: fixed; inset: 0; z-index: 2147483001; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
.stmc-dialog { background: var(--stmc-bg); border: 1px solid var(--stmc-border); border-radius: var(--stmc-radius); width: min(820px, 100%);
  max-height: min(88vh, 900px); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.stmc-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--stmc-border); flex-shrink: 0; }
.stmc-head h2 { font-size: 16px; margin: 0; flex: 1; }
.stmc-tabs { display: flex; gap: 4px; padding: 8px 18px 0; border-bottom: 1px solid var(--stmc-border); overflow-x: auto; flex-shrink: 0; }
.stmc-tab { background: none; border: 0; color: var(--stmc-muted); padding: 8px 12px; border-bottom: 2px solid transparent; cursor: pointer; font: inherit; white-space: nowrap; }
.stmc-tab[aria-selected="true"] { color: var(--stmc-fg); border-bottom-color: var(--stmc-accent); }
.stmc-body { padding: 16px 18px 20px; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.stmc-stack { display: flex; flex-direction: column; gap: 14px; }
.stmc-stack.tight { gap: 8px; }
.stmc-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.stmc-btn { border: 1px solid var(--stmc-border); background: var(--stmc-card); color: var(--stmc-fg); border-radius: 8px; padding: 7px 14px; font: inherit; cursor: pointer; }
.stmc-btn:disabled { opacity: .5; cursor: default; }
.stmc-btn.primary { background: var(--stmc-accent); color: var(--stmc-accent-fg); border-color: transparent; font-weight: 600; }
.stmc-btn.ghost { background: none; }
.stmc-btn.small { padding: 3px 9px; font-size: 12px; white-space: nowrap; }
.stmc-select, .stmc-textarea { width: 100%; background: var(--stmc-card); color: var(--stmc-fg); border: 1px solid var(--stmc-border); border-radius: 8px; padding: 8px 10px; font: inherit; }
.stmc-select { flex: 1; min-width: 200px; width: auto; }
.stmc-textarea { min-height: 140px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; resize: vertical; }
.stmc-hint { color: var(--stmc-muted); font-size: 12.5px; margin: 0; }
.stmc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.stmc-stat { background: var(--stmc-card); border: 1px solid var(--stmc-border); border-radius: 10px; padding: 10px 12px; }
.stmc-stat b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }
.stmc-stat span { color: var(--stmc-muted); font-size: 12px; }
.stmc-card { background: var(--stmc-card); border: 1px solid var(--stmc-border); border-radius: 10px; padding: 10px 12px; }
.stmc-card h3 { font-size: 13px; margin: 0 0 6px; }
.stmc-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.stmc-note { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 12.5px; }
.stmc-badge { font-size: 11px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--stmc-border); white-space: nowrap; align-self: start; }
.stmc-badge.error { color: #ff8a8a; border-color: #ff8a8a66; }
.stmc-badge.warn { color: #f5c46b; border-color: #f5c46b66; }
.stmc-badge.info { color: var(--stmc-muted); }
.stmc-badge.ok { color: #7fd6a4; border-color: #7fd6a466; }
.stmc-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; color: var(--stmc-muted); }
.stmc-section { border: 1px solid var(--stmc-border); border-radius: 10px; }
.stmc-section summary { cursor: pointer; padding: 8px 12px; display: flex; gap: 8px; align-items: center; list-style: none; }
.stmc-section summary::-webkit-details-marker { display: none; }
.stmc-section summary .name { flex: 1; overflow-wrap: anywhere; }
.stmc-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 12px 12px; }
.stmc-diff pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--stmc-bg); border: 1px solid var(--stmc-border); border-radius: 8px; padding: 8px; max-height: 320px; overflow: auto; }
.stmc-diff h4 { margin: 0 0 4px; font-size: 11.5px; color: var(--stmc-muted); font-weight: 500; }
.stmc-msg { border-radius: 8px; padding: 9px 12px; font-size: 13px; }
.stmc-msg.ok { background: #1f3b2c; color: #c9f2da; }
.stmc-msg.err { background: #3b1f24; color: #ffd0d6; }
.stmc-switch { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
.stmc-switch input { margin-top: 3px; accent-color: var(--stmc-accent); }
.stmc-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.stmc-table td { border-top: 1px solid var(--stmc-border); padding: 6px 4px; vertical-align: top; overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .stmc-backdrop { padding: 0; align-items: stretch; }
  .stmc-dialog { max-height: none; height: 100%; border-radius: 0; }
  .stmc-diff { grid-template-columns: 1fr; }
}
`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

function noteList(notes, withSection) {
  if (!notes.length) return el('p', { class: 'stmc-hint' }, '안내할 내용이 없어요.');
  // One line per message, listing every macro (and section) it applies to.
  const grouped = new Map();
  for (const n of notes) {
    const key = `${n.level}|${n.code}|${n.message}`;
    const entry = grouped.get(key) ?? { ...n, macros: new Set(), sections: new Set() };
    entry.macros.add(n.macro);
    if (n.section) entry.sections.add(n.section);
    grouped.set(key, entry);
  }
  const order = { error: 0, warn: 1, info: 2 };
  const items = [...grouped.values()].sort((a, b) => order[a.level] - order[b.level]);
  const list = (set, max) => [...set].slice(0, max).join(', ') + (set.size > max ? ` 외 ${set.size - max}개` : '');
  return el('ul', { class: 'stmc-notes' }, items.map((n) => el('li', { class: 'stmc-note' },
    el('span', { class: `stmc-badge ${n.level}` }, LEVEL_LABELS[n.level]),
    el('div', {}, n.message,
      el('div', { class: 'stmc-code' }, list(n.macros, 4), withSection && n.sections.size ? ` · ${list(n.sections, 3)}` : '')),
  )));
}

function renderPresetTab(body, ui) {
  const select = el('select', { class: 'stmc-select', 'aria-label': '변환할 프리셋' }, el('option', { value: '' }, '불러오는 중…'));
  const checkBtn = el('button', { class: 'stmc-btn', type: 'button', disabled: true }, '검사하기');
  const result = el('div', { class: 'stmc-stack' });
  body.append(
    el('p', { class: 'stmc-hint' }, 'SillyTavern에서 가져온 프리셋의 매크로를 Marinara 문법으로 바꿔요. 먼저 검사해서 무엇이 바뀌는지 확인한 뒤 적용할 수 있어요.'),
    el('div', { class: 'stmc-row' }, select, checkBtn),
    result,
  );
  stmcApi('/prompts').then((presets) => {
    const list = (Array.isArray(presets) ? presets : []).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    select.replaceChildren(el('option', { value: '' }, list.length ? '프리셋을 고르세요' : '프리셋이 없어요'),
      ...list.map((p) => el('option', { value: p.id }, p.name)));
    if (ui.lastPresetId && list.some((p) => p.id === ui.lastPresetId)) select.value = ui.lastPresetId;
    checkBtn.disabled = !select.value;
  }).catch((error) => result.replaceChildren(el('div', { class: 'stmc-msg err' }, `프리셋 목록을 불러오지 못했어요: ${error.message}`)));
  select.addEventListener('change', () => { checkBtn.disabled = !select.value; ui.lastPresetId = select.value; });
  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    result.replaceChildren(el('p', { class: 'stmc-hint' }, '검사하는 중…'));
    try {
      const analysis = await stmcAnalyzePreset(select.value);
      renderAnalysis(result, analysis, () => checkBtn.click());
    } catch (error) {
      result.replaceChildren(el('div', { class: 'stmc-msg err' }, `검사하지 못했어요: ${error.message}`));
    } finally {
      checkBtn.disabled = !select.value;
    }
  });
}

function renderAnalysis(container, analysis, rerun) {
  const changed = analysis.sections.filter((s) => s.changed);
  const alreadyConverted = analysis.sections.filter((s) => s.alreadyConverted);
  const notes = analysis.sections.flatMap((s) => s.notes.map((n) => ({ ...n, section: s.name })));
  const count = (level) => notes.filter((n) => n.level === level).length;
  const status = el('div');
  const copyBtn = el('button', { class: 'stmc-btn primary', type: 'button', disabled: !changed.length }, '변환한 사본 만들기');
  const inPlaceBtn = el('button', { class: 'stmc-btn ghost', type: 'button', disabled: !changed.length }, '원본에 바로 적용');
  const run = async (inPlace) => {
    if (inPlace && !window.confirm(`"${analysis.preset.name}"의 섹션 ${changed.length}개를 바로 고쳐요. 되돌리려면 직접 수정해야 해요. 계속할까요?`)) return;
    copyBtn.disabled = true;
    inPlaceBtn.disabled = true;
    status.replaceChildren(el('p', { class: 'stmc-hint' }, '적용하는 중…'));
    try {
      const done = await stmcApplyConversion(analysis, { inPlace });
      status.replaceChildren(el('div', { class: 'stmc-msg ok' },
        `"${done.name}"에 섹션 ${done.written}개를 변환해 저장했어요. 채팅 설정에서 이 프리셋을 고르면 바로 쓸 수 있어요.`,
        analysis.bridge.length || analysis.globals.length ? ' 마지막 메시지 같은 값은 생성할 때마다 이 확장이 채워 넣어요.' : ''));
    } catch (error) {
      status.replaceChildren(el('div', { class: 'stmc-msg err' }, `적용하지 못했어요: ${error.message}`));
      copyBtn.disabled = false;
      inPlaceBtn.disabled = false;
    }
  };
  copyBtn.addEventListener('click', () => run(false));
  inPlaceBtn.addEventListener('click', () => run(true));
  container.replaceChildren(...[
    el('div', { class: 'stmc-stats' },
      el('div', { class: 'stmc-stat' }, el('b', {}, String(analysis.sections.length)), el('span', {}, '전체 섹션')),
      el('div', { class: 'stmc-stat' }, el('b', {}, String(changed.length)), el('span', {}, '바뀌는 섹션')),
      el('div', { class: 'stmc-stat' }, el('b', {}, String(count('warn'))), el('span', {}, '확인할 곳')),
      el('div', { class: 'stmc-stat' }, el('b', {}, String(count('error'))), el('span', {}, '지원 안 되는 곳')),
    ),
    changed.length ? null : el('div', { class: 'stmc-msg ok' }, alreadyConverted.length
      ? '이미 변환한 프리셋이에요. 그대로 쓰면 돼요.'
      : '바꿀 SillyTavern 매크로가 없어요. 이 프리셋은 그대로 써도 돼요.'),
    changed.length && alreadyConverted.length ? el('p', { class: 'stmc-hint' }, `이미 변환한 섹션 ${alreadyConverted.length}개는 건너뛰어요.`) : null,
    el('div', { class: 'stmc-card' }, el('h3', {}, '안내'), noteList(notes, true)),
    analysis.bridge.length || analysis.globals.length ? el('div', { class: 'stmc-card' },
      el('h3', {}, '생성할 때 채워 넣는 값'),
      el('p', { class: 'stmc-hint' }, 'Marinara에 없는 매크로는 채팅 변수로 바꿨어요. 이 확장이 켜져 있으면 생성 직전에 값을 채워요.'),
      el('div', { class: 'stmc-code' }, [...analysis.bridge, ...analysis.globals].join(', '))) : null,
    el('div', { class: 'stmc-row' }, copyBtn, inPlaceBtn, el('button', { class: 'stmc-btn ghost', type: 'button', onclick: rerun }, '다시 검사')),
    status,
    changed.length ? el('div', { class: 'stmc-stack tight' },
      el('h3', { style: 'font-size:13px;margin:4px 0 0' }, '바뀌는 섹션'),
      changed.map((s) => el('details', { class: 'stmc-section' },
        el('summary', {}, el('span', { class: 'name' }, s.name || s.identifier),
          s.enabled ? null : el('span', { class: 'stmc-badge info' }, '꺼짐'),
          s.notes.some((n) => n.level === 'error') ? el('span', { class: 'stmc-badge error' }, '확인 필요') : el('span', { class: 'stmc-badge ok' }, '변환됨')),
        el('div', { class: 'stmc-diff' },
          el('div', {}, el('h4', {}, 'SillyTavern'), el('pre', {}, s.before)),
          el('div', {}, el('h4', {}, 'Marinara'), el('pre', {}, s.text.replace(/\u200B/g, '')))),
      ))) : null,
  ].filter(Boolean));
}

function renderTextTab(body) {
  const input = el('textarea', { class: 'stmc-textarea', placeholder: '{{.mode = on}}{{if .mode}}…{{/if}}', 'aria-label': 'SillyTavern 텍스트', spellcheck: 'false' });
  const output = el('textarea', { class: 'stmc-textarea', readonly: true, 'aria-label': 'Marinara 텍스트', spellcheck: 'false' });
  const notes = el('div');
  const copyBtn = el('button', { class: 'stmc-btn small', type: 'button' }, '복사');
  const update = () => {
    const result = convertStMacros(input.value);
    output.value = result.text;
    notes.replaceChildren(input.value.trim() ? noteList(result.notes, false) : el('p', { class: 'stmc-hint' }, ''));
  };
  input.addEventListener('input', update);
  copyBtn.addEventListener('click', async () => {
    // Text pasted elsewhere (lorebooks, cards) may read bridge values in any chat.
    const result = convertStMacros(input.value);
    if (result.bridge.length || result.globals.length) {
      const state = await stmcLoadState();
      const extra = state.extra ?? STMC_DEFAULTS.extra;
      await stmcSaveState({ extra: {
        bridge: [...new Set([...extra.bridge, ...result.bridge])],
        params: { ...extra.params, ...result.bridgeParams },
        globals: [...new Set([...extra.globals, ...result.globals])],
      } });
    }
    try { await navigator.clipboard.writeText(output.value); copyBtn.textContent = '복사했어요'; } catch { output.select(); }
    setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
  });
  body.append(
    el('p', { class: 'stmc-hint' }, '로어북 항목이나 캐릭터 카드처럼 프리셋 밖에 있는 글도 여기에 붙여 넣어 바꿀 수 있어요. 복사 버튼으로 가져가면 마지막 메시지 같은 값도 모든 채팅에서 채워져요.'),
    input,
    el('div', { class: 'stmc-row' }, el('strong', { style: 'flex:1;font-size:13px' }, 'Marinara 문법'), copyBtn),
    output,
    notes,
  );
}

async function renderBridgeTab(body) {
  const state = await stmcLoadState();
  const toggle = el('input', { type: 'checkbox', checked: state.bridgeEnabled });
  toggle.addEventListener('change', () => stmcSaveState({ bridgeEnabled: toggle.checked }));
  const presets = Object.entries(state.presets ?? {});
  const globals = Object.entries(state.globals ?? {});
  const extraNames = [...(state.extra?.bridge ?? []), ...(state.extra?.globals ?? [])];
  const refresh = () => body.replaceChildren() || renderBridgeTab(body);
  body.append(
    el('label', { class: 'stmc-switch' }, toggle, el('span', {},
      el('strong', {}, '생성할 때 SillyTavern 값 채우기'),
      el('p', { class: 'stmc-hint' }, '변환한 프리셋을 쓰는 채팅에서, 생성 직전에 마지막 메시지·캐릭터 버전·날짜 형식 같은 값을 st_로 시작하는 채팅 변수에 넣어요. $전역 변수는 stg_로 시작하는 이름으로 모든 채팅에 이어져요.'))),
    el('div', { class: 'stmc-card' }, el('h3', {}, '변환한 프리셋'),
      presets.length ? el('table', { class: 'stmc-table' }, el('tbody', {}, presets.map(([id, entry]) => el('tr', {},
        el('td', {}, entry.name, el('div', { class: 'stmc-code' }, [...(entry.bridge ?? []), ...(entry.globals ?? [])].join(', ') || '채울 값 없음')),
        el('td', { style: 'width:1%' }, el('button', {
          class: 'stmc-btn small ghost', type: 'button',
          onclick: async () => {
            const next = { ...state.presets };
            delete next[id];
            await stmcSaveState({ presets: next });
            refresh();
          },
        }, '목록에서 빼기')))))) : el('p', { class: 'stmc-hint' }, '아직 변환한 프리셋이 없어요.')),
    extraNames.length ? el('div', { class: 'stmc-card' }, el('h3', {}, '텍스트 변환에서 가져간 값'),
      el('p', { class: 'stmc-hint' }, '로어북이나 카드에 붙여 넣은 글이 읽는 값이에요. 모든 채팅에서 생성 직전에 채워요.'),
      el('div', { class: 'stmc-row' }, el('div', { class: 'stmc-code', style: 'flex:1' }, extraNames.join(', ')),
        el('button', {
          class: 'stmc-btn small ghost', type: 'button',
          onclick: async () => {
            await stmcSaveState({ extra: STMC_DEFAULTS.extra });
            refresh();
          },
        }, '비우기'))) : null,
    el('div', { class: 'stmc-card' }, el('h3', {}, '전역 변수 ($)'),
      globals.length ? el('table', { class: 'stmc-table' }, el('tbody', {}, globals.map(([name, value]) => el('tr', {},
        el('td', { class: 'stmc-code', style: 'width:35%' }, name.replace(/^stg_/, '$')),
        el('td', {}, String(value)),
        el('td', { style: 'width:1%' }, el('button', {
          class: 'stmc-btn small ghost', type: 'button',
          onclick: async () => {
            const next = { ...state.globals };
            delete next[name];
            await stmcSaveState({ globals: next });
            refresh();
          },
        }, '지우기')))))) : el('p', { class: 'stmc-hint' }, '저장된 전역 변수가 없어요.')),
  );
}

function stmcMount() {
  document.getElementById(STMC_ROOT_ID)?.remove();
  const root = el('div', { id: STMC_ROOT_ID });
  root.append(el('style', {}, STMC_CSS));
  const launcher = el('button', { class: 'stmc-launcher', type: 'button', title: 'SillyTavern 매크로 변환 (드래그해서 옮길 수 있어요)' }, 'ST 매크로');
  root.append(launcher);
  document.body.append(root);
  const ui = { lastPresetId: '', tab: 'preset' };
  function placeLauncher(x, y) {
    launcher.classList.add('moved');
    const rect = launcher.getBoundingClientRect();
    const left = Math.min(Math.max(0, x), window.innerWidth - rect.width);
    const top = Math.min(Math.max(0, y), window.innerHeight - rect.height);
    Object.assign(launcher.style, { left: `${left}px`, top: `${top}px`, right: 'auto' });
  }

  stmcLoadState().then((state) => {
    if (state.launcher) placeLauncher(state.launcher.x, state.launcher.y);
  }).catch(() => {});

  // Drag to move; a short press opens the panel.
  let drag = null;
  launcher.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, rect: launcher.getBoundingClientRect(), moved: false };
    launcher.setPointerCapture(event.pointerId);
  });
  launcher.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    placeLauncher(drag.rect.left + dx, drag.rect.top + dy);
  });
  launcher.addEventListener('pointerup', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      const rect = launcher.getBoundingClientRect();
      stmcSaveState({ launcher: { x: Math.round(rect.left), y: Math.round(rect.top) } }).catch(() => {});
    } else {
      openPanel();
    }
  });
  launcher.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPanel(); }
  });

  function openPanel() {
    if (root.querySelector('.stmc-backdrop')) return;
    const body = el('div', { class: 'stmc-body' });
    const tabs = [['preset', '프리셋 변환'], ['text', '텍스트 변환'], ['bridge', '값 채우기']];
    const tabButtons = tabs.map(([id, label]) => el('button', { class: 'stmc-tab', type: 'button', role: 'tab', 'aria-selected': String(ui.tab === id), onclick: () => show(id) }, label));
    const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); launcher.focus(); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const backdrop = el('div', { class: 'stmc-backdrop', onclick: (event) => { if (event.target === backdrop) close(); } },
      el('div', { class: 'stmc-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'SillyTavern 매크로 변환' },
        el('div', { class: 'stmc-head' }, el('h2', {}, 'SillyTavern 매크로 변환'), el('button', { class: 'stmc-btn ghost small', type: 'button', onclick: close, 'aria-label': '닫기' }, '닫기')),
        el('div', { class: 'stmc-tabs', role: 'tablist' }, tabButtons),
        body));
    function show(id) {
      ui.tab = id;
      tabButtons.forEach((button, i) => button.setAttribute('aria-selected', String(tabs[i][0] === id)));
      body.replaceChildren();
      if (id === 'preset') renderPresetTab(body, ui);
      else if (id === 'text') renderTextTab(body);
      else renderBridgeTab(body).catch((error) => body.append(el('div', { class: 'stmc-msg err' }, error.message)));
    }
    document.addEventListener('keydown', onKey);
    root.append(backdrop);
    show(ui.tab);
  }

  marinara.onCleanup(() => root.remove());
}

stmcMount();
marinara.log.info('SillyTavern macro compatibility ready');
