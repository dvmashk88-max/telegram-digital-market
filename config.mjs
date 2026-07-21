export const PORT = Number.parseInt(process.env.PORT ?? '3351', 10);

export const FAZERCARDS_API_BASE = process.env.FAZERCARDS_API_BASE ?? '';
export const FAZERCARDS_API_KEY = process.env.FAZERCARDS_API_KEY ?? '';

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
export const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL ?? '';
export const TELEGRAM_WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL ?? PUBLIC_APP_URL;
export const TELEGRAM_SUPPORT_URL = process.env.TELEGRAM_SUPPORT_URL ?? '';

export const ALFA_API_BASE = process.env.ALFA_API_BASE ?? '';
export const ALFA_USERNAME = process.env.ALFA_USERNAME ?? '';
export const ALFA_PASSWORD = process.env.ALFA_PASSWORD ?? '';
export const ALFA_RETURN_URL = process.env.ALFA_RETURN_URL ?? '';

export const DATABASE_URL = process.env.DATABASE_URL ?? '';

export const SMTP_HOST = process.env.SMTP_HOST ?? '';
export const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT ?? '465', 10);
export const SMTP_USER = process.env.SMTP_USER ?? '';
export const SMTP_PASSWORD = process.env.SMTP_PASSWORD ?? '';
export const TEST_EMAIL = process.env.TEST_EMAIL ?? '';

export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
export const STATIC_DIR = process.env.STATIC_DIR ?? '';

export const VIOLET_CATALOG_URL = process.env.VIOLET_CATALOG_URL ?? '';
