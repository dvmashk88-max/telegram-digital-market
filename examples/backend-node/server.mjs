import express from 'express';
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
  STATIC_DIR as STATIC_DIR_FROM_ENV,
} from '../../config.mjs';
import {
  getMaxStatus,
  handleMaxWebhookPayload,
  MAX_WEBHOOK_URL,
} from './max-bot.mjs';

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

if (!FAZERCARDS_API_BASE || !FAZERCARDS_API_KEY) {
  console.warn(
    '[boot] Missing FAZERCARDS_API_BASE / FAZERCARDS_API_KEY — /api/fazercards/giftcards will return 500 until they are set.',
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

app.get('/api/payment/success', (_req, res) => {
  res.json({
    ok: true,
    status: 'PAYMENT_RETURN_RECEIVED',
    message: 'Возврат с платежной страницы получен',
  });
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
});
