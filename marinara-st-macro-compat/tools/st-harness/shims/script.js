// Stand-in for public/script.js: only what the macro definitions import. Chat and card come from st-engine.mjs.
export const chat = globalThis.__st.chat;
export const chat_metadata = globalThis.__st.chat_metadata;
export const main_api = 'openai';
export const name1 = 'User';
export const name2 = 'Alice';
export const characters = [];
export const extension_prompts = {};
export function getMaxPromptTokens() { return 1500; }
export function getMaxContextTokens() { return 2000; }
export function getMaxResponseTokens() { return 500; }
export function getCurrentChatId() { return 'chat1'; }
export function getGeneratingModel() { return 'test-model'; }
export function parseMesExamples(raw) { return [raw]; }
export function getCharacterCardFieldsLazy() { return globalThis.__st.card; }
