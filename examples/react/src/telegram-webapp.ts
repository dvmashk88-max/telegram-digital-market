export function getTelegramWebApp() {
  return window.Telegram?.WebApp ?? null;
}

export function initializeTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
}

export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

export function openTelegramExternalLink(url: string): boolean {
  const webApp = getTelegramWebApp();
  if (webApp) {
    try {
      webApp.openLink(url);
      return true;
    } catch (_error) {
      // Fall back to a normal browser window below.
    }
  }
  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
}
