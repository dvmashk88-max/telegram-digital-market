import { FAZERCARDS_API_BASE, FAZERCARDS_API_KEY } from '../../config.mjs';

// Development safety lock. Real supplier ordering remains impossible even if the
// Railway feature flag is accidentally set to true. Enabling ordering requires a
// deliberate code change, review, tests, and a later deployment.
export const FAZERCARDS_ORDERING_HARD_DISABLED = true;

export function isFazerCardsOrderingEnabled() {
  return !FAZERCARDS_ORDERING_HARD_DISABLED
    && process.env.ENABLE_FAZER_GIFTCARD_ORDERS === 'true';
}

export function getFazerCardsOrderingDisabledResponse() {
  return {
    responseStatus: 503,
    body: { error: 'FAZERCARDS_ORDERING_DISABLED' },
  };
}

export function assertFazerCardsOrderingEnabled() {
  if (!isFazerCardsOrderingEnabled()) {
    const error = new Error('FAZERCARDS_ORDERING_DISABLED');
    error.code = 'FAZERCARDS_ORDERING_DISABLED';
    throw error;
  }
}

export async function createFazerGiftcardOrder(
  { categoryId, cardId, quantity, idempotencyKey },
  { fetchImpl = fetch } = {},
) {
  // Last-line guard lives immediately next to the only supplier write request.
  assertFazerCardsOrderingEnabled();
  const response = await fetchImpl(`${FAZERCARDS_API_BASE.replace(/\/$/, '')}/api/v2/giftcards/order`, {
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
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    payload: text ? JSON.parse(text) : null,
  };
}
