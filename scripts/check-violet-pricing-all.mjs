import { VIOLET_CATALOG_URL } from '../config.mjs';

const CATALOG_URL = VIOLET_CATALOG_URL;
const USD_TO_RUB = 90;
const MARKUP_PERCENT = 50;
const CHECK_RU_PURCHASE_PRICES = [
  { nominal: 600, purchasePriceUsd: 16.97 },
  { nominal: 700, purchasePriceUsd: 19.80 },
  { nominal: 800, purchasePriceUsd: 22.62 },
  { nominal: 900, purchasePriceUsd: 25.45 },
  { nominal: 1000, purchasePriceUsd: 30.72 },
  { nominal: 1500, purchasePriceUsd: 42.42 },
];

function calculateSalePriceFromPurchaseUsd(purchasePriceUsd) {
  return Math.round(purchasePriceUsd * USD_TO_RUB * (1 + MARKUP_PERCENT / 100));
}

function assertPricedEntity(label, entity) {
  const purchasePriceUsd = Number(entity.rawPriceUsd);
  if (!Number.isFinite(purchasePriceUsd) || purchasePriceUsd <= 0) {
    throw new Error(`${label} has invalid rawPriceUsd: ${entity.rawPriceUsd}`);
  }

  const expectedPriceRub = calculateSalePriceFromPurchaseUsd(purchasePriceUsd);
  if (entity.priceRub !== expectedPriceRub) {
    throw new Error(`${label} expected ${expectedPriceRub} RUB from rawPriceUsd ${entity.rawPriceUsd}, got ${entity.priceRub}`);
  }
}

console.log('Expected RUB sale prices from FazerCards purchase price with +50% markup');
for (const { nominal, purchasePriceUsd } of CHECK_RU_PURCHASE_PRICES) {
  console.log(`Apple RU ${nominal} RUB @ ${purchasePriceUsd.toFixed(2)} USD -> ${calculateSalePriceFromPurchaseUsd(purchasePriceUsd)} RUB`);
}

if (CATALOG_URL) {
  const response = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Catalog HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  const unpriced = [];
  console.log(`Catalog URL: ${CATALOG_URL}`);

  for (const product of payload.items ?? []) {
    const offers = Array.isArray(product.offers) ? product.offers : [];
    if (offers.length > 0) {
      for (const offer of offers) {
        assertPricedEntity(`${product.productId} ${offer.nominal} ${offer.currency ?? offer.name ?? ''}`.trim(), offer);
      }
      console.log(`${product.productId}: ${offers.length} variants match rawPriceUsd * ${USD_TO_RUB} * 1.50`);
      continue;
    }

    if (product.rawPriceUsd !== null && product.rawPriceUsd !== undefined && product.priceRub !== undefined) {
      assertPricedEntity(product.productId, product);
      console.log(`${product.productId}: product price matches rawPriceUsd * ${USD_TO_RUB} * 1.50`);
      continue;
    }

    unpriced.push(product.productId);
  }

  if (unpriced.length > 0) {
    console.warn(`Unpriced products without usable FazerCards purchase price: ${unpriced.join(', ')}`);
  }

  const appleRu = payload.items?.find((item) => item.productId === 'apple-ru');
  if (appleRu?.offers) {
    for (const { nominal } of CHECK_RU_PURCHASE_PRICES) {
      const offer = appleRu.offers.find((item) => item.nominal === nominal);
      if (!offer) {
        console.log(`Apple RU ${nominal} RUB catalog -> not in current FazerCards offers`);
        continue;
      }
      console.log(`Apple RU ${nominal} RUB @ ${Number(offer.rawPriceUsd).toFixed(2)} USD catalog -> ${offer.priceRub} RUB`);
    }
  }
}
