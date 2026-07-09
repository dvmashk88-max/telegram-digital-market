# MAX Digital Market

React storefront for digital goods with a Node.js backend proxy for FazerCards.

## Structure

- `examples/react` — Vite + React storefront.
- `examples/backend-node` — Express backend for health checks, static files, and FazerCards proxy endpoints.
- `scripts` — catalog/pricing verification helpers.

## Environment

Required for live FazerCards catalog data:

- `FAZERCARDS_API_BASE`
- `FAZERCARDS_API_KEY`

Prepared for the next MAX integration step:

- `MAX_API_BASE`
- `MAX_BOT_TOKEN`

Optional:

- `PORT` — backend port, defaults to `3351`.
- `ALLOWED_ORIGIN` — CORS origin, defaults to `*`.
- `STATIC_DIR` — static frontend directory, defaults to `examples/react/dist`.
- `VIOLET_CATALOG_URL` — optional catalog URL for pricing verification scripts.

## Commands

```bash
npm run build
npm start
```

The build script installs and builds the React app. The start script serves the built storefront through the Node backend.
