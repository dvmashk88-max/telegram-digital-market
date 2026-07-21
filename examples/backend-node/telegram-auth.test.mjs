import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  isValidTelegramWebhookSecret,
  validateTelegramInitData,
} from './telegram-auth.mjs';

const BOT_TOKEN = '123456789:test-token';
const NOW_SECONDS = 1_800_000_000;

function createSignedInitData({ authDate = NOW_SECONDS, userId = 987654321 } = {}) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test-query',
    user: JSON.stringify({ id: userId, first_name: 'Test' }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

test('valid Telegram initData yields a trusted Telegram user ID', () => {
  const identity = validateTelegramInitData(createSignedInitData(), BOT_TOKEN, {
    nowSeconds: NOW_SECONDS,
  });
  assert.equal(identity.telegramUserId, '987654321');
});

test('expired Telegram initData is rejected', () => {
  assert.throws(
    () => validateTelegramInitData(
      createSignedInitData({ authDate: NOW_SECONDS - 3_601 }),
      BOT_TOKEN,
      { nowSeconds: NOW_SECONDS },
    ),
    { code: 'TELEGRAM_INIT_DATA_EXPIRED' },
  );
});

test('modified Telegram initData is rejected', () => {
  const initData = createSignedInitData().replace('987654321', '987654322');
  assert.throws(
    () => validateTelegramInitData(initData, BOT_TOKEN, { nowSeconds: NOW_SECONDS }),
    { code: 'INVALID_TELEGRAM_INIT_DATA' },
  );
});

test('webhook secret requires an exact constant-time-compatible match', () => {
  assert.equal(isValidTelegramWebhookSecret('valid_secret-1', 'valid_secret-1'), true);
  assert.equal(isValidTelegramWebhookSecret('wrong_secret-1', 'valid_secret-1'), false);
  assert.equal(isValidTelegramWebhookSecret('', 'valid_secret-1'), false);
});
