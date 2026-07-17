import express from 'express';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_ORIGIN,
  ALFA_API_BASE,
  ALFA_PASSWORD,
  ALFA_RETURN_URL,
  ALFA_USERNAME,
  FAZERCARDS_API_BASE,
  FAZERCARDS_API_KEY,
  PORT,
  SMTP_HOST,
  SMTP_PASSWORD,
  SMTP_PORT,
  SMTP_USER,
  STATIC_DIR as STATIC_DIR_FROM_ENV,
} from '../../config.mjs';
import {
  getMaxStatus,
  handleMaxWebhookPayload,
  MAX_WEBHOOK_URL,
} from './max-bot.mjs';
import { isDatabaseConfigured, query, withTransaction } from './db.mjs';
import { createSmtpTransport } from './smtp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR_CANDIDATES = [
  STATIC_DIR_FROM_ENV,
  path.resolve(__dirname, '../react/dist'),
  path.resolve(process.cwd(), 'examples/react/dist'),
].filter(Boolean);
const STATIC_DIR = STATIC_DIR_CANDIDATES.find((dir) => existsSync(path.join(dir, 'index.html'))) ?? '';

const VIOLET_PRODUCT_MATCHERS = [
  {
    productId: 'apple-tr',
    source: 'giftcards',
    match: (item) => item.category_id === 'app_store_itunes_tr',
  },
  {
    productId: 'apple-us',
    source: 'giftcards',
    match: (item) => item.category_id === 'app_store_itunes_us',
  },
  {
    productId: 'apple-ru',
    source: 'giftcards',
    match: (item) => item.category_id === 'app_store_itunes_ru',
  },
  {
    productId: 'apple-in',
    source: 'giftcards',
    match: (item) => item.category_id === 'app_store_itunes_in',
  },
  {
    productId: 'roblox-gift-card',
    source: 'giftcards',
    match: (item) => item.category_id === 'roblox_global',
  },
  {
    productId: 'playstation-gift-card',
    source: 'giftcards',
    match: (item) => item.category_id === 'playstation_us',
  },
  {
    productId: 'xbox-gift-card',
    source: 'giftcards',
    match: (item) => item.category_id === 'xbox_us',
  },
  {
    productId: 'steam-top-up',
    source: 'giftcards',
    match: (item) => item.category_id === 'steam_wallet_global',
  },
  {
    productId: 'pubg',
    source: 'topups',
    match: (item) => item.category_id === 'pubg_mobile_auto',
  },
  {
    productId: 'free-fire',
    source: 'topups',
    match: (item) => item.category_id === 'free_fire_eu',
  },
  {
    productId: 'roblox-top-up',
    source: 'topups',
    match: (item) => item.category_id === 'roblox',
  },
  {
    productId: 'minecraft',
    source: 'topups',
    match: (item) => item.category_id === 'minecraft',
  },
];

