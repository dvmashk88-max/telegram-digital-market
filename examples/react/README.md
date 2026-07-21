# Telegram Digital Market Mini App

Vite + React storefront designed to open from a Telegram bot `web_app` button.

The official Telegram Web Apps SDK is loaded before the frontend bundle. The
app calls `Telegram.WebApp.ready()` and `expand()`, sends raw `initData` to the
backend during checkout, and uses `Telegram.WebApp.openLink()` for the external
Alfa payment page with a normal-browser fallback.

```bash
npm install
npm run dev
npm run build
```

Catalog browsing works in a regular browser. Checkout requires valid Telegram
Mini App `initData` and is rejected when the site is opened directly.
