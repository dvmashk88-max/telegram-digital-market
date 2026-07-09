import { MAX_API_BASE, MAX_BOT_TOKEN } from '../config.mjs';
import { MAX_WEBHOOK_URL, setMaxWebhook } from '../examples/backend-node/max-bot.mjs';

if (!MAX_API_BASE || !MAX_BOT_TOKEN) {
  console.error('MAX_API_BASE and MAX_BOT_TOKEN must be configured.');
  process.exit(1);
}

try {
  const result = await setMaxWebhook();
  console.log(
    JSON.stringify(
      {
        ok: true,
        webhookUrl: MAX_WEBHOOK_URL,
        result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        webhookUrl: MAX_WEBHOOK_URL,
        status: error.status,
        responseBody: error.responseBody,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