const USD_TO_RUB = 90;
const MARKUP_PERCENT = 50;
const ALFA_REQUEST_TIMEOUT_MS = 10_000;
const FAZER_REQUEST_TIMEOUT_MS = 10_000;
const ORDER_CURRENCY = '810';
const FULFILLMENT_RECONCILE_INTERVAL_MS = 30_000;
const FULFILLMENT_RECONCILE_BATCH_SIZE = 5;
const SMTP_SEND_MAX_ATTEMPTS = 3;
const SMTP_RETRYABLE_CODES = new Set(['ESOCKET', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);
const PRICED_GIFTCARD_CATEGORY_CURRENCIES = {
  app_store_itunes_tr: 'TRY',
  app_store_itunes_us: 'USD',
  app_store_itunes_ru: 'RUB',
  app_store_itunes_in: 'INR',
  playstation_us: 'USD',
  xbox_us: 'USD',
  steam_wallet_global: 'USD',
};

const ORDER_FLOW_BY_SOURCE = {
  giftcards: {
    orderFlow: 'code_delivery',
    orderEndpoint: '/api/v2/giftcards/order',
    requiredFields: [],
  },
  topups: {
    orderFlow: 'game_balance',
    orderEndpoint: '/api/v2/topups/order',
    requiredFields: ['playerId'],
  },
  telegram_stars: {
    orderFlow: 'telegram_stars',
    orderEndpoint: '/api/v2/telegram/stars/buy',
    requiredFields: ['telegramUsername'],
  },
  telegram_premium: {
    orderFlow: 'telegram_premium',
    orderEndpoint: '/api/v2/telegram/premium/buy',
    requiredFields: ['telegramUsername'],
  },
};

const ORDER_FLOW_BY_PRODUCT_ID = {
  'steam-top-up': {
    orderFlow: 'steam_balance',
    orderEndpoint: '/api/v2/steam-topup/order',
    requiredFields: ['steamLogin'],
  },
};

function resolveOrderFlow(productId, source) {
  return ORDER_FLOW_BY_PRODUCT_ID[productId] ?? ORDER_FLOW_BY_SOURCE[source] ?? {
    orderFlow: 'code_delivery',
    orderEndpoint: null,
    requiredFields: [],
  };
}

function normalizeCustomerEmail(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 6 || normalized.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function maskEmail(value) {
  const normalized = normalizeCustomerEmail(value);
  if (!normalized) return null;
  const [local, domain] = normalized.split('@');
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

function isSmtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD && Number.isFinite(SMTP_PORT));
}

function sanitizeErrorMessage(error) {
  const raw = error?.code ?? error?.responseCode ?? error?.message ?? 'UNKNOWN_ERROR';
  return String(raw)
    .replaceAll(SMTP_PASSWORD, '[secret]')
    .replaceAll(SMTP_USER, '[smtp-user]')
    .slice(0, 500);
}

function getSafeSmtpError(error) {
  return {
    code: error?.code ?? null,
    command: error?.command ?? null,
    responseCode: error?.responseCode ?? null,
    syscall: error?.syscall ?? null,
    hostname: error?.hostname ?? SMTP_HOST ?? null,
    port: error?.port ?? SMTP_PORT ?? null,
    message: sanitizeErrorMessage(error),
  };
}

function isRetryableSmtpError(error) {
  return SMTP_RETRYABLE_CODES.has(String(error?.code ?? ''));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

if (!FAZERCARDS_API_BASE || !FAZERCARDS_API_KEY) {
  console.warn(
    '[boot] Missing FAZERCARDS_API_BASE / FAZERCARDS_API_KEY — /api/fazercards/giftcards will return 500 until they are set.',
  );
}

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
  console.warn(
    '[boot] Missing SMTP_HOST / SMTP_USER / SMTP_PASSWORD — delivered order e-mails will be skipped until they are set.',
  );
}

async function fetchFazerCardsJson(path, searchParams = {}) {
  const url = new URL(`${FAZERCARDS_API_BASE.replace(/\/$/, '')}${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-API-Key': FAZERCARDS_API_KEY,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`FazerCards ${path} HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function fetchFazerCardsItems(path) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const payload = await fetchFazerCardsJson(path, cursor ? { cursor } : {});
    if (Array.isArray(payload.items)) items.push(...payload.items);
    cursor = payload.meta?.next_cursor || '';
    if (!payload.meta?.has_more || !cursor) break;
  }
  return items;
}

function normalizeCatalogItem(productId, source, item) {
  const orderFlow = resolveOrderFlow(productId, source);
  const purchasePriceUsd = resolvePurchasePriceUsd(item);
  const salePrice = purchasePriceUsd === null ? {} : calculateSalePriceFromPurchaseUsd(purchasePriceUsd);

  return {
    productId,
    source,
    ...orderFlow,
    externalId: item.category_id ?? null,
    categoryId: item.category_id ?? null,
    cardId: item.card_id ?? item.id ?? null,
    name: item.name ?? null,
    note: item.note ?? null,
    denominations: Array.isArray(item.denominations) ? item.denominations : [],
    supplierPrice: item.price_usd ?? item.price ?? item.cost ?? null,
    rawPriceUsd: purchasePriceUsd,
    ...salePrice,
    available: item.available ?? item.in_stock ?? true,
    raw: {
      kind: item.kind ?? null,
      currency: item.currency ?? null,
      minAmount: item.min_amount ?? null,
      maxAmount: item.max_amount ?? null,
    },
  };
}

function resolvePurchasePriceUsd(item) {
  for (const field of ['price_usd', 'priceUsd', 'price', 'cost']) {
    const value = Number(item?.[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function parseGiftCardNominal(offer, expectedCurrency) {
  const explicitNominal = offer.nominal ?? offer.denomination ?? offer.amount ?? offer.value;
  const explicitCurrency = offer.currency ?? expectedCurrency;
  const explicitNumber = Number(explicitNominal);
  if (Number.isFinite(explicitNumber) && explicitNumber > 0) {
    return { nominal: explicitNumber, currency: explicitCurrency };
  }

  const text = [offer.name, offer.card_id, offer.id].filter(Boolean).join(' ');
  const matched = expectedCurrency
    ? text.match(new RegExp(`([\\d.,\\s]+)\\s*${expectedCurrency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')) ?? text.match(/([\d.,\s]+)/)
    : text.match(/([\d.,\s]+)/);
  if (!matched) return null;

  const numeric = matched[1].replace(/\s/g, '').replace(',', '.');
  const nominal = Number(numeric);
  if (!Number.isFinite(nominal) || nominal <= 0) return null;
  return { nominal, currency: expectedCurrency };
}

function calculateSalePriceFromPurchaseUsd(purchasePriceUsd) {
  return {
    priceRub: Math.round(purchasePriceUsd * USD_TO_RUB * (1 + MARKUP_PERCENT / 100)),
  };
}

function normalizePricedOffer(categoryId, offer, options = {}) {
  const parsed = parseGiftCardNominal(offer, options.expectedCurrency);
  if (!parsed) {
    console.warn('[fazercards] unable to parse priced offer nominal', {
      categoryId,
      cardId: offer.card_id ?? offer.id ?? null,
      name: offer.name ?? null,
    });
    return null;
  }

  const purchasePriceUsd = resolvePurchasePriceUsd(offer);
  if (purchasePriceUsd === null) {
    console.warn('[fazercards] priced offer skipped because purchase price is invalid', {
      categoryId,
      cardId: offer.card_id ?? offer.id ?? null,
      name: offer.name ?? null,
      priceUsd: offer.price_usd ?? null,
      price: offer.price ?? null,
      cost: offer.cost ?? null,
    });
    return null;
  }

  const salePrice = calculateSalePriceFromPurchaseUsd(purchasePriceUsd);
  return {
    cardId: offer.card_id ?? offer.id ?? null,
    nominal: parsed.nominal,
    currency: parsed.currency,
    name: offer.name ?? null,
    rawPriceUsd: offer.price_usd,
    stock: Number.isFinite(Number(offer.stock)) ? Number(offer.stock) : null,
    minOrderQuantity: Number.isFinite(Number(offer.min_order_quantity))
      ? Number(offer.min_order_quantity)
      : null,
    maxOrderQuantity: Number.isFinite(Number(offer.max_order_quantity))
      ? Number(offer.max_order_quantity)
      : null,
    ...salePrice,
  };
}

function normalizeTopupOffer(categoryId, offer, index) {
  const purchasePriceUsd = resolvePurchasePriceUsd(offer);
  if (purchasePriceUsd === null) {
    console.warn('[fazercards] topup offer skipped because purchase price is invalid', {
      categoryId,
      offerId: offer.offer_id ?? offer.id ?? null,
      name: offer.name ?? null,
      priceUsd: offer.price_usd ?? null,
      price: offer.price ?? null,
      cost: offer.cost ?? null,
    });
    return null;
  }

  return {
    cardId: offer.offer_id ?? offer.id ?? null,
    nominal: index + 1,
    currency: undefined,
    name: offer.name ?? offer.offer_id ?? null,
    rawPriceUsd: offer.price_usd ?? purchasePriceUsd,
    ...calculateSalePriceFromPurchaseUsd(purchasePriceUsd),
  };
}

async function fetchGiftCardOffers(categoryId) {
  const payload = await fetchFazerCardsJson('/api/v2/giftcards/cards', { category_id: categoryId });
  const offers = Array.isArray(payload.offers) ? payload.offers : [];
  const expectedCurrency = PRICED_GIFTCARD_CATEGORY_CURRENCIES[categoryId];
  return offers
    .map((offer) => normalizePricedOffer(categoryId, offer, { expectedCurrency }))
    .filter(Boolean)
    .sort((a, b) => a.nominal - b.nominal);
}

async function findConfirmedGiftcardOffer({ categoryId, cardId, quantity }) {
  const payload = await fetchFazerCardsJson('/api/v2/giftcards/cards', { category_id: categoryId });
  const offers = Array.isArray(payload.offers) ? payload.offers : [];
  const offer = offers.find((item) => (item.card_id ?? item.id) === cardId);

  if (!offer) {
    return { status: 'not_found' };
  }

  const stock = Number(offer.stock);
  if (Number.isFinite(stock) && stock < quantity) {
    return { status: 'insufficient_stock' };
  }

  const purchasePriceUsd = Number(offer.price_usd);
  if (!Number.isFinite(purchasePriceUsd) || purchasePriceUsd <= 0) {
    return { status: 'invalid_price' };
  }

  return {
    status: 'ok',
    offer,
    purchasePriceUsd,
  };
}

function mapFazerCardsRequiredField(field) {
  if (field?.key === 'player_id') return 'playerId';
  if (field?.key === 'telegram_username') return 'telegramUsername';
  if (field?.key === 'steamLogin' || field?.key === 'steam_login') return 'steamLogin';
  if (field?.key === 'server_region') return 'serverRegion';
  return null;
}

async function fetchTopupOfferPayload(categoryId) {
  return fetchFazerCardsJson('/api/v2/topups/offers', { category_id: categoryId });
}

async function normalizeVioletCatalogItem(productId, source, item) {
  const normalized = normalizeCatalogItem(productId, source, item);
  if (source === 'topups') {
    const payload = await fetchTopupOfferPayload(item.category_id);
    const offers = (Array.isArray(payload.offers) ? payload.offers : [])
      .map((offer, index) => normalizeTopupOffer(item.category_id, offer, index))
      .filter(Boolean);
    const requiredFields = (Array.isArray(payload.fields) ? payload.fields : [])
      .map(mapFazerCardsRequiredField)
      .filter(Boolean);
    if (offers.length === 0) {
      console.warn('[fazercards] topup category has no priced offers; sale prices omitted', {
        productId,
        categoryId: item.category_id ?? null,
        name: item.name ?? null,
      });
    }
    return {
      ...normalized,
      requiredFields: requiredFields.length ? requiredFields : normalized.requiredFields,
      note: payload.note ?? normalized.note,
      offers,
      denominations: offers.map((offer) => offer.nominal),
      raw: {
        ...normalized.raw,
        fields: Array.isArray(payload.fields) ? payload.fields : [],
        offersEndpoint: '/api/v2/topups/offers',
      },
    };
  }

  if (source !== 'giftcards') {
    if (normalized.rawPriceUsd === null) {
      console.warn('[fazercards] catalog item has no purchase price; sale price omitted', {
        productId,
        source,
        categoryId: item.category_id ?? null,
        name: item.name ?? null,
      });
    }
    return normalized;
  }

  const offers = await fetchGiftCardOffers(item.category_id);
  if (offers.length === 0) {
    console.warn('[fazercards] gift card category has no priced offers; sale prices omitted', {
      productId,
      categoryId: item.category_id ?? null,
      name: item.name ?? null,
    });
  }
  return {
    ...normalized,
    offers,
    denominations: offers.map((offer) => offer.nominal),
    raw: {
      ...normalized.raw,
      currency: PRICED_GIFTCARD_CATEGORY_CURRENCIES[item.category_id] ?? null,
      offersEndpoint: '/api/v2/giftcards/cards',
    },
  };
}

function normalizeTelegramStars(payload) {
  const pricePerStar = Number(payload.price_per_star);
  const starPacks = [50, 100, 250, 500].filter(
    (amount) => amount >= Number(payload.min_amount ?? 0) && amount <= Number(payload.max_amount ?? Infinity),
  );
  const offers = Number.isFinite(pricePerStar) && pricePerStar > 0
    ? starPacks.map((amount) => {
      const rawPriceUsd = Number((amount * pricePerStar).toFixed(6));
      return {
        cardId: `${amount}_stars`,
        nominal: amount,
        currency: undefined,
        name: `${amount} Stars`,
        rawPriceUsd,
        ...calculateSalePriceFromPurchaseUsd(rawPriceUsd),
      };
    })
    : [];
  if (offers.length === 0) {
    console.warn('[fazercards] Telegram Stars has no valid price_per_star; sale prices omitted', {
      pricePerStar: payload.price_per_star ?? null,
    });
  }
  return {
    productId: 'telegram-stars',
    source: 'telegram_stars',
    ...resolveOrderFlow('telegram-stars', 'telegram_stars'),
    externalId: 'telegram_stars',
    categoryId: 'telegram_stars',
    cardId: null,
    name: 'Telegram Stars',
    note: 'Telegram Stars direct top-up.',
    denominations: offers.map((offer) => offer.nominal),
    supplierPrice: Number.isFinite(pricePerStar) ? pricePerStar.toFixed(6) : null,
    rawPriceUsd: null,
    offers,
    available: Boolean(payload.ok),
    raw: {
      kind: payload.kind ?? null,
      currency: 'USD',
      minAmount: payload.min_amount ?? null,
      maxAmount: payload.max_amount ?? null,
    },
  };
}

function normalizeTelegramPremium(payload) {
  const plans = Array.isArray(payload.plans) ? payload.plans : [];
  const offers = plans
    .map((plan) => {
      const rawPriceUsd = resolvePurchasePriceUsd(plan);
      if (rawPriceUsd === null) {
        console.warn('[fazercards] Telegram Premium plan skipped because price_usd is invalid', {
          months: plan.months ?? null,
          priceUsd: plan.price_usd ?? null,
        });
        return null;
      }
      const months = Number(plan.months);
      return {
        cardId: Number.isFinite(months) ? `${months}_months` : null,
        nominal: Number.isFinite(months) ? months : rawPriceUsd,
        currency: undefined,
        name: Number.isFinite(months) ? `${months} months` : `${rawPriceUsd} USD`,
        rawPriceUsd,
        ...calculateSalePriceFromPurchaseUsd(rawPriceUsd),
      };
    })
    .filter(Boolean);
  return {
    productId: 'telegram-premium',
    source: 'telegram_premium',
    ...resolveOrderFlow('telegram-premium', 'telegram_premium'),
    externalId: 'telegram_premium',
    categoryId: 'telegram_premium',
    cardId: null,
    name: 'Telegram Premium',
    note: 'Telegram Premium subscription plans.',
    denominations: offers.map((offer) => offer.nominal),
    supplierPrice: null,
    rawPriceUsd: null,
    offers,
    available: Boolean(payload.ok && plans.length > 0),
    raw: {
      kind: payload.kind ?? null,
      currency: 'USD',
      minAmount: null,
      maxAmount: null,
    },
  };
}

function buildOrderReturnUrl(orderId) {
  if (!ALFA_RETURN_URL) throw new Error('ALFA_RETURN_URL_MISSING');
  const url = new URL(ALFA_RETURN_URL);
  url.searchParams.set('mdmOrderId', orderId);
  return url.toString();
}

async function registerAlfaOrder({ orderNumber, amount, description, returnUrl = ALFA_RETURN_URL }) {
  const params = new URLSearchParams({
    userName: ALFA_USERNAME,
    password: ALFA_PASSWORD,
    orderNumber,
    amount: String(amount),
    returnUrl,
  });
  if (description !== undefined && description !== null && description !== '') {
    params.set('description', String(description));
  }

  const response = await fetch(`${ALFA_API_BASE.replace(/\/$/, '')}/register.do`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(ALFA_REQUEST_TIMEOUT_MS),
  });
  return response.json();
}

async function fetchAlfaOrderStatus(orderId) {
  const params = new URLSearchParams({
    userName: ALFA_USERNAME,
    password: ALFA_PASSWORD,
    orderId,
  });

  const response = await fetch(`${ALFA_API_BASE.replace(/\/$/, '')}/getOrderStatus.do`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(ALFA_REQUEST_TIMEOUT_MS),
  });
  return response.json();
}

async function createFazerGiftcardOrder({
  categoryId,
  cardId,
  quantity,
  idempotencyKey,
}) {
  const response = await fetch(`${FAZERCARDS_API_BASE.replace(/\/$/, '')}/api/v2/giftcards/order`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': FAZERCARDS_API_KEY,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      category_id: categoryId,
      card_id: cardId,
      quantity,
    }),
    signal: AbortSignal.timeout(FAZER_REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function fetchFazerOrder(orderId) {
  const response = await fetch(`${FAZERCARDS_API_BASE.replace(/\/$/, '')}/api/v2/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Accept: 'application/json',
      'X-API-Key': FAZERCARDS_API_KEY,
    },
    signal: AbortSignal.timeout(FAZER_REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function generateOrderNumber() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, '')
    .slice(0, 14);
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `MAX-${timestamp}-${suffix}`;
}

function formatOrder(row, options = {}) {
  const order = {
    id: row.id,
    orderNumber: row.order_number,
    alfaOrderId: row.alfa_order_id,
    categoryId: row.category_id,
    cardId: row.card_id,
    quantity: row.quantity,
    amount: row.amount,
    currency: row.currency,
    paymentStatus: row.payment_status,
    supplierStatus: row.supplier_status,
    emailStatus: row.email_status,
    customerEmailMasked: maskEmail(row.customer_email),
  };

  if (options.includeSupplierOrderId) {
    order.supplierOrderId = row.supplier_order_id;
  }

  if (options.includeTimestamps) {
    order.createdAt = row.created_at;
    order.updatedAt = row.updated_at;
  }

  return order;
}

async function createStoredOrder({
  maxUserId,
  customerEmail,
  categoryId,
  cardId,
  quantity,
  amount,
}) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const idempotencyKey = `max-digital-market:${orderNumber}`;

    try {
      const result = await query(
        `INSERT INTO orders (
          order_number,
          max_user_id,
          customer_email,
          category_id,
          card_id,
          quantity,
          amount,
          currency,
          payment_status,
          supplier_status,
          idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'created', 'not_started', $9)
        RETURNING *`,
        [
          orderNumber,
          maxUserId,
          customerEmail,
          categoryId,
          cardId,
          quantity,
          amount,
          ORDER_CURRENCY,
          idempotencyKey,
        ],
      );

      return result.rows[0];
    } catch (error) {
      lastError = error;
      if (error?.code !== '23505') {
        throw error;
      }
    }
  }

  throw lastError;
}

async function markOrderPaymentFailed(orderId) {
  await query(
    `UPDATE orders
      SET payment_status = 'failed',
          updated_at = now()
      WHERE id = $1`,
    [orderId],
  );
}

function isValidUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatFulfillmentOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    paymentStatus: row.payment_status,
    supplierStatus: row.supplier_status,
    supplierOrderId: row.supplier_order_id,
    emailStatus: row.email_status,
    customerEmailMasked: maskEmail(row.customer_email),
  };
}

function normalizeSupplierStatus(status) {
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'processing' || normalized === 'pending' || normalized === 'created') return 'pending';
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'error') return 'failed';
  return 'pending';
}

