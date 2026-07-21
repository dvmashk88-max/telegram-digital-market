import {
  PUBLIC_APP_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_SUPPORT_URL,
  TELEGRAM_WEBAPP_URL,
  TELEGRAM_WEBHOOK_SECRET,
} from '../../config.mjs';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function getTelegramApiUrl(method) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');
  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

export function getTelegramWebAppUrl() {
  return trimTrailingSlash(TELEGRAM_WEBAPP_URL || PUBLIC_APP_URL);
}

export function getTelegramWebhookUrl() {
  const publicAppUrl = trimTrailingSlash(PUBLIC_APP_URL);
  return publicAppUrl ? `${publicAppUrl}${TELEGRAM_WEBHOOK_PATH}` : '';
}

export function getTelegramStatus() {
  return {
    botTokenConfigured: Boolean(TELEGRAM_BOT_TOKEN),
    webhookSecretConfigured: Boolean(TELEGRAM_WEBHOOK_SECRET),
    publicAppUrlConfigured: Boolean(PUBLIC_APP_URL),
    webAppUrlConfigured: Boolean(getTelegramWebAppUrl()),
    supportUrlConfigured: Boolean(TELEGRAM_SUPPORT_URL),
    webhookUrl: getTelegramWebhookUrl() || null,
    orderingHardDisabled: true,
  };
}

export async function callTelegramApi(method, payload, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(getTelegramApiUrl(method), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) {
    const error = new Error('TELEGRAM_API_REQUEST_FAILED');
    error.status = response.status;
    error.description = body?.description ?? null;
    throw error;
  }
  return body.result;
}

export function buildTelegramStartMessage() {
  const lines = [
    '🛒 Добро пожаловать в Telegram Digital Market!',
    '',
    'Здесь можно выбрать цифровые коды и подарочные карты.',
    'Во время разработки реальные покупки временно отключены.',
    '',
    'Нажмите кнопку ниже, чтобы открыть магазин.',
  ];
  if (TELEGRAM_SUPPORT_URL) lines.splice(-2, 0, `Поддержка: ${TELEGRAM_SUPPORT_URL}`, '');
  return lines.join('\n');
}

export async function sendTelegramStartMessage(chatId, options = {}) {
  const webAppUrl = getTelegramWebAppUrl();
  if (!webAppUrl) throw new Error('TELEGRAM_WEBAPP_URL_NOT_CONFIGURED');
  return callTelegramApi('sendMessage', {
    chat_id: chatId,
    text: buildTelegramStartMessage(),
    reply_markup: {
      inline_keyboard: [[{
        text: '🛍 Открыть магазин',
        web_app: { url: webAppUrl },
      }]],
    },
  }, options);
}

export async function handleTelegramWebhookPayload(
  payload,
  { sendStartMessageImpl = sendTelegramStartMessage } = {},
) {
  const message = payload?.message;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const isPrivateChat = message?.chat?.type === 'private';
  const isStart = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(text);

  if (!isPrivateChat || !isStart) return { ok: true, handled: false };
  const chatId = message?.chat?.id;
  if (!Number.isSafeInteger(chatId)) return { ok: true, handled: false };

  await sendStartMessageImpl(chatId);
  return { ok: true, handled: true };
}

export async function setTelegramWebhook(options = {}) {
  const webhookUrl = getTelegramWebhookUrl();
  if (!webhookUrl || !TELEGRAM_WEBHOOK_SECRET) {
    throw new Error('TELEGRAM_WEBHOOK_CONFIG_MISSING');
  }
  return callTelegramApi('setWebhook', {
    url: webhookUrl,
    secret_token: TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  }, options);
}
