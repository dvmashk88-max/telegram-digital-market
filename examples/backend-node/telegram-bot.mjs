import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  PUBLIC_APP_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_SUPPORT_URL,
  TELEGRAM_WEBAPP_URL,
  TELEGRAM_WEBHOOK_SECRET,
} from '../../config.mjs';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
export const TELEGRAM_START_SUPPORT_URL = 'https://t.me/+ZkPkMZrcOTM3MDIy';

const TELEGRAM_START_LOGO_PATH = fileURLToPath(
  new URL('./assets/telegram-start-logo.png', import.meta.url),
);

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
  const isFormData = payload instanceof FormData;
  const response = await fetchImpl(getTelegramApiUrl(method), {
    method: 'POST',
    headers: isFormData
      ? { Accept: 'application/json' }
      : {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
    body: isFormData ? payload : JSON.stringify(payload),
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
  return [
    '👋 Добро пожаловать в «Маркет цифровых товаров»',
    '',
    'Здесь вы можете быстро и безопасно приобрести цифровые товары:',
    '',
    '🎮 Игровые карты и пополнение баланса',
    '',
    '🍏 Подарочные карты Apple',
    '',
    '💬 Telegram Stars и другие цифровые сервисы',
    '',
    'Каталог постоянно расширяется.',
    '',
    '🚀 Нажмите кнопку ниже, чтобы открыть магазин.',
    '',
    '⸻',
    '',
    '📩 После оплаты',
    '',
    'После успешной оплаты:',
    '',
    '✅ заказ обрабатывается автоматически;',
    '',
    '✅ цифровой код приходит на указанную при покупке электронную почту;',
    '',
    '✅ все заказы обрабатываются круглосуточно.',
    '',
    '⸻',
    '',
    '🛟 Поддержка',
    '',
    'Если возникли вопросы по оплате или получению заказа, обратитесь в группу поддержки:',
    '',
    `👉 ${TELEGRAM_START_SUPPORT_URL}`,
    '',
    '⸻',
    '',
    'Спасибо, что пользуетесь Маркетом цифровых товаров! 💜',
  ].join('\n');
}

export function buildTelegramStartReplyMarkup(webAppUrl) {
  return {
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
  };
}

export async function sendTelegramStartMessage(chatId, {
  webAppUrl = getTelegramWebAppUrl(),
  callTelegramApiImpl = callTelegramApi,
  ...apiOptions
} = {}) {
  if (!webAppUrl) throw new Error('TELEGRAM_WEBAPP_URL_NOT_CONFIGURED');
  const form = new FormData();
  const logo = await readFile(TELEGRAM_START_LOGO_PATH);
  form.set('chat_id', String(chatId));
  form.set('caption', buildTelegramStartMessage());
  form.set('reply_markup', JSON.stringify(buildTelegramStartReplyMarkup(webAppUrl)));
  form.set('photo', new Blob([logo], { type: 'image/png' }), 'telegram-start-logo.png');
  return callTelegramApiImpl('sendPhoto', form, apiOptions);
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