function getSupplierOrderId(order) {
  const candidates = [
    order?.order_id,
    order?.orderId,
    order?.id,
    order?.public_id,
    order?.publicId,
  ];
  return candidates.find((value) => typeof value === 'string' && /^ord-[0-9]+$/.test(value)) ?? null;
}

function extractSupplierCodes(order) {
  if (!Array.isArray(order?.cards)) return [];
  return order.cards
    .map((card) => {
      if (typeof card === 'string') return card;
      if (card && typeof card === 'object' && typeof card.code === 'string') return card.code;
      return null;
    })
    .filter((code) => typeof code === 'string' && code.trim() !== '');
}

function getSavedCodes(row) {
  if (Array.isArray(row.digital_codes)) return row.digital_codes.filter((code) => typeof code === 'string');
  if (typeof row.digital_code === 'string' && row.digital_code.trim() !== '') return [row.digital_code];
  return [];
}

async function markEmailStatus(orderId, status, fields = {}) {
  const result = await query(
    `UPDATE orders
      SET email_status = $2,
          email_sent_at = COALESCE($3, email_sent_at),
          email_error = $4,
          email_message_id = COALESCE($5, email_message_id),
          updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      orderId,
      status,
      fields.sentAt ?? null,
      fields.error ?? null,
      fields.messageId ?? null,
    ],
  );
  return result.rows[0];
}

async function resolveOrderEmailProduct(order) {
  try {
    const payload = await fetchFazerCardsJson('/api/v2/giftcards/cards', { category_id: order.category_id });
    const offers = Array.isArray(payload.offers) ? payload.offers : [];
    const offer = offers.find((item) => (item.card_id ?? item.id) === order.card_id);
    const normalized = offer
      ? normalizePricedOffer(order.category_id, offer, {
        expectedCurrency: PRICED_GIFTCARD_CATEGORY_CURRENCIES[order.category_id],
      })
      : null;

    return {
      title: offer?.name ?? payload.name ?? order.category_id,
      region: normalized?.currency ?? offer?.currency ?? PRICED_GIFTCARD_CATEGORY_CURRENCIES[order.category_id] ?? 'цифровой товар',
      nominal: normalized ? `${normalized.nominal} ${normalized.currency ?? ''}`.trim() : offer?.name ?? order.card_id,
      activation: offer?.activation_instruction ?? offer?.activationInstruction ?? offer?.instructions ?? offer?.note ?? '',
    };
  } catch (_error) {
    return {
      title: order.category_id,
      region: 'цифровой товар',
      nominal: order.card_id,
      activation: '',
    };
  }
}

function buildDeliveredEmail({ order, product, codes }) {
  const codeBlock = codes.map((code) => escapeHtml(code)).join('\n');
  const htmlCodes = codes
    .map((code) => `<div style="margin:8px 0;padding:14px 16px;border-radius:10px;background:#f3f4f6;color:#111827;font-size:22px;font-weight:700;letter-spacing:.04em;">${escapeHtml(code)}</div>`)
    .join('');
  const activationHtml = product.activation
    ? `<p><strong>Инструкция по активации:</strong><br>${escapeHtml(product.activation)}</p>`
    : '';
  const activationText = product.activation
    ? `\nИнструкция по активации:\n${product.activation}\n`
    : '';

  return {
    subject: 'Ваш цифровой товар готов',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h1>Ваш заказ готов</h1>
        <p>Номер заказа: <strong>${escapeHtml(order.order_number)}</strong></p>
        <p>Товар: <strong>${escapeHtml(product.title)}</strong></p>
        <p>Регион: <strong>${escapeHtml(product.region)}</strong></p>
        <p>Номинал: <strong>${escapeHtml(product.nominal)}</strong></p>
        <p>Цифровой код:</p>
        ${htmlCodes}
        ${activationHtml}
        <p><strong>Сохраните это письмо.</strong></p>
        <p>Если письмо попало в папку «Спам», отметьте его как не спам.</p>
      </div>
    `,
    text: [
      'Ваш заказ готов',
      '',
      `Номер заказа: ${order.order_number}`,
      `Товар: ${product.title}`,
      `Регион: ${product.region}`,
      `Номинал: ${product.nominal}`,
      '',
      'Цифровой код:',
      codeBlock,
      activationText,
      'Сохраните это письмо.',
    ].join('\n'),
  };
}

