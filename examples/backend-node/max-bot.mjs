import { MAX_API_BASE, MAX_BOT_TOKEN } from '../../config.mjs';

export const MINI_APP_URL = 'https://max-bot-production-6049.up.railway.app';
export const MAX_WEBHOOK_PATH = '/api/max/webhook';
export const MAX_WEBHOOK_URL = `${MINI_APP_URL}${MAX_WEBHOOK_PATH}`;

const START_MESSAGE =
  'Добро пожаловать в Маркет цифровых товаров. Нажмите кнопку ниже, чтобы открыть магазин.';

function trimTrailingSlash(value) {
  return value.replace(/\/$/, '');
}

function assertMaxConfigured() {
  if (!MAX_API_BASE || !MAX_BOT_TOKEN) {
    throw new Error('MAX_API_BASE and MAX_BOT_TOKEN must be configured');
  }
}

function buildMaxUrl(pathname, searchParams = {}) {
  assertMaxConfigured();

  const url = new URL(`${trimTrailingSlash(MAX_API_BASE)}${pathname}`);
  url.searchParams.set('access_token', MAX_BOT_TOKEN);
  url.searchParams.set('v', '0.0.1');

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function callMaxApi(pathname, { method = 'GET', searchParams, body } = {}) {
  const response = await fetch(buildMaxUrl(pathname, searchParams), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseText = await response.text();

  if (!response.ok) {
    const error = new Error(`MAX API request failed with status ${response.status}`);
    error.status = response.status;
    error.responseBody = responseText.slice(0, 500);
    throw error;
  }

  if (!responseText) return null;
  return JSON.parse(responseText);
}

export function getMaxStatus() {
  return {
    maxApiBaseConfigured: Boolean(MAX_API_BASE),
    maxBotTokenConfigured: Boolean(MAX_BOT_TOKEN),
    miniAppUrl: MINI_APP_URL,
  };
}

function buildOpenStoreKeyboard() {
  return {
    type: 'inline_keyboard',
    payload: {
      buttons: [
        [
          {
            type: 'link',
            text: 'Открыть магазин',
            url: MINI_APP_URL,
          },
        ],
      ],
    },
  };
}

export async function sendMaxMessageToUser(userId, text, attachments = []) {
  return callMaxApi('/messages', {
    method: 'POST',
    searchParams: { user_id: userId },
    body: {
      text,
      attachments,
    },
  });
}

export async function sendStartMessageToMaxUser(userId) {
  return sendMaxMessageToUser(userId, START_MESSAGE, [buildOpenStoreKeyboard()]);
}

export async function sendCodeToMaxUser(userId, orderInfo, code) {
  const productName = orderInfo?.title || orderInfo?.productName || orderInfo?.productId || 'товар';
  const orderId = orderInfo?.orderId || orderInfo?.id;
  const orderLine = orderId ? `Заказ: ${orderId}\n` : '';

  return sendMaxMessageToUser(
    userId,
    `Ваш код для товара "${productName}" готов.\n${orderLine}Код: ${code}`,
  );
}

export async function setMaxWebhook() {
  return callMaxApi('/subscriptions', {
    method: 'POST',
    body: {
      url: MAX_WEBHOOK_URL,
      update_types: ['message_created'],
    },
  });
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.updates)) return value.updates;
  if (Array.isArray(value?.events)) return value.events;
  return value ? [value] : [];
}

function getMessageFromUpdate(update) {
  return (
    update?.message ||
    update?.payload?.message ||
    update?.message_created?.message ||
    update?.messageCreated?.message ||
    update?.body?.message ||
    null
  );
}

function getMessageText(message) {
  if (typeof message?.body === 'string') return message.body;
  return message?.body?.text || message?.text || '';
}

function getMessageUserId(message) {
  return (
    message?.sender?.user_id ||
    message?.sender?.userId ||
    message?.from?.user_id ||
    message?.from?.userId ||
    message?.user_id ||
    message?.userId ||
    null
  );
}

export async function handleMaxWebhookPayload(payload) {
  const updates = asArray(payload);
  const results = [];

  for (const update of updates) {
    const message = getMessageFromUpdate(update);
    const text = getMessageText(message).trim();
    const userId = getMessageUserId(message);

    if (!message || text.split(/\s+/, 1)[0] !== '/start') {
      results.push({ ok: true, handled: false });
      continue;
    }

    if (!userId) {
      results.push({ ok: false, handled: true, error: 'MAX_USER_ID_NOT_FOUND' });
      continue;
    }

    try {
      await sendStartMessageToMaxUser(userId);
      results.push({ ok: true, handled: true });
    } catch (error) {
      console.error('[max] failed to handle /start', {
        status: error.status,
        responseBody: error.responseBody,
      });
      results.push({
        ok: false,
        handled: true,
        error: 'MAX_SEND_MESSAGE_FAILED',
        status: error.status,
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}
