# Telegram Digital Market

Telegram Mini App storefront with an Express backend, PostgreSQL order state,
Alfa acquiring, FazerCards catalog integration, and SMTP delivery.

## Structure

- `examples/react` — Vite + React Telegram Mini App.
- `examples/backend-node` — Express API, Telegram webhook, order processing, and catalog proxy.
- `examples/backend-node/migrations` — ordered PostgreSQL migrations.
- `scripts` — webhook registration and catalog/pricing verification helpers.

## Safety status

Real FazerCards ordering is hard-disabled in code during Telegram migration.
The catalog remains available read-only. Setting
`ENABLE_FAZER_GIFTCARD_ORDERS=true` does not bypass the code lock.

Do not register the Telegram webhook, run migrations, or enable supplier
ordering until the deployment checklist has been reviewed.

## Environment

Required for Telegram:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `PUBLIC_APP_URL`
- `TELEGRAM_WEBAPP_URL` optional; defaults to `PUBLIC_APP_URL`
- `TELEGRAM_SUPPORT_URL` optional until a real support link is supplied

Required for checkout and delivery:

- `DATABASE_URL`
- `FAZERCARDS_API_BASE`
- `FAZERCARDS_API_KEY`
- `ALFA_API_BASE`
- `ALFA_USERNAME`
- `ALFA_PASSWORD`
- `ALFA_RETURN_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`

## Commands

```bash
npm run build
npm test
npm run db:migrate
npm run telegram:set-webhook
npm start
```

`db:migrate` and `telegram:set-webhook` mutate external state and must only be
run as explicit release steps.
