# MAX Digital Market Backend

Express backend for the React storefront.

## Endpoints

- `GET /health` — liveness probe.
- `GET /config.json` — frontend config from the built static directory.
- `GET /api/fazercards/giftcards` — FazerCards gift card proxy.
- `GET /api/fazercards/violet-catalog` — normalized catalog used by the storefront.

## Environment

All environment variables are read in the root `config.mjs`.

- `FAZERCARDS_API_BASE`
- `FAZERCARDS_API_KEY`
- `MAX_API_BASE`
- `MAX_BOT_TOKEN`
- `PORT` optional, defaults to `3351`.
- `ALLOWED_ORIGIN` optional, defaults to `*`.
- `STATIC_DIR` optional, points to the built React app.

`MAX_API_BASE` and `MAX_BOT_TOKEN` are prepared for the next integration step. They are exported from the root `config.mjs` but no MAX API calls are implemented yet.