async function sendDeliveredOrderEmail(order) {
  const codes = getSavedCodes(order);
  if (order.email_status === 'sent') return { status: 'sent', skipped: false };
  if (codes.length === 0) return { status: 'pending', skipped: true };

  const customerEmail = normalizeCustomerEmail(order.customer_email);
  if (!customerEmail) {
    await markEmailStatus(order.id, 'skipped', { error: 'EMAIL_SKIPPED_NO_ADDRESS' });
    return { status: 'skipped', skipped: true };
  }

  if (!isSmtpConfigured()) {
    await markEmailStatus(order.id, 'failed', { error: 'SMTP_CONFIG_MISSING' });
    return { status: 'failed', skipped: true };
  }

  await markEmailStatus(order.id, 'sending');

  try {
    const product = await resolveOrderEmailProduct(order);
    const message = buildDeliveredEmail({ order, product, codes });
    let info;

    for (let attempt = 1; attempt <= SMTP_SEND_MAX_ATTEMPTS; attempt += 1) {
      try {
        info = await createSmtpTransport().sendMail({
          from: `"Маркет цифровых товаров" <${SMTP_USER}>`,
          to: customerEmail,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        break;
      } catch (error) {
        const safeError = getSafeSmtpError(error);
        console.warn('[email] SMTP send attempt failed', {
          orderId: order.id,
          attempt,
          ...safeError,
        });
        if (attempt >= SMTP_SEND_MAX_ATTEMPTS || !isRetryableSmtpError(error)) {
          throw error;
        }
        await wait(750 * attempt);
      }
    }

    await markEmailStatus(order.id, 'sent', {
      sentAt: new Date(),
      error: null,
      messageId: info.messageId ?? null,
    });
    return { status: 'sent', skipped: false };
  } catch (error) {
    const safeError = getSafeSmtpError(error);
    await markEmailStatus(order.id, 'failed', { error: safeError.code ?? safeError.message });
    return { status: 'failed', skipped: false, error: safeError };
  }
}

function safeFazerFailureDetails(payload) {
  return {
    code: payload?.code,
    error: payload?.error,
  };
}

async function loadOrderForFulfillment(id) {
  const result = await query(
    `SELECT
      id,
      order_number,
      alfa_order_id,
      category_id,
      card_id,
      quantity,
      amount,
      currency,
      customer_email,
      payment_status,
      supplier_status,
      supplier_order_id,
      supplier_payload,
      digital_code,
      digital_codes,
      email_status,
      email_sent_at,
      email_error,
      email_message_id,
      idempotency_key,
      created_at,
      updated_at
    FROM orders
    WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function saveSupplierPending(orderId, supplierOrderId, payload) {
  const result = await query(
    `UPDATE orders
      SET supplier_order_id = COALESCE($2, supplier_order_id),
          supplier_payload = $3,
          supplier_status = 'ordered',
          updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [orderId, supplierOrderId, payload],
  );
  return result.rows[0];
}

async function saveSupplierDelivered(orderId, supplierOrderId, payload, codes) {
  const result = await query(
    `UPDATE orders
      SET supplier_order_id = COALESCE($2, supplier_order_id),
          supplier_payload = $3,
          supplier_status = 'delivered',
          digital_code = $4,
          digital_codes = $5,
          updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [orderId, supplierOrderId, payload, codes[0] ?? null, JSON.stringify(codes)],
  );
  return result.rows[0];
}

async function markSupplierFailed(orderId, payload) {
  await query(
    `UPDATE orders
      SET supplier_status = 'failed',
          supplier_payload = $2,
          updated_at = now()
      WHERE id = $1`,
    [orderId, payload],
  );
}

async function resetSupplierNotStarted(orderId) {
  await query(
    `UPDATE orders
      SET supplier_status = 'not_started',
          updated_at = now()
      WHERE id = $1`,
    [orderId],
  );
}

async function processSupplierOrderPayload(orderId, payload) {
  const supplierOrder = payload?.order;
  const supplierOrderId = getSupplierOrderId(supplierOrder);
  if (!supplierOrder || !supplierOrderId) {
    await markSupplierFailed(orderId, safeFazerFailureDetails(payload));
    return {
      responseStatus: 502,
      body: {
        error: 'FAZER_ORDER_FAILED',
        details: safeFazerFailureDetails(payload),
      },
    };
  }

  const codes = extractSupplierCodes(supplierOrder);
  const supplierStatus = normalizeSupplierStatus(supplierOrder.status);

  if (supplierStatus === 'completed' && codes.length > 0) {
    const updatedOrder = await saveSupplierDelivered(orderId, supplierOrderId, supplierOrder, codes);
    const emailDelivery = await sendDeliveredOrderEmail(updatedOrder);
    return {
      responseStatus: 200,
      body: {
        ok: true,
        status: 'DELIVERED',
        order: formatFulfillmentOrder(updatedOrder),
        codes,
        emailDelivery,
      },
    };
  }

  if (supplierStatus === 'failed') {
    await markSupplierFailed(orderId, safeFazerFailureDetails(payload));
    return {
      responseStatus: 502,
      body: {
        error: 'FAZER_ORDER_FAILED',
        details: safeFazerFailureDetails(payload),
      },
    };
  }

  const updatedOrder = await saveSupplierPending(orderId, supplierOrderId, supplierOrder);
  return {
    responseStatus: 202,
    body: {
      ok: true,
      status: 'SUPPLIER_PENDING',
      order: formatFulfillmentOrder(updatedOrder),
    },
  };
}

async function fulfillOrderById(id) {
  if (
    !isDatabaseConfigured()
    || !FAZERCARDS_API_BASE
    || !FAZERCARDS_API_KEY
    || !ALFA_API_BASE
    || !ALFA_USERNAME
    || !ALFA_PASSWORD
  ) {
    return {
      responseStatus: 500,
      body: { error: 'FULFILLMENT_CONFIG_MISSING' },
    };
  }

  let order;

  try {
    order = await loadOrderForFulfillment(id);
  } catch (_error) {
    return {
      responseStatus: 500,
      body: { error: 'ORDER_STORAGE_FAILED' },
    };
  }

  if (!order) {
    return {
      responseStatus: 404,
      body: { error: 'ORDER_NOT_FOUND' },
    };
  }

  if (order.supplier_status === 'delivered') {
    return {
      responseStatus: 200,
      body: {
        ok: true,
        status: 'DELIVERED',
        order: formatFulfillmentOrder(order),
        codes: getSavedCodes(order),
      },
    };
  }

  if (order.supplier_status === 'ordering') {
    return {
      responseStatus: 409,
      body: { error: 'FULFILLMENT_IN_PROGRESS' },
    };
  }

  if (order.supplier_status === 'ordered') {
    try {
      const supplierResult = await fetchFazerOrder(order.supplier_order_id);
      if (!supplierResult.ok || supplierResult.payload?.ok !== true) {
        return {
          responseStatus: 502,
          body: {
            error: 'FAZER_ORDER_FAILED',
            details: safeFazerFailureDetails(supplierResult.payload),
          },
        };
      }

      return await processSupplierOrderPayload(order.id, supplierResult.payload);
    } catch (_error) {
      return {
        responseStatus: 502,
        body: {
          error: 'FAZER_ORDER_FAILED',
          details: {
            code: 'SUPPLIER_STATUS_REQUEST_FAILED',
            error: 'Unable to fetch supplier order status',
          },
        },
      };
    }
  }

  let alfaPayload;

  try {
    alfaPayload = await fetchAlfaOrderStatus(order.alfa_order_id);
  } catch (_error) {
    return {
      responseStatus: 502,
      body: { error: 'ALFA_STATUS_FAILED' },
    };
  }

  const alfaErrorCode = alfaPayload?.ErrorCode;
  if (alfaErrorCode !== undefined && String(alfaErrorCode) !== '0') {
    return {
      responseStatus: 502,
      body: { error: 'ALFA_STATUS_FAILED' },
    };
  }

  if (alfaPayload?.OrderStatus !== 2) {
    return {
      responseStatus: 409,
      body: {
        error: 'PAYMENT_NOT_CONFIRMED',
        orderStatus: alfaPayload?.OrderStatus,
      },
    };
  }

  if (String(alfaPayload?.OrderNumber) !== order.order_number) {
    return {
      responseStatus: 409,
      body: { error: 'PAYMENT_ORDER_MISMATCH' },
    };
  }

  if (Number(alfaPayload?.Amount) !== Number(order.amount) || String(alfaPayload?.currency) !== String(order.currency)) {
    return {
      responseStatus: 409,
      body: { error: 'PAYMENT_AMOUNT_MISMATCH' },
    };
  }

  try {
    await query(
      `UPDATE orders
        SET payment_status = 'paid',
            updated_at = now()
        WHERE id = $1`,
      [order.id],
    );
  } catch (_error) {
    return {
      responseStatus: 500,
      body: { error: 'ORDER_STORAGE_FAILED' },
    };
  }

  let lockedOrderState;

  try {
    lockedOrderState = await withTransaction(async (client) => {
      const lockedResult = await client.query(
        `SELECT *
          FROM orders
          WHERE id = $1
          FOR UPDATE`,
        [order.id],
      );
      const row = lockedResult.rows[0];

      if (!row) return null;
      if (row.supplier_status !== 'not_started' && row.supplier_status !== 'failed') {
        return {
          order: row,
          acquired: false,
        };
      }

      const updateResult = await client.query(
        `UPDATE orders
          SET supplier_status = 'ordering',
              updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [order.id],
      );
      return {
        order: updateResult.rows[0],
        acquired: true,
      };
    });
  } catch (_error) {
    return {
      responseStatus: 500,
      body: { error: 'ORDER_STORAGE_FAILED' },
    };
  }

  if (!lockedOrderState) {
    return {
      responseStatus: 404,
      body: { error: 'ORDER_NOT_FOUND' },
    };
  }

  const lockedOrder = lockedOrderState.order;

  if (lockedOrder.supplier_status === 'delivered') {
    return {
      responseStatus: 200,
      body: {
        ok: true,
        status: 'DELIVERED',
        order: formatFulfillmentOrder(lockedOrder),
        codes: getSavedCodes(lockedOrder),
      },
    };
  }

  if (lockedOrder.supplier_status === 'ordering' && !lockedOrderState.acquired) {
    return {
      responseStatus: 409,
      body: { error: 'FULFILLMENT_IN_PROGRESS' },
    };
  }

  if (lockedOrder.supplier_status === 'ordered') {
    return {
      responseStatus: 202,
      body: {
        ok: true,
        status: 'SUPPLIER_PENDING',
        order: formatFulfillmentOrder(lockedOrder),
      },
    };
  }

  if (lockedOrder.supplier_status !== 'ordering') {
    return {
      responseStatus: 409,
      body: { error: 'FULFILLMENT_IN_PROGRESS' },
    };
  }

  if (process.env.ENABLE_FAZER_GIFTCARD_ORDERS !== 'true') {
    await resetSupplierNotStarted(order.id);
    return {
      responseStatus: 503,
      body: { error: 'FAZER_ORDERING_DISABLED' },
    };
  }

  let fazerResult;

  try {
    fazerResult = await createFazerGiftcardOrder({
      categoryId: lockedOrder.category_id,
      cardId: lockedOrder.card_id,
      quantity: lockedOrder.quantity,
      idempotencyKey: lockedOrder.idempotency_key,
    });
  } catch (_error) {
    await markSupplierFailed(order.id, {
      code: 'SUPPLIER_REQUEST_FAILED',
      error: 'Supplier request failed',
    });
    return {
      responseStatus: 502,
      body: {
        error: 'FAZER_ORDER_FAILED',
        details: {
          code: 'SUPPLIER_REQUEST_FAILED',
          error: 'Supplier request failed',
        },
      },
    };
  }

  if (!fazerResult.ok || fazerResult.payload?.ok !== true) {
    await markSupplierFailed(order.id, safeFazerFailureDetails(fazerResult.payload));
    return {
      responseStatus: 502,
      body: {
        error: 'FAZER_ORDER_FAILED',
        details: safeFazerFailureDetails(fazerResult.payload),
      },
    };
  }

  try {
    return await processSupplierOrderPayload(order.id, fazerResult.payload);
  } catch (_error) {
    return {
      responseStatus: 500,
      body: { error: 'ORDER_STORAGE_FAILED' },
    };
  }
}

