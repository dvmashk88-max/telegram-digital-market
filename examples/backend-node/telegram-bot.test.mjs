import assert from 'node:assert/strict';
import test from 'node:test';

import { handleTelegramWebhookPayload } from './telegram-bot.mjs';

test('/start in a private chat sends the Telegram start message', async () => {
  const chatIds = [];
  const result = await handleTelegramWebhookPayload({
    update_id: 1,
    message: {
      text: '/start',
      chat: { id: 123456, type: 'private' },
      from: { id: 123456 },
    },
  }, {
    sendStartMessageImpl: async (chatId) => {
      chatIds.push(chatId);
    },
  });

  assert.deepEqual(result, { ok: true, handled: true });
  assert.deepEqual(chatIds, [123456]);
});

test('arbitrary private text does not trigger a response', async () => {
  let sendCount = 0;
  const result = await handleTelegramWebhookPayload({
    message: {
      text: 'hello',
      chat: { id: 123456, type: 'private' },
    },
  }, {
    sendStartMessageImpl: async () => {
      sendCount += 1;
    },
  });

  assert.deepEqual(result, { ok: true, handled: false });
  assert.equal(sendCount, 0);
});

test('/start outside a private chat does not trigger a response', async () => {
  let sendCount = 0;
  const result = await handleTelegramWebhookPayload({
    message: {
      text: '/start',
      chat: { id: -100123456, type: 'supergroup' },
    },
  }, {
    sendStartMessageImpl: async () => {
      sendCount += 1;
    },
  });

  assert.deepEqual(result, { ok: true, handled: false });
  assert.equal(sendCount, 0);
});
