/* Runtime bridge: fills the `st_*` chat variables that converted presets read, right before
 * Marinara builds the prompt, and keeps SillyTavern-style global variables (`stg_*`) in the
 * extension's own storage so they follow the user across chats.
 *
 * computeBridgeValues is pure (tested in node); installBridge needs the Marinara page.
 */

const MAX_VARIABLE_LENGTH = 10000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(value, length = 2) {
  return String(Math.abs(Math.trunc(value))).padStart(length, '0');
}

function ordinal(n) {
  const b = n % 10;
  const suffix = Math.floor((n % 100) / 10) === 1 ? 'th' : b === 1 ? 'st' : b === 2 ? 'nd' : b === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function dayOfYear(d) {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1;
}

/** moment's week-of-year: `dow` is the first day of the week, `doy` decides which week holds Jan 1st. */
function weekOfYear(d, dow, doy) {
  const firstWeekOffset = (year) => {
    const fwd = 7 + dow - doy;
    const fwdlw = (7 + new Date(Date.UTC(year, 0, fwd)).getUTCDay() - dow) % 7;
    return -fwdlw + fwd - 1;
  };
  const daysInYear = (year) => ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);
  const weeksInYear = (year) => (daysInYear(year) - firstWeekOffset(year) + firstWeekOffset(year + 1)) / 7;
  const year = d.getFullYear();
  const week = Math.floor((dayOfYear(d) - firstWeekOffset(year) - 1) / 7) + 1;
  if (week < 1) return { week: week + weeksInYear(year - 1), year: year - 1 };
  if (week > weeksInYear(year)) return { week: week - weeksInYear(year), year: year + 1 };
  return { week, year };
}

// moment's default (en) locale starts weeks on Sunday; ISO weeks start on Monday.
const localeWeek = (d) => weekOfYear(d, 0, 6);
const isoWeek = (d) => weekOfYear(d, 1, 4);

const LONG_FORMATS = {
  LT: 'h:mm A', LTS: 'h:mm:ss A', L: 'MM/DD/YYYY', LL: 'MMMM D, YYYY', LLL: 'MMMM D, YYYY h:mm A',
  LLLL: 'dddd, MMMM D, YYYY h:mm A', l: 'M/D/YYYY', ll: 'MMM D, YYYY', lll: 'MMM D, YYYY h:mm A', llll: 'ddd, MMM D, YYYY h:mm A',
};

/** Format a date like moment.js with its default English locale. */
function formatMoment(date, format) {
  const expanded = String(format).replace(/(\[[^\]]*\])|(LTS|LT|LL?L?L?|l{1,4})/g, (m, escaped, long) => (escaped ? m : LONG_FORMATS[long] ?? m));
  const d = date;
  const offset = -d.getTimezoneOffset();
  const offsetText = (sep) => `${offset >= 0 ? '+' : '-'}${pad(offset / 60)}${sep}${pad(offset % 60)}`;
  const h12 = d.getHours() % 12 || 12;
  const tokens = {
    YYYY: () => String(d.getFullYear()).padStart(4, '0'), YY: () => pad(d.getFullYear() % 100), Y: () => String(d.getFullYear()),
    Q: () => String(Math.floor(d.getMonth() / 3) + 1),
    MMMM: () => MONTHS[d.getMonth()], MMM: () => MONTHS[d.getMonth()].slice(0, 3), MM: () => pad(d.getMonth() + 1), M: () => String(d.getMonth() + 1),
    DDDD: () => pad(dayOfYear(d), 3), DDD: () => String(dayOfYear(d)), DD: () => pad(d.getDate()), Do: () => ordinal(d.getDate()), D: () => String(d.getDate()),
    dddd: () => WEEKDAYS[d.getDay()], ddd: () => WEEKDAYS[d.getDay()].slice(0, 3), dd: () => WEEKDAYS[d.getDay()].slice(0, 2), d: () => String(d.getDay()),
    E: () => String(d.getDay() || 7), e: () => String(d.getDay()),
    ww: () => pad(localeWeek(d).week), w: () => String(localeWeek(d).week), WW: () => pad(isoWeek(d).week), W: () => String(isoWeek(d).week),
    GGGG: () => String(isoWeek(d).year), gggg: () => String(localeWeek(d).year),
    HH: () => pad(d.getHours()), H: () => String(d.getHours()), hh: () => pad(h12), h: () => String(h12),
    kk: () => pad(d.getHours() || 24), k: () => String(d.getHours() || 24),
    mm: () => pad(d.getMinutes()), m: () => String(d.getMinutes()), ss: () => pad(d.getSeconds()), s: () => String(d.getSeconds()),
    SSS: () => pad(d.getMilliseconds(), 3), SS: () => pad(Math.floor(d.getMilliseconds() / 10)), S: () => String(Math.floor(d.getMilliseconds() / 100)),
    A: () => (d.getHours() < 12 ? 'AM' : 'PM'), a: () => (d.getHours() < 12 ? 'am' : 'pm'),
    ZZ: () => offsetText(''), Z: () => offsetText(':'), X: () => String(Math.floor(d.getTime() / 1000)), x: () => String(d.getTime()),
  };
  const pattern = /\[([^\]]*)\]|YYYY|YY|Y|Q|MMMM|MMM|MM|M|DDDD|DDD|DD|Do|D|dddd|ddd|dd|d|E|e|ww|w|WW|W|GGGG|gggg|HH|H|hh|h|kk|k|mm|m|ss|s|SSS|SS|S|A|a|ZZ|Z|X|x/g;
  return expanded.replace(pattern, (m, escaped) => (escaped !== undefined ? escaped : tokens[m]()));
}

