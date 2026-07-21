import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createFazerGiftcardOrder,
  FAZERCARDS_ORDERING_HARD_DISABLED,
  isFazerCardsOrderingEnabled,
} from './fazercards-ordering.mjs';

test('supplier ordering stays hard-disabled even when the environment flag is true', () => {
  const previous = process.env.ENABLE_FAZER_GIFTCARD_ORDERS;
  process.env.ENABLE_FAZER_GIFTCARD_ORDERS = 'true';
  try {
    assert.equal(FAZERCARDS_ORDERING_HARD_DISABLED, true);
    assert.equal(isFazerCardsOrderingEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_FAZER_GIFTCARD_ORDERS;
    else process.env.ENABLE_FAZER_GIFTCARD_ORDERS = previous;
  }
});

test('the supplier POST cannot reach fetch while the hard lock is enabled', async () => {
  let fetchCount = 0;
  await assert.rejects(
    createFazerGiftcardOrder({
      categoryId: 'test-category',
      cardId: 'test-card',
      quantity: 1,
      idempotencyKey: 'test-key',
    }, {
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error('fetch must never be reached');
      },
    }),
    { code: 'FAZERCARDS_ORDERING_DISABLED' },
  );
  assert.equal(fetchCount, 0);
});

test('all server purchase entry points use the centralized ordering guard', async () => {
  const serverSource = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.match(serverSource, /app\.post\('\/api\/fazercards\/giftcards\/order'[\s\S]*?isFazerCardsOrderingEnabled\(\)/);
  assert.match(serverSource, /app\.post\('\/api\/orders\/:id\/fulfill'[\s\S]*?isFazerCardsOrderingEnabled\(\)/);
  assert.match(serverSource, /async function fulfillOrderById[\s\S]*?isFazerCardsOrderingEnabled\(\)/);
  assert.match(serverSource, /async function loadFulfillmentReconcileCandidates[\s\S]*?isFazerCardsOrderingEnabled\(\)/);
  assert.doesNotMatch(serverSource, /fetch\([^\n]*\/api\/v2\/giftcards\/order/);
});
