import { setTelegramWebhook, getTelegramWebhookUrl } from '../examples/backend-node/telegram-bot.mjs';

try {
  const result = await setTelegramWebhook();
  console.log(JSON.stringify({ ok: true, webhookUrl: getTelegramWebhookUrl(), result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    webhookUrl: getTelegramWebhookUrl() || null,
    error: error.message,
    status: error.status ?? null,
  }, null, 2));
  process.exitCode = 1;
}
