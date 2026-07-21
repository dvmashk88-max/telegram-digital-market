# Telegram Digital Market Backend

Express backend for the Telegram Mini App storefront.

## Telegram endpoints

- `GET /api/telegram/status` — non-secret configuration status.
- `POST /api/telegram/webhook` — Bot API webhook protected by
  `X-Telegram-Bot-Api-Secret-Token`.
- `GET /api/public-config` — public, non-secret frontend configuration.

The bot handles `/start` only in private chats and sends a Telegram `web_app`
button. Checkout accepts raw Mini App `initData`, validates its HMAC and age on
the server, and derives `telegram_user_id` only from the signed user object.

## Supplier safety lock

`fazercards-ordering.mjs` contains a hard code lock next to the only supplier
order POST. The following paths cannot create a supplier order while it is on:

- automatic fulfillment;
- `POST /api/orders/:id/fulfill`;
- `POST /api/fazercards/giftcards/order`;
- background reconciliation;
- direct use of the supplier-order helper.

Read-only catalog and status requests remain available.

## Release-only commands

```bash
npm run db:migrate
npm run telegram:set-webhook
```

Do not run either command until the database migration and public webhook URL
are approved.
