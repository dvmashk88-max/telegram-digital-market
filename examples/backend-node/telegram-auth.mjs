import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_MAX_AGE_SECONDS = 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 30;

function authError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeHexEqual(actual, expected) {
  if (!/^[0-9a-f]{64}$/i.test(actual)) return false;
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function validateTelegramInitData(
  initData,
  botToken,
  {
    nowSeconds = Math.floor(Date.now() / 1000),
    maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  } = {},
) {
  if (typeof initData !== 'string' || initData.length === 0 || initData.length > 16_384) {
    throw authError('TELEGRAM_AUTH_REQUIRED');
  }
  if (!botToken) throw authError('TELEGRAM_BOT_NOT_CONFIGURED');

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') ?? '';
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!safeHexEqual(receivedHash, expectedHash)) {
    throw authError('INVALID_TELEGRAM_INIT_DATA');
  }

  const authDate = Number.parseInt(params.get('auth_date') ?? '', 10);
  if (!Number.isSafeInteger(authDate)) throw authError('INVALID_TELEGRAM_AUTH_DATE');
  const ageSeconds = nowSeconds - authDate;
  if (ageSeconds < -MAX_FUTURE_SKEW_SECONDS || ageSeconds > maxAgeSeconds) {
    throw authError('TELEGRAM_INIT_DATA_EXPIRED');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch (_error) {
    throw authError('INVALID_TELEGRAM_USER');
  }

  if (!Number.isSafeInteger(user?.id) || user.id <= 0) {
    throw authError('INVALID_TELEGRAM_USER_ID');
  }

  return {
    authDate,
    user,
    telegramUserId: String(user.id),
  };
}

export function isValidTelegramWebhookSecret(actualSecret, expectedSecret) {
  if (!expectedSecret || typeof actualSecret !== 'string') return false;
  const actual = Buffer.from(actualSecret);
  const expected = Buffer.from(expectedSecret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
