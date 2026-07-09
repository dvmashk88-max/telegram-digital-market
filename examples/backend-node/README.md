# MAX Digital Market Backend

Express backend for the React storefront.

## Endpoints

- `GET /health` — liveness probe.
- `GET /config.json` — frontend config from the built static directory.
- `GET /api/fazercards/giftcards` — FazerCards gift card proxy.
- `GET /api/fazercards/violet-catalog` — normalized catalog used by the storefront.
- `GET /api/max/status` — MAX bot configuration status without exposing the token.
- `POST /api/max/webhook` — MAX Bot API webhook endpoint.
- `GET /api/max/webhook` — webhook URL helper.

## Environment

All environment variables are read in the root `config.mjs`.

- `FAZERCARDS_API_BASE`
- `FAZERCARDS_API_KEY`
- `MAX_API_BASE`
- `MAX_BOT_TOKEN`
- `PORT` optional, defaults to `3351`.
- `ALLOWED_ORIGIN` optional, defaults to `*`.
- `STATIC_DIR` optional, points to the built React app.

The webhook URL for Railway is:

`https://max-bot-production-6049.up.railway.app/api/max/webhook`

To register the webhook using Railway environment variables, run:

`railway run npm run max:set-webhook`