/** moment().utc().utcOffset(hours).format('LT') */
function formatUtcOffsetTime(now, offsetHours) {
  const shifted = new Date(now.getTime() + offsetHours * 3600000);
  const h = shifted.getUTCHours();
  return `${h % 12 || 12}:${pad(shifted.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

function clip(value) {
  const text = value == null ? '' : String(value);
  return text.length > MAX_VARIABLE_LENGTH ? text.slice(0, MAX_VARIABLE_LENGTH) : text;
}

function isSystemRole(role) {
  return role === 'system' || role === 'narrator';
}

/**
 * Compute bridge variable values.
 * @param {object} input
 * @param {string[]} input.names bridge variable names to fill (st_*)
 * @param {Record<string, object>} [input.params] per-name parameters recorded at conversion
 * @param {Array<{role:string, content:string, swipeCount?:number, activeSwipeIndex?:number}>} [input.messages] chronological, as the model will see them
 * @param {number} [input.firstIndex] ST index of messages[0] (messages before it were not loaded)
 * @param {object|null} [input.character] character card data (first_mes, alternate_greetings, ...)
 * @param {object|null} [input.parameters] preset generation parameters
 * @param {boolean} [input.isMobile]
 * @param {Date} [input.now]
 * @returns {Record<string, string>}
 */
function computeBridgeValues(input) {
  const messages = input.messages ?? [];
  const firstIndex = input.firstIndex ?? 0;
  const params = input.params ?? {};
  const character = input.character ?? {};
  const parameters = input.parameters ?? {};
  const now = input.now ?? new Date();
  const total = firstIndex + messages.length;
  const lastIndexWhere = (test) => {
    for (let i = messages.length - 1; i >= 0; i--) if (!test || test(messages[i])) return i;
    return -1;
  };
  const last = lastIndexWhere();
  const lastMessage = last >= 0 ? messages[last] : null;
  const hasSwipes = (m) => m && m.role !== 'user';
  const maxContext = Number(parameters.maxContext);
  const maxResponse = Number(parameters.maxTokens);
  const extensions = character.extensions ?? {};
  const values = {};
  for (const name of input.names) {
    const key = name.startsWith('st_') ? name.slice(3) : name;
    const param = params[name] ?? {};
    let value = '';
    switch (key) {
      case 'lastMessage': value = lastMessage ? lastMessage.content : ''; break;
      case 'lastMessageId': value = last >= 0 ? String(firstIndex + last) : ''; break;
      case 'lastUserMessage': {
        const i = lastIndexWhere((m) => m.role === 'user');
        value = i >= 0 ? messages[i].content : '';
        break;
      }
      case 'lastCharMessage': {
        const i = lastIndexWhere((m) => m.role !== 'user' && !isSystemRole(m.role));
        value = i >= 0 ? messages[i].content : '';
        break;
      }
      case 'lastSwipeId': value = hasSwipes(lastMessage) ? String(Math.max(1, lastMessage.swipeCount ?? 1)) : ''; break;
      case 'currentSwipeId': value = hasSwipes(lastMessage) ? String((lastMessage.activeSwipeIndex ?? 0) + 1) : ''; break;
      case 'allChatRange': value = total > 0 ? `0-${total - 1}` : ''; break;
      case 'firstIncludedMessageId': value = ''; break;
      case 'firstDisplayedMessageId': value = total > 0 ? '0' : ''; break;
      case 'maxContext': value = Number.isFinite(maxContext) ? String(maxContext) : ''; break;
      case 'maxResponse': value = Number.isFinite(maxResponse) ? String(maxResponse) : ''; break;
      case 'maxPrompt': value = Number.isFinite(maxContext) && Number.isFinite(maxResponse) ? String(maxContext - maxResponse) : ''; break;
      case 'isMobile': value = String(!!input.isMobile); break;
      case 'charVersion': value = character.character_version ?? ''; break;
      case 'charCreatorNotes': value = character.creator_notes ?? ''; break;
      case 'charDepthPrompt': value = extensions.depth_prompt?.prompt ?? ''; break;
      default:
        if (param.kind === 'greeting') {
          value = param.index === 0 ? (character.first_mes ?? '') : ((character.alternate_greetings ?? [])[param.index - 1] ?? '');
        } else if (param.kind === 'utcTime') {
          value = formatUtcOffsetTime(now, param.offset);
        } else if (param.kind === 'datetimeformat') {
          value = formatMoment(now, param.format);
        } else {
          continue;
        }
    }
    values[name] = clip(value);
  }
  return values;
}

/** Bridge names that need chat history, the character card or preset parameters. */
const MESSAGE_KEYS = new Set(['lastMessage', 'lastMessageId', 'lastUserMessage', 'lastCharMessage', 'lastSwipeId', 'currentSwipeId', 'allChatRange', 'firstDisplayedMessageId']);
const CHARACTER_KEYS = new Set(['charVersion', 'charCreatorNotes', 'charDepthPrompt']);
const PARAMETER_KEYS = new Set(['maxContext', 'maxResponse', 'maxPrompt']);

function bridgeNeeds(names, params) {
  const needs = { messages: false, character: false, parameters: false };
  for (const name of names) {
    const key = name.slice(3);
    if (MESSAGE_KEYS.has(key)) needs.messages = true;
    if (CHARACTER_KEYS.has(key) || params[name]?.kind === 'greeting') needs.character = true;
    if (PARAMETER_KEYS.has(key)) needs.parameters = true;
  }
  return needs;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value ?? null;
  try { return JSON.parse(value); } catch { return null; }
}

/** Same-origin Marinara API call with the CSRF and admin headers the app itself sends. */
function createApi(marinara) {
  return async (path, init = {}) => {
    const headers = new Headers(init.headers);
    try {
      const secret = window.localStorage.getItem('marinara_admin_secret')?.trim();
      if (secret) headers.set('X-Admin-Secret', secret);
    } catch { /* storage blocked */ }
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET') {
      headers.set('x-marinara-csrf', '1');
      if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }
    const response = await marinara.fetch(`/api${path}`, { ...init, headers, cache: 'no-store' });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error ?? ''; } catch { /* not JSON */ }
      throw new Error(`${method} ${path} → ${response.status}${detail ? ` (${detail})` : ''}`);
    }
    return response.status === 204 ? null : response.json();
  };
}

/**
 * Install the fetch hook in the Marinara page.
 * @param {object} host
 * @param {object} host.marinara extension API
 * @param {(path: string, init?: RequestInit) => Promise<any>} host.api from createApi
 * @param {() => Promise<object>} host.loadState reads { presets, extra, globals, bridgeEnabled }
 * @param {(globals: Record<string,string>) => Promise<void>} host.saveGlobals
 */
function installBridge(host) {
  const { marinara, api } = host;
  const pageFetch = window.fetch;
  const prepare = async (body) => {
    const state = await host.loadState();
    if (!state.bridgeEnabled || !body?.chatId) return null;
    const extra = state.extra ?? {};
    const hasExtra = (extra.bridge?.length ?? 0) + (extra.globals?.length ?? 0) > 0;
    if (!Object.keys(state.presets ?? {}).length && !hasExtra) return null;
    const chat = await api(`/chats/${encodeURIComponent(body.chatId)}`);
    const entry = (chat?.promptPresetId && state.presets?.[chat.promptPresetId]) || null;
    if (!entry && !hasExtra) return null;
    // Values for the chat's converted preset plus any converted text used elsewhere (lorebooks, cards).
    const names = [...new Set([...(entry?.bridge ?? []), ...(extra.bridge ?? [])])];
    const params = { ...(extra.params ?? {}), ...(entry?.params ?? {}) };
    const globals = [...new Set([...(entry?.globals ?? []), ...(extra.globals ?? [])])];
    const needs = bridgeNeeds(names, params);
    const input = { names, params, isMobile: /Mobi|Android/i.test(navigator.userAgent), now: new Date() };
    if (needs.messages) {
      let page = await api(`/chats/${encodeURIComponent(body.chatId)}/messages?limit=200`);
      if (Array.isArray(page) && page.length === 200 && !page.some((m) => m.role === 'user')) {
        page = await api(`/chats/${encodeURIComponent(body.chatId)}/messages`);
        page = page.map((m, i) => ({ ...m, rowid: i + 1 }));
      }
      let messages = (Array.isArray(page) ? page : []).slice().sort((a, b) => (a.rowid ?? 0) - (b.rowid ?? 0));
      const firstIndex = messages.length ? Math.max(0, (messages[0].rowid ?? 1) - 1) : 0;
      if (body.regenerateMessageId) messages = messages.filter((m) => m.id !== body.regenerateMessageId);
      if (typeof body.userMessage === 'string' && body.userMessage && !body.impersonate) {
        messages.push({ role: 'user', content: body.userMessage });
      }
      input.messages = messages;
      input.firstIndex = firstIndex;
    }
    if (needs.character) {
      const ids = Array.isArray(chat.characterIds) ? chat.characterIds : parseMaybeJson(chat.characterIds) ?? [];
      const characterId = body.forCharacterId || ids[0];
      if (characterId) {
        const card = await api(`/characters/${encodeURIComponent(characterId)}`);
        input.character = parseMaybeJson(card?.data) ?? {};
      }
    }
    if (needs.parameters) {
      // Marinara keeps the context size on the connection and the reply size on the preset
      // (or the connection's override), so read both the way generation does.
      const preset = chat.promptPresetId ? await api(`/prompts/${encodeURIComponent(chat.promptPresetId)}`).catch(() => null) : null;
      const presetParameters = parseMaybeJson(preset?.parameters) ?? {};
      const connection = chat.connectionId ? await api(`/connections/${encodeURIComponent(chat.connectionId)}`).catch(() => null) : null;
      const contextLimits = [presetParameters.useMaxContext ? null : presetParameters.maxContext, connection?.maxContext]
        .map(Number).filter((n) => Number.isFinite(n) && n > 0);
      input.parameters = {
        maxContext: contextLimits.length ? Math.min(...contextLimits) : 128000,
        maxTokens: Number(connection?.maxTokensOverride) || Number(presetParameters.maxTokens) || 4096,
      };
    }
    const macroVariables = computeBridgeValues(input);
    for (const name of globals) macroVariables[name] = clip(state.globals?.[name] ?? '');
    if (Object.keys(macroVariables).length) {
      await api(`/chats/${encodeURIComponent(body.chatId)}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify({ macroVariables }),
      });
    }
    return globals.length ? { chatId: body.chatId, globals } : null;
  };

  const collectGlobals = async ({ chatId, globals }) => {
    const chat = await api(`/chats/${encodeURIComponent(chatId)}`);
    const metadata = parseMaybeJson(chat?.metadata) ?? {};
    const saved = metadata.macroVariables ?? {};
    const updates = {};
    for (const name of globals) if (typeof saved[name] === 'string') updates[name] = saved[name];
    if (Object.keys(updates).length) await host.saveGlobals(updates);
  };

  const isGenerateRequest = (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'POST') return false;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    try {
      return new URL(url, window.location.href).pathname === '/api/generate';
    } catch {
      return false;
    }
  };

  const hooked = async function (input, init) {
    if (!isGenerateRequest(input, init) || typeof init?.body !== 'string') return pageFetch.call(this, input, init);
    let pending = null;
    try {
      pending = await prepare(JSON.parse(init.body));
    } catch (error) {
      marinara.log.warn('ST macro bridge could not prepare values', error);
    }
    const response = await pageFetch.call(this, input, init);
    if (pending && response.ok && response.body) {
      const copy = response.clone();
      (async () => {
        const reader = copy.body.getReader();
        while (!(await reader.read()).done) { /* wait for the reply to finish */ }
        await collectGlobals(pending);
      })().catch((error) => marinara.log.warn('ST macro bridge could not save global variables', error));
    }
    return response;
  };

  window.fetch = hooked;
  marinara.onCleanup(() => {
    if (window.fetch === hooked) window.fetch = pageFetch;
  });
}

export { computeBridgeValues, formatMoment, installBridge, bridgeNeeds, createApi };