async function loadFulfillmentReconcileCandidates() {
  const result = await query(
    `SELECT id
      FROM orders
      WHERE alfa_order_id IS NOT NULL
        AND payment_status IN ('registered', 'pending', 'paid')
        AND supplier_status IN ('not_started', 'ordered', 'failed')
      ORDER BY created_at ASC
      LIMIT $1`,
    [FULFILLMENT_RECONCILE_BATCH_SIZE],
  );
  return result.rows.map((row) => row.id);
}

let fulfillmentReconcileRunning = false;

async function reconcilePaidOrders() {
  if (fulfillmentReconcileRunning || !isDatabaseConfigured()) return;
  fulfillmentReconcileRunning = true;

  try {
    const orderIds = await loadFulfillmentReconcileCandidates();
    for (const orderId of orderIds) {
      const result = await fulfillOrderById(orderId);
      if (result.body?.status === 'DELIVERED') {
        console.log('[fulfillment] delivered order', { orderId });
      } else if (result.body?.error && result.body.error !== 'PAYMENT_NOT_CONFIRMED') {
        console.warn('[fulfillment] reconciliation stopped for order', {
          orderId,
          error: result.body.error,
        });
      }
    }
  } catch (error) {
    console.warn('[fulfillment] reconciliation failed', { error: sanitizeErrorMessage(error) });
  } finally {
    fulfillmentReconcileRunning = false;
  }
}

