import test from 'node:test';
import assert from 'node:assert/strict';
import moment from 'moment';
import { computeBridgeValues, formatMoment } from '../dist/bridge.mjs';

test('formats dates the way moment.js does', () => {
  const formats = [
    'YYYY-MM-DD HH:mm:ss', 'dddd, MMMM Do YYYY', 'ddd MMM D YY', 'h:mm A', 'hh:mm a', 'LT', 'LTS', 'L', 'LL', 'LLL', 'LLLL',
    'l', 'll', 'lll', 'llll', '[Today is] dddd', 'Q DDD DDDD', 'w ww W WW gggg GGGG', 'E e d dd', 'k kk', 'SSS', 'Z ZZ', 'X',
  ];
  const dates = [new Date(2026, 9, 20, 9, 5, 7, 123), new Date(2024, 0, 1, 0, 0, 0), new Date(2023, 11, 31, 23, 59, 59), new Date(2026, 1, 3, 12, 30)];
  for (const date of dates) {
    for (const format of formats) assert.equal(formatMoment(date, format), moment(date).format(format), `${format} @ ${date}`);
  }
});

const chat = [
  { role: 'assistant', content: 'Hello!' },
  { role: 'user', content: 'How are you?' },
  { role: 'assistant', content: 'Fine.', swipeCount: 3, activeSwipeIndex: 1 },
  { role: 'system', content: 'note' },
];

test('fills chat values like SillyTavern', () => {
  const values = computeBridgeValues({
    names: ['st_lastMessage', 'st_lastUserMessage', 'st_lastCharMessage', 'st_lastMessageId', 'st_allChatRange', 'st_lastSwipeId', 'st_currentSwipeId'],
    messages: chat,
  });
  assert.deepEqual(values, {
    st_lastMessage: 'note', st_lastUserMessage: 'How are you?', st_lastCharMessage: 'Fine.', st_lastMessageId: '3',
    st_allChatRange: '0-3', st_lastSwipeId: '1', st_currentSwipeId: '1',
  });
});

test('counts message ids from the first loaded message', () => {
  const values = computeBridgeValues({ names: ['st_lastMessageId', 'st_allChatRange'], messages: chat, firstIndex: 100 });
  assert.deepEqual(values, { st_lastMessageId: '103', st_allChatRange: '0-103' });
});

test('fills card values and parameters', () => {
  const values = computeBridgeValues({
    names: ['st_greeting_0', 'st_greeting_2', 'st_charVersion', 'st_charDepthPrompt', 'st_maxPrompt', 'st_isMobile'],
    params: { st_greeting_0: { kind: 'greeting', index: 0 }, st_greeting_2: { kind: 'greeting', index: 2 } },
    character: { first_mes: 'Hi', alternate_greetings: ['A', 'B'], character_version: '2', extensions: { depth_prompt: { prompt: 'D' } } },
    parameters: { maxContext: 8000, maxTokens: 1000 },
    isMobile: true,
  });
  assert.deepEqual(values, { st_greeting_0: 'Hi', st_greeting_2: 'B', st_charVersion: '2', st_charDepthPrompt: 'D', st_maxPrompt: '7000', st_isMobile: 'true' });
});

test('formats UTC offset times like moment', () => {
  const now = new Date(Date.UTC(2026, 9, 20, 15, 4));
  const values = computeBridgeValues({ names: ['st_time_utcp2', 'st_time_utcm10'], params: { st_time_utcp2: { kind: 'utcTime', offset: 2 }, st_time_utcm10: { kind: 'utcTime', offset: -10 } }, now });
  assert.deepEqual(values, {
    st_time_utcp2: moment(now).utc().utcOffset(2).format('LT'),
    st_time_utcm10: moment(now).utc().utcOffset(-10).format('LT'),
  });
});

test('clips values to the chat variable size limit', () => {
  const values = computeBridgeValues({ names: ['st_lastMessage'], messages: [{ role: 'user', content: 'x'.repeat(20000) }] });
  assert.equal(values.st_lastMessage.length, 10000);
});
