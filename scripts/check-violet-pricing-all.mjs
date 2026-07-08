const CATALOG_URL = process.env.VIOLET_CATALOG_URL || '';
const ANTARCTIC_USDT_RATE_RUB = 77.95;
const CATALOG_MARKUP_RATE = 0.5;
const CHECK_RU_PURCHASE_PRICES = [
  { nominal: 600, purchasePriceUsd: 16.97 },
  { nominal: 700, purchasePriceUsd: 19.80 },
  { nominal: 800, purchasePriceUsd: 22.62 },
  { nominal: 900, purchasePriceUsd: 25.45 },
  { nominal: 1000, purchasePriceUsd: 30.72 },
  { nominal: 1500, purchasePriceUsd: 42.42 },
];

function roundStorePriceUsdt(priceUsdt) {
  const ceilToTenth = (value) => Number((Math.ceil((value - Number.EPSILON) * 10) / 10).toFixed(2));
  if (priceUsdt < 1) return Math.max(0.5, ceilToTenth(priceUsdt));
  if (priceUsdt < 10) return ceilToTenth(priceUsdt);
  return Math.ceil(priceUsdt - Number.EPSILON);
}

function expectedSalePrice(purchasePriceUsd) {
  return roundStorePriceUsdt(purchasePriceUsd * (1 + CATALOG_MARKUP_RATE));
}

function assertPricedEntity(label, entity) {
  const purchasePriceUsd = Number(entity.rawPriceUsd);
  if (!Number.isFinite(purchasePriceUsd) || purchasePriceUsd <= 0) {
    throw new Error(`${label} has invalid rawPriceUsd: ${entity.rawPriceUsd}`);
  }

  const expectedPriceUsdt = expectedSalePrice(purchasePriceUsd);
  if (entity.priceUsdt !== expectedPriceUsdt) {
    throw new Error(`${label} expected ${expectedPriceUsdt} USDT from rawPriceUsd ${entity.rawPriceUsd}, got ${entity.priceUsdt}`);
  }

  const expectedPriceRubApprox = Math.round(expectedPriceUsdt * ANTARCTIC_USDT_RATE_RUB);
  if (entity.priceRubApprox !== expectedPriceRubApprox) {
    throw new Error(`${label} expected ${expectedPriceRubApprox} RUB approx, got ${entity.priceRubApprox}`);
  }
}

console.log('Expected sale prices from FazerCards purchase price with +50% markup');
for (const { nominal, purchasePriceUsd } of CHECK_RU_PURCHASE_PRICES) {
  console.log(`Apple RU ${nominal} RUB @ ${purchasePriceUsd.toFixed(2)} USD -> ${expectedSalePrice(purchasePriceUsd)} USDT`);
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
      console.log(`${product.productId}: ${offers.length} variants match rawPriceUsd * 1.50`);
      continue;
    }

    if (product.rawPriceUsd !== null && product.rawPriceUsd !== undefined && product.priceUsdt !== undefined) {
      assertPricedEntity(product.productId, product);
      console.log(`${product.productId}: product price matches rawPriceUsd * 1.50`);
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
      console.log(`Apple RU ${nominal} RUB @ ${Number(offer.rawPriceUsd).toFixed(2)} USD catalog -> ${offer.priceUsdt} USDT`);
    }
  }
}