const app = express();

// CORS for the mini-app served from a different origin.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/max/status', (_req, res) => {
  res.json(getMaxStatus());
});

app.post('/api/max/webhook', express.json({ limit: '128kb' }), async (req, res) => {
  try {
    const result = await handleMaxWebhookPayload(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error('[max] webhook error', error);
    res.status(500).json({ ok: false, error: 'MAX_WEBHOOK_FAILURE' });
  }
});

app.get('/api/max/webhook', (_req, res) => {
  res.json({ ok: true, webhookUrl: MAX_WEBHOOK_URL });
});

app.get('/config.json', (_req, res) => {
  const configPath = STATIC_DIR ? path.join(STATIC_DIR, 'config.json') : '';
  if (!configPath || !existsSync(configPath)) {
    return res.status(404).json({ error: 'CONFIG_NOT_FOUND' });
  }

  res.type('application/json').sendFile(path.resolve(configPath));
});

app.get('/api/fazercards/giftcards', async (_req, res) => {
  if (!FAZERCARDS_API_BASE || !FAZERCARDS_API_KEY) {
    return res.status(500).json({
      error: 'MISSING_FAZERCARDS_CONFIG',
      hint: 'Set FAZERCARDS_API_BASE and FAZERCARDS_API_KEY in Railway Variables.',
    });
  }
  const url = `${FAZERCARDS_API_BASE.replace(/\/$/, '')}/api/v2/giftcards`;
  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-Key': FAZERCARDS_API_KEY,
      },
    });
    const body = await upstream.text();
    res
      .status(upstream.status)
      .type(upstream.headers.get('content-type') || 'application/json')
      .send(body);
  } catch (error) {
    console.error('[fazercards] giftcards upstream error', error);
    res.status(502).json({ error: 'FAZERCARDS_UPSTREAM_FAILURE' });
  }
});

