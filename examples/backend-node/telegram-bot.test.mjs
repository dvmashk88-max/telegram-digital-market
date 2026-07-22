import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramStartMessage,
  buildTelegramStartReplyMarkup,
  handleTelegramWebhookPayload,
  sendTelegramStartMessage,
  TELEGRAM_START_SUPPORT_URL,
} from './telegram-bot.mjs';

test('start message contains the production copy without the development warning', () => {
  const message = buildTelegramStartMessage();

  assert.match(message, /^👋 Добро пожаловать в «Маркет цифровых товаров»/);
  assert.match(message, /📩 После оплаты/);
  assert.match(message, /🛟 Поддержка/);
  assert.match(message, new RegExp(TELEGRAM_START_SUPPORT_URL.replaceAll(/[+./]/g, '\\$&')));
  assert.doesNotMatch(message, /реальные покупки/);
});

test('start message keyboard uses the configured Mini App URL and support group', () => {
  const webAppUrl = 'https://shop.example.test';

  assert.deepEqual(buildTelegramStartReplyMarkup(webAppUrl), {
    inline_keyboard: [
      [{
        text: '🛍 Открыть магазин',
        web_app: { url: webAppUrl },
      }],
      [{
        text: '🛟 Группа поддержки',
        url: TELEGRAM_START_SUPPORT_URL,
      }],
    ],
  });
});

test('/start sends the logo, caption, and keyboard as one Telegram photo', async () => {
  const webAppUrl = 'https://shop.example.test';
  let request = null;

  await sendTelegramStartMessage(123456, {
    webAppUrl,
    callTelegramApiImpl: async (method, payload) => {
      request = { method, payload };
      return { message_id: 1 };
    },
  });

  assert.equal(request.method, 'sendPhoto');
  assert.equal(request.payload.get('chat_id'), '123456');
  assert.equal(request.payload.get('caption'), buildTelegramStartMessage());
  assert.deepEqual(
    JSON.parse(request.payload.get('reply_markup')),
    buildTelegramStartReplyMarkup(webAppUrl),
  );
  assert.equal(request.payload.get('photo').type, 'image/png');
  assert.ok(request.payload.get('photo').size > 0);
});

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