app.get('/api/fazercards/violet-catalog', async (_req, res) => {
  if (!FAZERCARDS_API_BASE || !FAZERCARDS_API_KEY) {
    return res.status(500).json({
      error: 'MISSING_FAZERCARDS_CONFIG',
      hint: 'Set FAZERCARDS_API_BASE and FAZERCARDS_API_KEY in Railway Variables.',
    });
  }

  try {
    const [giftcards, topups, stars, premium] = await Promise.all([
      fetchFazerCardsItems('/api/v2/giftcards'),
      fetchFazerCardsItems('/api/v2/topups'),
      fetchFazerCardsJson('/api/v2/telegram/stars').catch(() => null),
      fetchFazerCardsJson('/api/v2/telegram/premium').catch(() => null),
    ]);

    const sourceItems = { giftcards, topups };
    const items = [];

    for (const matcher of VIOLET_PRODUCT_MATCHERS) {
      const matched = sourceItems[matcher.source]?.find(matcher.match);
      if (matched) {
        items.push(await normalizeVioletCatalogItem(matcher.productId, matcher.source, matched));
      }
    }

    if (stars) items.push(normalizeTelegramStars(stars));
    if (premium) items.push(normalizeTelegramPremium(premium));

    res.json({
      ok: true,
      items,
      matchedIds: items.map((item) => item.productId),
    });
  } catch (error) {
    console.error('[fazercards] violet catalog upstream error', error);
    res.status(502).json({ error: 'FAZERCARDS_VIOLET_CATALOG_FAILURE' });
  }
});

app.post('/api/fazercards/giftcards/order', express.json({ limit: '16kb' }), async (req, res) => {
  const { alfaOrderId, categoryId, cardId, quantity } = req.body ?? {};

  if (typeof alfaOrderId !== 'string' || alfaOrderId.trim() === '' || alfaOrderId.length > 36) {
    return res.status(400).json({ error: 'INVALID_ALFA_ORDER_ID' });
  }

  if (typeof categoryId !== 'string' || categoryId.trim() === '' || categoryId.length > 255) {
    return res.status(400).json({ error: 'INVALID_CATEGORY_ID' });
  }

  if (typeof cardId !== 'string' || cardId.trim() === '' || cardId.length > 255) {
    return res.status(400).json({ error: 'INVALID_CARD_ID' });
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return res.status(400).json({ error: 'INVALID_QUANTITY' });
  }

  if (!FAZERCARDS_API_BASE || !FAZERCARDS_API_KEY || !ALFA_API_BASE || !ALFA_USERNAME || !ALFA_PASSWORD) {
    return res.status(500).json({ error: 'PAYMENT_CONFIG_MISSING' });
  }

  const trimmedAlfaOrderId = alfaOrderId.trim();
  const trimmedCategoryId = categoryId.trim();
  const trimmedCardId = cardId.trim();

  try {
    const alfaPayload = await fetchAlfaOrderStatus(trimmedAlfaOrderId);
    const alfaErrorCode = alfaPayload?.ErrorCode;

    if (alfaErrorCode !== undefined && String(alfaErrorCode) !== '0') {
      return res.status(502).json({
        error: 'ALFA_STATUS_FAILED',
        errorCode: String(alfaErrorCode),
        errorMessage: alfaPayload.ErrorMessage ?? '',
      });
    }

    if (alfaPayload?.OrderStatus !== 2) {
      return res.status(409).json({
        error: 'PAYMENT_NOT_CONFIRMED',
        orderStatus: alfaPayload?.OrderStatus,
      });
    }

    if (process.env.ENABLE_FAZER_GIFTCARD_ORDERS !== 'true') {
      return res.status(503).json({ error: 'FAZER_ORDERING_DISABLED' });
    }

    const fazerResult = await createFazerGiftcardOrder({
      categoryId: trimmedCategoryId,
      cardId: trimmedCardId,
      quantity,
      idempotencyKey: `max-digital-market:${trimmedAlfaOrderId}`,
    });

    if (!fazerResult.ok || fazerResult.payload?.ok !== true) {
      return res.status(502).json({
        error: 'FAZER_ORDER_FAILED',
        details: {
          status: fazerResult.status,
          error: fazerResult.payload?.error,
          code: fazerResult.payload?.code,
        },
      });
    }

    return res.json({
      ok: true,
      alfaOrderId: trimmedAlfaOrderId,
      fazerOrder: fazerResult.payload.order,
    });
  } catch (_error) {
    return res.status(502).json({ error: 'FAZER_ORDER_FAILED' });
  }
});

app.post('/api/orders/register', express.json({ limit: '16kb' }), async (req, res) => {
  const { maxUserId, customerEmail, categoryId, cardId, quantity } = req.body ?? {};

  if (maxUserId !== undefined && (typeof maxUserId !== 'string' || maxUserId.trim().length > 255)) {
    return res.status(400).json({ error: 'INVALID_MAX_USER_ID' });
  }

  const normalizedCustomerEmail = normalizeCustomerEmail(customerEmail);
  if (!normalizedCustomerEmail) {
    return res.status(400).json({ error: 'INVALID_CUSTOMER_EMAIL' });
  }

  if (typeof categoryId !== 'string' || categoryId.trim() === '' || categoryId.length > 255) {
    return res.status(400).json({ error: 'INVALID_CATEGORY_ID' });
  }

  if (typeof cardId !== 'string' || cardId.trim() === '' || cardId.length > 255) {
    return res.status(400).json({ error: 'INVALID_CARD_ID' });
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return res.status(400).json({ error: 'INVALID_QUANTITY' });
  }

  if (
    !isDatabaseConfigured()
    || !FAZERCARDS_API_BASE
    || !FAZERCARDS_API_KEY
    || !ALFA_API_BASE
    || !ALFA_USERNAME
    || !ALFA_PASSWORD
    || !ALFA_RETURN_URL
  ) {
    return res.status(500).json({ error: 'ORDER_CONFIG_MISSING' });
  }

  const trimmedMaxUserId = maxUserId?.trim() || null;
  const trimmedCategoryId = categoryId.trim();
  const trimmedCardId = cardId.trim();

  let storedOrder;

  try {
    const confirmedOffer = await findConfirmedGiftcardOffer({
      categoryId: trimmedCategoryId,
      cardId: trimmedCardId,
      quantity,
    });

    if (confirmedOffer.status === 'not_found') {
      return res.status(404).json({ error: 'OFFER_NOT_FOUND' });
    }

    if (confirmedOffer.status === 'insufficient_stock') {
      return res.status(409).json({ error: 'INSUFFICIENT_STOCK' });
    }

    if (confirmedOffer.status === 'invalid_price') {
      return res.status(502).json({ error: 'INVALID_SUPPLIER_PRICE' });
    }

    const priceRub = calculateSalePriceFromPurchaseUsd(confirmedOffer.purchasePriceUsd).priceRub;
    const amountKopecks = priceRub * quantity * 100;

    storedOrder = await createStoredOrder({
      maxUserId: trimmedMaxUserId,
      customerEmail: normalizedCustomerEmail,
      categoryId: trimmedCategoryId,
      cardId: trimmedCardId,
      quantity,
      amount: amountKopecks,
    });
  } catch (error) {
    if (error?.message?.startsWith('FazerCards')) {
      return res.status(502).json({ error: 'FAZERCARDS_UPSTREAM_FAILURE' });
    }

    return res.status(500).json({ error: 'ORDER_STORAGE_FAILED' });
  }

  let alfaPayload;

  try {
    alfaPayload = await registerAlfaOrder({
      orderNumber: storedOrder.order_number,
      amount: storedOrder.amount,
      description: `MAX Digital Market order ${storedOrder.order_number}`,
      returnUrl: buildOrderReturnUrl(storedOrder.id),
    });

    const alfaErrorCode = alfaPayload?.errorCode;

    if (alfaErrorCode !== undefined && String(alfaErrorCode) !== '0') {
      await markOrderPaymentFailed(storedOrder.id);
      return res.status(502).json({
        error: 'ALFA_REGISTER_FAILED',
        errorCode: String(alfaErrorCode),
        errorMessage: alfaPayload.errorMessage ?? '',
      });
    }

    if (!alfaPayload?.orderId || !alfaPayload?.formUrl) {
      await markOrderPaymentFailed(storedOrder.id);
      return res.status(502).json({ error: 'ALFA_REQUEST_FAILED' });
    }

  } catch (_error) {
    try {
      await markOrderPaymentFailed(storedOrder.id);
    } catch (_dbError) {
      return res.status(500).json({ error: 'ORDER_STORAGE_FAILED' });
    }

    return res.status(502).json({ error: 'ALFA_REQUEST_FAILED' });
  }

  try {
    const updateResult = await query(
      `UPDATE orders
        SET alfa_order_id = $2,
            payment_status = 'registered',
            updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [storedOrder.id, alfaPayload.orderId],
    );

    return res.json({
      ok: true,
      order: formatOrder(updateResult.rows[0]),
      formUrl: alfaPayload.formUrl,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'ORDER_STORAGE_FAILED' });
  }
});

app.post('/api/orders/:id/fulfill', async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ error: 'INVALID_ORDER_ID' });
  }

  const processed = await fulfillOrderById(id);
  return res.status(processed.responseStatus).json(processed.body);
});

app.get('/api/orders/:id/result', async (req, res) => {
  const { id } = req.params;

  if (process.env.ENABLE_ORDER_RESULT_ENDPOINT !== 'true') {
    return res.status(503).json({ error: 'ORDER_RESULT_DISABLED' });
  }

  if (!isValidUuid(id)) {
    return res.status(400).json({ error: 'INVALID_ORDER_ID' });
  }

  const processed = await fulfillOrderById(id);
  return res.status(processed.responseStatus).json(processed.body);
});

app.post('/api/orders/:id/email/retry', async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ error: 'INVALID_ORDER_ID' });
  }

  if (!isDatabaseConfigured()) {
    return res.status(500).json({ error: 'ORDER_CONFIG_MISSING' });
  }

  try {
    const order = await loadOrderForFulfillment(id);
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    if (order.supplier_status !== 'delivered' || getSavedCodes(order).length === 0) {
      return res.status(409).json({ error: 'ORDER_NOT_DELIVERED' });
    }

    const emailDelivery = await sendDeliveredOrderEmail({
      ...order,
      email_status: order.email_status === 'sent' ? 'sent' : 'pending',
    });
    return res.json({
      ok: emailDelivery.status === 'sent',
      emailDelivery,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'EMAIL_SEND_FAILED' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  const { id } = req.params;

  if (
    !isValidUuid(id)
  ) {
    return res.status(400).json({ error: 'INVALID_ORDER_ID' });
  }

  if (!isDatabaseConfigured()) {
    return res.status(500).json({ error: 'ORDER_CONFIG_MISSING' });
  }

  try {
    const result = await query(
      `SELECT
        id,
        order_number,
        alfa_order_id,
        category_id,
        card_id,
        quantity,
        amount,
        currency,
        customer_email,
        payment_status,
        supplier_status,
        supplier_order_id,
        email_status,
        email_sent_at,
        email_error,
        email_message_id,
        created_at,
        updated_at
      FROM orders
      WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    }

    return res.json({
      ok: true,
      order: formatOrder(result.rows[0], {
        includeSupplierOrderId: true,
        includeTimestamps: true,
      }),
    });
  } catch (_error) {
    return res.status(500).json({ error: 'ORDER_STORAGE_FAILED' });
  }
});

app.post('/api/payment/register', express.json({ limit: '16kb' }), async (req, res) => {
  const { orderNumber, amount, description } = req.body ?? {};

  if (typeof orderNumber !== 'string' || orderNumber.trim() === '' || orderNumber.length > 36) {
    return res.status(400).json({ error: 'INVALID_ORDER_NUMBER' });
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_AMOUNT' });
  }

  if (!ALFA_API_BASE || !ALFA_USERNAME || !ALFA_PASSWORD || !ALFA_RETURN_URL) {
    return res.status(500).json({ error: 'ALFA_CONFIG_MISSING' });
  }

  try {
    const payload = await registerAlfaOrder({
      orderNumber: orderNumber.trim(),
      amount,
      description,
    });

    if (payload?.errorCode) {
      return res.status(502).json({
        error: 'ALFA_REGISTER_FAILED',
        errorCode: String(payload.errorCode),
        errorMessage: payload.errorMessage ?? '',
      });
    }

    if (!payload?.orderId || !payload?.formUrl) {
      return res.status(502).json({ error: 'ALFA_REQUEST_FAILED' });
    }

    return res.json({
      ok: true,
      orderId: payload.orderId,
      formUrl: payload.formUrl,
    });
  } catch (_error) {
    return res.status(502).json({ error: 'ALFA_REQUEST_FAILED' });
  }
});

app.post('/api/payment/status', express.json({ limit: '16kb' }), async (req, res) => {
  const { orderId } = req.body ?? {};

  if (typeof orderId !== 'string' || orderId.trim() === '' || orderId.length > 36) {
    return res.status(400).json({ error: 'INVALID_ORDER_ID' });
  }

  if (!ALFA_API_BASE || !ALFA_USERNAME || !ALFA_PASSWORD) {
    return res.status(500).json({ error: 'ALFA_CONFIG_MISSING' });
  }

  const trimmedOrderId = orderId.trim();

  try {
    const payload = await fetchAlfaOrderStatus(trimmedOrderId);
    const errorCode = payload?.ErrorCode;

    if (errorCode !== undefined && String(errorCode) !== '0') {
      return res.status(502).json({
        error: 'ALFA_STATUS_FAILED',
        errorCode: String(errorCode),
        errorMessage: payload.ErrorMessage ?? '',
      });
    }

    return res.json({
      ok: true,
      orderId: trimmedOrderId,
      orderNumber: payload?.OrderNumber,
      orderStatus: payload?.OrderStatus,
      amount: payload?.Amount,
      currency: payload?.currency,
    });
  } catch (_error) {
    return res.status(502).json({ error: 'ALFA_REQUEST_FAILED' });
  }
});

app.get('/api/payment/success', (req, res) => {
  const redirectUrl = new URL('/', `${req.protocol}://${req.get('host')}`);
  redirectUrl.searchParams.set('payment', 'success');
  if (typeof req.query.mdmOrderId === 'string' && req.query.mdmOrderId.trim() !== '') {
    redirectUrl.searchParams.set('mdmOrderId', req.query.mdmOrderId.trim());
  }
  res.redirect(303, `${redirectUrl.pathname}${redirectUrl.search}`);
});

if (STATIC_DIR) {
  app.get('/app-icon.svg', (_req, res) => {
    res.type('image/svg+xml').sendFile(path.resolve(STATIC_DIR, 'icon.svg'));
  });

  app.get('/favicon.ico', (_req, res) => {
    res.type('image/svg+xml').sendFile(path.resolve(STATIC_DIR, 'icon.svg'));
  });

  app.use(express.static(STATIC_DIR, { extensions: ['html'] }));
}

app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

app.listen(PORT, () => {
  console.log(
    `[boot] listening on :${PORT}${STATIC_DIR ? ` (static from ${STATIC_DIR})` : ''}`,
  );
  setTimeout(() => {
    void reconcilePaidOrders();
  }, 5_000);
  setInterval(() => {
    void reconcilePaidOrders();
  }, FULFILLMENT_RECONCILE_INTERVAL_MS);
});
