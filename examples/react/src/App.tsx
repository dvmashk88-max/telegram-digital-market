/**
 * Antarctic Violet (React) — storefront prototype inside Antarctic Wallet.
 *
 * Standalone run: http://localhost:5175
 * When embedded: the wallet loads this app inside an iframe and passes its
 * origin via the ?parentOrigin=... query parameter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AWSDK,
  AWInitError,
  AWOperationError,
  AWScopeError,
  AWSessionError,
  AWTimeoutError,
} from '@antarctic-wallet/aw-sdk';
import type { AWSession, AWUserContext } from '@antarctic-wallet/aw-sdk';

// ── Types ───────────────────────────────────────────────────────────────────

interface AppConfig {
  id: string;
  name: string;
  requiredScopes: string[];
  diagnostics?: {
    awAppIdPresent?: boolean;
    appIdSource?: 'env' | 'fallback' | 'missing';
  };
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

type AppStatus = 'idle' | 'connecting' | 'ready' | 'error';
type CategoryId = 'telegram' | 'steam' | 'gift-cards' | 'game-top-up';
type OrderStatus = 'idle' | 'preview';
type OrderFlow = 'code_delivery' | 'steam_balance' | 'telegram_stars' | 'telegram_premium' | 'game_balance';
type OrderFieldKey = 'steamLogin' | 'telegramUsername' | 'playerId' | 'serverRegion';

interface OrderFields {
  steamLogin: string;
  telegramUsername: string;
  playerId: string;
  serverRegion: string;
}

interface Category {
  id: CategoryId;
  name: string;
  subtitle: string;
}

interface Product {
  id: string;
  category: CategoryId;
  name: string;
  description: string;
  denominations: number[];
  nominalCurrency?: 'TRY' | 'USD' | 'RUB' | 'INR';
  orderFlow: OrderFlow;
  accent: string;
}

interface VioletCatalogItem {
  productId: string;
  source: string;
  externalId: string | null;
  categoryId: string | null;
  cardId: string | null;
  name: string;
  note: string | null;
  denominations: number[];
  supplierPrice: string | number | null;
  rawPriceUsd?: string | number | null;
  priceUsdt?: number;
  priceRubApprox?: number;
  available: boolean;
  orderFlow?: OrderFlow;
  orderEndpoint?: string | null;
  requiredFields?: OrderFieldKey[];
  offers?: VioletCatalogOffer[];
  raw?: Record<string, unknown>;
}

interface VioletCatalogOffer {
  cardId: string | null;
  nominal: number;
  currency?: 'TRY' | 'USD' | 'RUB' | 'INR';
  name: string | null;
  rawPriceUsd?: string | number | null;
  stock?: number | null;
  minOrderQuantity?: number | null;
  maxOrderQuantity?: number | null;
  priceUsdt?: number;
  priceRubApprox?: number;
}

const APP_ID_STORAGE_KEY = 'aw-demo:appId';
const AW_SDK_SESSION_STORAGE_PREFIX = 'aw-sdk:session:';
const AW_SDK_STORAGE_PREFIX = 'aw-sdk:';
const VIOLET_CATALOG_ENDPOINT =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3351/api/fazercards/violet-catalog'
    : 'https://example-app-production-e00d.up.railway.app/api/fazercards/violet-catalog';
const APP_DISPLAY_NAME = 'Маркет цифровых товаров';

const CATEGORIES: Category[] = [
  { id: 'gift-cards', name: 'Apple', subtitle: 'Подарочные карты' },
  { id: 'steam', name: 'Steam', subtitle: 'Пополнение кошелька' },
  { id: 'game-top-up', name: 'Игры', subtitle: 'Баланс игрока' },
  { id: 'telegram', name: 'Telegram', subtitle: 'Stars и Premium' },
];

const ANTARCTIC_USDT_RATE_RUB = 77.95;
const APP_STORE_POPULAR_NOMINALS: Record<string, number[]> = {
  'apple-tr': [10, 50, 100, 250, 500, 1000],
  'apple-us': [5, 10, 25, 50, 100, 200],
  'apple-ru': [500, 1000, 2000, 3000, 5000, 8000],
  'apple-in': [100, 200, 500, 1000, 2000, 5000],
};
const EMPTY_ORDER_FIELDS: OrderFields = {
  steamLogin: '',
  telegramUsername: '',
  playerId: '',
  serverRegion: '',
};

const PRODUCTS: Product[] = [
  {
    id: 'apple-tr',
    category: 'gift-cards',
    name: 'App Store & iTunes (Турция)',
    description: 'Подарочная карта App Store и iTunes для турецкого аккаунта Apple. Код можно сохранить и активировать позже.',
    denominations: [],
    nominalCurrency: 'TRY',
    orderFlow: 'code_delivery',
    accent: 'violet',
  },
  {
    id: 'apple-us',
    category: 'gift-cards',
    name: 'App Store & iTunes (США)',
    description: 'Подарочная карта App Store и iTunes для американского аккаунта Apple. Код можно сохранить и активировать позже.',
    denominations: [],
    nominalCurrency: 'USD',
    orderFlow: 'code_delivery',
    accent: 'blue',
  },
  {
    id: 'apple-ru',
    category: 'gift-cards',
    name: 'App Store & iTunes (Россия)',
    description: 'Подарочная карта App Store и iTunes для российского аккаунта Apple. Код можно сохранить и активировать позже.',
    denominations: [],
    nominalCurrency: 'RUB',
    orderFlow: 'code_delivery',
    accent: 'silver',
  },
  {
    id: 'apple-in',
    category: 'gift-cards',
    name: 'App Store & iTunes (Индия)',
    description: 'Подарочная карта App Store и iTunes для индийского аккаунта Apple. После оплаты код появится прямо здесь, в приложении.',
    denominations: [],
    nominalCurrency: 'INR',
    orderFlow: 'code_delivery',
    accent: 'cyan',
  },
  {
    id: 'roblox-gift-card',
    category: 'gift-cards',
    name: 'Подарочная карта Roblox',
    description: 'Подарочная карта Roblox для пополнения баланса аккаунта. Код можно активировать и использовать позже.',
    denominations: [10, 25, 50],
    orderFlow: 'code_delivery',
    accent: 'pink',
  },
  {
    id: 'playstation-gift-card',
    category: 'gift-cards',
    name: 'Подарочная карта PlayStation',
    description: 'Подарочная карта PlayStation Store для аккаунта указанного региона. Код можно активировать и использовать позже.',
    denominations: [10, 25, 50],
    orderFlow: 'code_delivery',
    accent: 'blue',
  },
  {
    id: 'xbox-gift-card',
    category: 'gift-cards',
    name: 'Подарочная карта Xbox',
    description: 'Подарочная карта Xbox для аккаунта Microsoft указанного региона. Код можно активировать и использовать позже.',
    denominations: [10, 25, 50],
    orderFlow: 'code_delivery',
    accent: 'green',
  },
  {
    id: 'steam-top-up',
    category: 'steam',
    name: 'Пополнение Steam',
    description: 'Пополнение Steam. Выберите доступный вариант и проверьте регион перед оплатой.',
    denominations: [5, 10, 20, 50, 100],
    orderFlow: 'steam_balance',
    accent: 'cyan',
  },
  {
    id: 'pubg',
    category: 'game-top-up',
    name: 'PUBG',
    description: 'Пополнение UC для аккаунта PUBG.',
    denominations: [5, 10, 25, 50],
    orderFlow: 'game_balance',
    accent: 'gold',
  },
  {
    id: 'free-fire',
    category: 'game-top-up',
    name: 'Free Fire',
    description: 'Пополнение алмазов для аккаунта Free Fire.',
    denominations: [2, 5, 10, 25],
    orderFlow: 'game_balance',
    accent: 'pink',
  },
  {
    id: 'telegram-stars',
    category: 'telegram',
    name: 'Telegram Stars',
    description: 'Пополнение Telegram Stars. Укажите данные аккаунта и проверьте заказ перед оплатой.',
    denominations: [2, 5, 10, 25, 50],
    orderFlow: 'telegram_stars',
    accent: 'violet',
  },
  {
    id: 'telegram-premium',
    category: 'telegram',
    name: 'Telegram Premium',
    description: 'Telegram Premium для выбранного срока. Проверьте данные аккаунта перед оплатой.',
    denominations: [5, 15, 30],
    orderFlow: 'telegram_premium',
    accent: 'blue',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveStoredAppId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('appId');
  if (fromQuery) {
    try {
      localStorage.setItem(APP_ID_STORAGE_KEY, fromQuery);
    } catch {
      //
    }
    return fromQuery;
  }
  try {
    return localStorage.getItem(APP_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getParentOrigin(insideWallet: boolean): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromParam = params.get('parentOrigin');
  if (fromParam) return fromParam;

  const ancestorOrigins = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  const fromAncestor = ancestorOrigins?.[0];
  if (fromAncestor) return fromAncestor;

  if (window.parent !== window && document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      //
    }
  }
  if (insideWallet) return null;
  return 'https://localhost:3310';
}

function resolveSdkAppId(configId: string, requestedAppId: string | null, insideWallet: boolean): string {
  const params = new URLSearchParams(window.location.search);
  if (insideWallet) return configId;
  return requestedAppId ?? params.get('appId') ?? configId;
}

function removeStorageKeys(
  storage: Storage,
  shouldRemove: (key: string) => boolean,
): string[] {
  const removed: string[] = [];
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key || !shouldRemove(key)) continue;
    storage.removeItem(key);
    removed.push(key);
  }
  return removed;
}

function clearWalletSdkStorageCache(insideWallet: boolean): string[] {
  const removed: string[] = [];

  try {
    const sessionKeys = removeStorageKeys(sessionStorage, (key) =>
      key.startsWith(AW_SDK_SESSION_STORAGE_PREFIX),
    );
    removed.push(...sessionKeys.map((key) => `sessionStorage:${key}`));
  } catch {
    //
  }

  try {
    const localSdkKeys = removeStorageKeys(localStorage, (key) =>
      key.startsWith(AW_SDK_STORAGE_PREFIX),
    );
    removed.push(...localSdkKeys.map((key) => `localStorage:${key}`));

    if (insideWallet && localStorage.getItem(APP_ID_STORAGE_KEY) !== null) {
      localStorage.removeItem(APP_ID_STORAGE_KEY);
      removed.push(`localStorage:${APP_ID_STORAGE_KEY}`);
    }
  } catch {
    //
  }

  return removed;
}

function handleSdkError(error: unknown): string {
  if (error instanceof AWOperationError) {
    return `Ошибка операции [${error.errorCode}]: ${error.message} (opId: ${error.operationId})`;
  }
  if (error instanceof AWInitError) return `Ошибка инициализации [${error.errorCode}]: ${error.message}`;
  if (error instanceof AWSessionError) return `Ошибка сессии [${error.errorCode}]: ${error.message}`;
  if (error instanceof AWScopeError) return `Ошибка доступа [${error.errorCode}]: ${error.message}`;
  if (error instanceof AWTimeoutError) return `Превышено время ожидания: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatStatus(status: AppStatus): string {
  const labels: Record<AppStatus, string> = {
    idle: 'ожидание',
    connecting: 'подключение',
    ready: 'готово',
    error: 'ошибка',
  };
  return labels[status];
}

function formatAppIdSource(source: 'env' | 'fallback' | 'missing'): string {
  const labels: Record<'env' | 'fallback' | 'missing', string> = {
    env: 'переменная окружения',
    fallback: 'конфиг',
    missing: 'не найден',
  };
  return labels[source];
}

function formatCategoryLabel(categoryId: CategoryId): string {
  const labels: Record<CategoryId, string> = {
    telegram: 'Telegram',
    steam: 'Steam',
    'gift-cards': 'Подарочные карты',
    'game-top-up': 'Игровые пополнения',
  };
  return labels[categoryId];
}

function formatUsdt(amount: number): string {
  return `${Number.isInteger(amount) ? amount.toString() : amount.toFixed(2)} USDT`;
}

function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

function formatNominalAmount(amount: number, currency?: VioletCatalogOffer['currency']): string {
  if (currency === 'RUB') return formatRub(amount);
  if (currency) return `${amount.toLocaleString('ru-RU')} ${currency}`;
  return formatUsdt(amount);
}

function formatOfferNominal(offer: VioletCatalogOffer, product: Product): string {
  if (!offer.currency && !product.nominalCurrency && offer.name) return offer.name;
  return formatNominalAmount(offer.nominal, offer.currency ?? product.nominalCurrency);
}

function maskIdentifier(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isAppStoreProduct(product: Product): boolean {
  return Boolean(product.nominalCurrency);
}

function resolveProductOffers(product: Product, meta: VioletCatalogItem | null): VioletCatalogOffer[] {
  if (meta?.offers?.length) return meta.offers;
  if (meta) {
    if (meta.denominations.length && meta.priceUsdt && meta.rawPriceUsd) {
      return meta.denominations.map((nominal) => ({
        cardId: meta.cardId,
        nominal,
        name: null,
        rawPriceUsd: meta.rawPriceUsd,
        priceUsdt: meta.priceUsdt,
        priceRubApprox: meta.priceRubApprox,
      }));
    }
    return [];
  }
  if (isAppStoreProduct(product)) return [];
  return product.denominations.map((nominal) => ({
    cardId: null,
    nominal,
    name: null,
  }));
}

function getProductCatalogState(product: Product, meta: VioletCatalogItem | null): string {
  if (isAppStoreProduct(product) || meta?.offers) {
    if (!meta) return 'Нет данных FazerCards';
    return meta.offers?.length ? `${meta.offers.length} вариантов` : 'Нет номиналов';
  }
  return meta ? 'Актуально' : 'Резерв';
}

function getProductBadge(product: Product, meta: VioletCatalogItem | null): string {
  if (product.id === 'apple-tr') return 'Регион: TR';
  if (product.id === 'apple-us') return 'Регион: US';
  if (product.id === 'apple-ru') return 'Регион: RU';
  if (product.id === 'apple-in') return 'Регион: IN';
  if (meta?.available === false) return 'Нет в наличии';
  return formatCategoryLabel(product.category);
}

function getOfferKey(offer: VioletCatalogOffer): string {
  return offer.cardId ?? `${offer.nominal}:${offer.currency ?? ''}`;
}

function isSameOffer(left: VioletCatalogOffer | null, right: VioletCatalogOffer): boolean {
  return Boolean(left && getOfferKey(left) === getOfferKey(right));
}

function getPopularOffers(product: Product, offers: VioletCatalogOffer[]): VioletCatalogOffer[] {
  if (!isAppStoreProduct(product)) return offers;
  const popularNominals = APP_STORE_POPULAR_NOMINALS[product.id] ?? [];
  const picked = popularNominals
    .map((nominal) => offers.find((offer) => offer.nominal === nominal))
    .filter((offer): offer is VioletCatalogOffer => Boolean(offer));

  if (picked.length >= 4) return picked;

  const pickedKeys = new Set(picked.map(getOfferKey));
  const ranked = offers
    .filter((offer) => !pickedKeys.has(getOfferKey(offer)))
    .map((offer) => ({
      offer,
      distance: Math.min(...popularNominals.map((nominal) => Math.abs(offer.nominal - nominal))),
    }))
    .sort((a, b) => a.distance - b.distance || a.offer.nominal - b.offer.nominal)
    .map(({ offer }) => offer);

  return [...picked, ...ranked].slice(0, 6).sort((a, b) => a.nominal - b.nominal);
}

function getDefaultOffer(product: Product, offers: VioletCatalogOffer[]): VioletCatalogOffer | null {
  if (!isAppStoreProduct(product)) return offers[0] ?? null;
  return getPopularOffers(product, offers)[0] ?? offers[0] ?? null;
}

function resolveOrderFlow(product: Product, meta: VioletCatalogItem | null): OrderFlow {
  return meta?.orderFlow ?? product.orderFlow;
}

function getRequiredOrderFields(orderFlow: OrderFlow, meta: VioletCatalogItem | null): OrderFieldKey[] {
  if (meta?.requiredFields?.length) return meta.requiredFields;
  if (orderFlow === 'steam_balance') return ['steamLogin'];
  if (orderFlow === 'telegram_stars' || orderFlow === 'telegram_premium') return ['telegramUsername'];
  if (orderFlow === 'game_balance') return ['playerId'];
  return [];
}

function normalizeTelegramUsername(value: string): string {
  const trimmed = value.trim().replace(/^@+/, '');
  return trimmed ? `@${trimmed}` : '';
}

function getOrderFlowTitle(orderFlow: OrderFlow): string {
  const labels: Record<OrderFlow, string> = {
    code_delivery: 'Как вы получите код',
    steam_balance: 'Пополнение Steam',
    telegram_stars: 'Telegram Stars',
    telegram_premium: 'Telegram Premium',
    game_balance: 'Игровое пополнение',
  };
  return labels[orderFlow];
}

function getOrderFlowHint(orderFlow: OrderFlow): string {
  const hints: Record<OrderFlow, string> = {
    code_delivery: 'После оплаты код появится прямо здесь, в приложении.',
    steam_balance: 'Пополнение будет зачислено на указанный аккаунт Steam. Проверьте логин перед оплатой.',
    telegram_stars: 'Stars будут начислены на указанный аккаунт Telegram. Укажите username без ошибок.',
    telegram_premium: 'Premium будет оформлен на указанный аккаунт Telegram. Проверьте username перед оплатой.',
    game_balance: 'Пополнение будет зачислено на указанный игровой аккаунт. Проверьте ID и регион перед оплатой.',
  };
  return hints[orderFlow];
}

function getDeliverySummary(orderFlow: OrderFlow): string {
  const summaries: Record<OrderFlow, string> = {
    code_delivery: 'код будет показан в приложении после оплаты',
    steam_balance: 'пополнение на аккаунт Steam',
    telegram_stars: 'Stars на указанный Telegram аккаунт',
    telegram_premium: 'Premium на указанный Telegram аккаунт',
    game_balance: 'пополнение игрового аккаунта',
  };
  return summaries[orderFlow];
}

function isOrderFieldFilled(field: OrderFieldKey, orderFields: OrderFields): boolean {
  if (field === 'telegramUsername') return normalizeTelegramUsername(orderFields.telegramUsername).length > 1;
  return orderFields[field].trim().length > 0;
}

// ── Component ───────────────────────────────────────────────────────────────

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [session, setSession] = useState<AWSession | null>(null);
  const [user, setUser] = useState<AWUserContext | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [sdkDiagnostics, setSdkDiagnostics] = useState({
    appId: '',
    requestedAppId: '',
    awAppIdPresent: false,
    appIdSource: 'missing' as 'env' | 'fallback' | 'missing',
    origin: '',
    parentOrigin: '',
    scopes: [] as string[],
  });
  const [insideWallet, setInsideWallet] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [appId, setAppId] = useState<string | null>(() => resolveStoredAppId());
  const [appIdInput, setAppIdInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('gift-cards');
  const [selectedProductId, setSelectedProductId] = useState('apple-tr');
  const [selectedOffer, setSelectedOffer] = useState<VioletCatalogOffer | null>(null);
  const [showAllDenominations, setShowAllDenominations] = useState(false);
  const [orderFields, setOrderFields] = useState<OrderFields>(EMPTY_ORDER_FIELDS);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('idle');
  const [violetCatalog, setVioletCatalog] = useState<Record<string, VioletCatalogItem>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const sdkRef = useRef<AWSDK | null>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  }, []);

  /**
   * Full SDK bootstrap — preserved from the Antarctic Wallet example:
   * detects iframe mode, loads app config, opens postMessage channel,
   * subscribes to SDK events, and performs sdk.init().
   */
  useEffect(() => {
    let destroyed = false;
    const detectedInsideWallet = AWSDK.isInsideWallet();
    setInsideWallet(detectedInsideWallet);
    setSdkError(null);
    addLog(`Запуск внутри кошелька: ${detectedInsideWallet ? 'да' : 'нет'}`);

    if (!appId && !detectedInsideWallet) {
      addLog('Ожидается App ID...', 'warn');
      return;
    }

    (async () => {
      const cfg: AppConfig = await fetch('/config.json').then((r) => r.json());
      if (destroyed) return;
      setConfig(cfg);

      const parentOrigin = getParentOrigin(detectedInsideWallet);
      if (!parentOrigin) {
        const message = 'Origin кошелька недоступен. Откройте приложение из Antarctic Wallet Dev Mode или передайте ?parentOrigin=<wallet-origin>.';
        addLog(message, 'error');
        setSdkError(message);
        setStatus('error');
        return;
      }
      const sdkAppId = resolveSdkAppId(cfg.id, appId, detectedInsideWallet);
      const scopes = [...cfg.requiredScopes];
      setSdkDiagnostics({
        appId: sdkAppId,
        requestedAppId: appId ?? '',
        awAppIdPresent: Boolean(cfg.diagnostics?.awAppIdPresent),
        appIdSource: cfg.diagnostics?.appIdSource ?? (cfg.id ? 'fallback' : 'missing'),
        origin: window.location.origin,
        parentOrigin,
        scopes,
      });
      addLog(`Инициализация SDK appId: ${sdkAppId}`);
      addLog(`AW_APP_ID найден: ${Boolean(cfg.diagnostics?.awAppIdPresent) ? 'да' : 'нет'}`);
      addLog(`Источник appId: ${formatAppIdSource(cfg.diagnostics?.appIdSource ?? (cfg.id ? 'fallback' : 'missing'))}`);
      addLog(`origin: ${window.location.origin}`);
      addLog(`parentOrigin: ${parentOrigin}`);
      addLog(`scopes: ${scopes.join(', ')}`);

      const sdk = new AWSDK({
        appId: sdkAppId,
        scopes,
        parentOrigin,
        debug: true,
        timeout: 30_000,
        persistSession: false,
        retry: { maxAttempts: 3, baseDelay: 1000 },
      });
      sdkRef.current = sdk;

      sdk.events.on('sdk.ready', (s: AWSession) => {
        addLog('SDK готов к работе.', 'success');
        setStatus('ready');
        setSession(s);
        setUser(s.userContext ?? null);
        setSdkError(null);
      });

      sdk.events.on('sdk.error', ({ code, message }) => {
        addLog(`Ошибка SDK: [${code}] ${message}`, 'error');
        setSdkError(`[${code}] ${message}`);
        setStatus('error');
      });

      sdk.events.on('scopes.granted', ({ scopes }) =>
        addLog(`Доступы подтверждены: ${scopes.join(', ')}`, 'success'),
      );

      sdk.events.on('session.refreshed', ({ sessionToken, expiresAt }) => {
        addLog(`Сессия обновлена, действует до ${new Date(expiresAt).toLocaleTimeString()}`);
        setSession((prev) => (prev ? { ...prev, sessionToken, expiresAt } : prev));
      });

      sdk.events.on('session.expired', () => {
        addLog('Сессия истекла.', 'warn');
        setSdkError('Сессия кошелька истекла. Откройте приложение заново из Antarctic Wallet.');
        setStatus('error');
        setSession(null);
        setUser(null);
      });

      sdk.events.on('operation.rejected', ({ operationId, reason }) =>
        addLog(`Операция ${operationId} отклонена: ${reason}`, 'warn'),
      );

      const clearedStorageKeys = clearWalletSdkStorageCache(detectedInsideWallet);
      if (clearedStorageKeys.length > 0) {
        addLog(`Кэш SDK очищен: ${clearedStorageKeys.join(', ')}`);
      } else {
        addLog('Кэш SDK для очистки не найден.');
      }

      addLog('Инициализация SDK...');
      setStatus('connecting');
      try {
        await sdk.init();
      } catch (error) {
        if (destroyed) return;
        const message = handleSdkError(error);
        addLog(`Инициализация не выполнена: ${message}`, 'error');
        setSdkError(message);
        setStatus('error');
      }
    })();

    return () => {
      destroyed = true;
      sdkRef.current?.destroy();
      sdkRef.current = null;
    };
  }, [addLog, appId]);

  useEffect(() => {
    if (!appId && !insideWallet) return;
    let cancelled = false;

    async function loadVioletCatalog() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const response = await fetch(VIOLET_CATALOG_ENDPOINT, {
          headers: { Accept: 'application/json' },
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
        const parsed = JSON.parse(text) as { items?: VioletCatalogItem[] };
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        const nextCatalog = Object.fromEntries(items.map((item) => [item.productId, item]));
        if (cancelled) return;
        setVioletCatalog(nextCatalog);
      } catch (error) {
        if (cancelled) return;
        setVioletCatalog({});
        setCatalogError('не удалось получить актуальный каталог.');
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }

    void loadVioletCatalog();

    return () => {
      cancelled = true;
    };
  }, [appId, insideWallet]);

  function submitAppId(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = appIdInput.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(APP_ID_STORAGE_KEY, trimmed);
    } catch {
      //
    }
    setAppId(trimmed);
  }

  function changeAppId() {
    try {
      localStorage.removeItem(APP_ID_STORAGE_KEY);
    } catch {
      //
    }
    sdkRef.current?.destroy();
    sdkRef.current = null;
    setAppId(null);
    setAppIdInput('');
    setConfig(null);
    setSession(null);
    setUser(null);
    setSdkError(null);
    setSdkDiagnostics({
      appId: '',
      requestedAppId: '',
      awAppIdPresent: false,
      appIdSource: 'missing',
      origin: '',
      parentOrigin: '',
      scopes: [],
    });
    setStatus('idle');
    setLogs([]);
  }

  const visibleProducts = useMemo(
    () => PRODUCTS.filter((product) => product.category === selectedCategory),
    [selectedCategory],
  );

  const selectedProduct = useMemo(
    () => PRODUCTS.find((product) => product.id === selectedProductId) ?? visibleProducts[0] ?? PRODUCTS[0],
    [selectedProductId, visibleProducts],
  );
  const selectedProductMeta = violetCatalog[selectedProduct.id] ?? null;
  const selectedProductOffers = useMemo(
    () => resolveProductOffers(selectedProduct, selectedProductMeta),
    [selectedProduct, selectedProductMeta],
  );
  const visibleSelectedOffers = useMemo(
    () =>
      showAllDenominations || !isAppStoreProduct(selectedProduct)
        ? selectedProductOffers
        : getPopularOffers(selectedProduct, selectedProductOffers),
    [selectedProduct, selectedProductOffers, showAllDenominations],
  );

  const clientPrice =
    selectedOffer === null
      ? null
      : selectedOffer.priceUsdt ?? null;
  const clientPriceRub =
    selectedOffer?.priceRubApprox ?? (clientPrice === null ? null : Math.round(clientPrice * ANTARCTIC_USDT_RATE_RUB));
  const selectedOrderFlow = resolveOrderFlow(selectedProduct, selectedProductMeta);
  const requiredOrderFields = getRequiredOrderFields(selectedOrderFlow, selectedProductMeta);
  const canContinue =
    selectedProduct !== null &&
    clientPrice !== null &&
    requiredOrderFields.every((field) => isOrderFieldFilled(field, orderFields));
  const walletSessionSummary = useMemo(() => {
    if (sdkError) return sdkError;
    if (!session) return 'Ожидаем подключение кошелька';
    const parts = [
      user?.displayName,
      user?.walletAddress ? maskIdentifier(user.walletAddress) : null,
      user?.userId ? `Пользователь ${maskIdentifier(user.userId)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : 'Сессия кошелька активна';
  }, [sdkError, session, user]);

  function selectCategory(categoryId: CategoryId) {
    const firstProduct = PRODUCTS.find((product) => product.category === categoryId);
    if (!firstProduct) return;
    const meta = violetCatalog[firstProduct.id] ?? null;
    const offers = resolveProductOffers(firstProduct, meta);
    setSelectedCategory(categoryId);
    setSelectedProductId(firstProduct.id);
    setSelectedOffer(getDefaultOffer(firstProduct, offers));
    setShowAllDenominations(false);
    setOrderFields(EMPTY_ORDER_FIELDS);
    setOrderStatus('idle');
  }

  function selectProduct(product: Product) {
    const meta = violetCatalog[product.id] ?? null;
    const offers = resolveProductOffers(product, meta);
    setSelectedProductId(product.id);
    setSelectedOffer(getDefaultOffer(product, offers));
    setShowAllDenominations(false);
    setOrderFields(EMPTY_ORDER_FIELDS);
    setOrderStatus('idle');
  }

  function updateOrderField(field: OrderFieldKey, value: string) {
    setOrderFields((prev) => ({ ...prev, [field]: value }));
    setOrderStatus('idle');
  }

  function previewOrder() {
    if (!canContinue) return;
    setOrderStatus('preview');
  }

  useEffect(() => {
    if (visibleProducts.length === 0) return;
    if (visibleProducts.some((product) => product.id === selectedProductId)) return;
    const firstProduct = visibleProducts[0];
    const meta = violetCatalog[firstProduct.id] ?? null;
    const offers = resolveProductOffers(firstProduct, meta);
    setSelectedProductId(visibleProducts[0].id);
    setSelectedOffer(getDefaultOffer(firstProduct, offers));
    setShowAllDenominations(false);
    setOrderFields(EMPTY_ORDER_FIELDS);
    setOrderStatus('idle');
  }, [selectedProductId, violetCatalog, visibleProducts]);

  useEffect(() => {
    if (selectedProductOffers.some((offer) => isSameOffer(selectedOffer, offer))) return;
    setSelectedOffer(getDefaultOffer(selectedProduct, selectedProductOffers));
    setOrderStatus('idle');
  }, [selectedOffer, selectedProduct, selectedProductOffers]);

  if (!appId && !insideWallet) {
    return (
      <div className="app app--narrow">
        <header className="header">
          <h1 className="header__title">{APP_DISPLAY_NAME}</h1>
          <div className="header__badges">
            <span className={insideWallet ? 'badge -inside' : 'badge -outside'}>
              {insideWallet ? 'В кошельке' : 'Отдельный запуск'}
            </span>
          </div>
        </header>
        <section className="panel">
          <div className="panel__title">Введите ID приложения</div>
          <form onSubmit={submitAppId}>
            <input
              className="input"
              type="text"
              autoFocus
              placeholder="ID приложения"
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value)}
            />
            <button className="btn -accent" type="submit" disabled={!appIdInput.trim()}>
              Продолжить
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="violet-header">
        <div>
          <div className="eyebrow">Сервисы Antarctic</div>
          <h1 className="violet-title">{APP_DISPLAY_NAME}</h1>
          <p className="violet-copy">
            Витрина цифровых товаров для Telegram, Steam, подарочных карт
            и игровых пополнений внутри Antarctic Wallet.
          </p>
        </div>
        <div className="wallet-card">
          <div className="wallet-card__row">
            <span className={insideWallet ? 'badge -inside' : 'badge -outside'}>
              {insideWallet ? 'В кошельке' : 'Отдельный запуск'}
            </span>
            <span className={`status-dot -${status}`} />
            <span className="status-label">{formatStatus(status)}</span>
          </div>
          <div className="wallet-card__meta">
            {walletSessionSummary}
          </div>
          <div className="wallet-card__diagnostics">
            <span>ID приложения: {sdkDiagnostics.appId || 'ожидается'}</span>
            <span>AW_APP_ID: {sdkDiagnostics.awAppIdPresent ? 'найден' : 'не найден'}</span>
            <span>Источник: {formatAppIdSource(sdkDiagnostics.appIdSource)}</span>
            {sdkDiagnostics.requestedAppId && sdkDiagnostics.requestedAppId !== sdkDiagnostics.appId && (
              <span>ID приложения из URL проигнорирован: {sdkDiagnostics.requestedAppId}</span>
            )}
            <span>Адрес приложения: {sdkDiagnostics.origin || window.location.origin}</span>
            <span>Адрес кошелька: {sdkDiagnostics.parentOrigin || 'ожидается'}</span>
            <span>Доступы: {sdkDiagnostics.scopes.join(', ') || 'ожидаются'}</span>
          </div>
          <button className="btn-link" onClick={changeAppId} type="button">
            Изменить ID приложения
          </button>
        </div>
      </header>

      <nav className="category-tabs" aria-label="Категории товаров">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`category-tab ${selectedCategory === category.id ? '-active' : ''}`}
            type="button"
            onClick={() => selectCategory(category.id)}
          >
            <span>{category.name}</span>
            <small>{category.subtitle}</small>
          </button>
        ))}
      </nav>

      <main className="storefront">
        <section className="catalog">
          <div className="section-heading">
            <span>Каталог</span>
            <strong>
              {Object.keys(violetCatalog).length > 0
                ? `${visibleProducts.length} товаров`
                : `${visibleProducts.length} товаров в резервном каталоге`}
            </strong>
          </div>
          {(catalogLoading || catalogError) && (
            <div className={`catalog-state ${catalogError ? '-error' : ''}`}>
              {catalogLoading
                ? 'Синхронизируем актуальные данные FazerCards...'
                : `FazerCards временно недоступен. Показываем резервный каталог. ${catalogError}`}
            </div>
          )}
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const meta = violetCatalog[product.id] ?? null;
              const offers = resolveProductOffers(product, meta);
              const firstOffer = offers[0] ?? null;
              return (
                <button
                  key={product.id}
                  className={`product-card -${product.accent} ${
                    selectedProduct.id === product.id ? '-selected' : ''
                  }`}
                  type="button"
                  onClick={() => selectProduct(product)}
                >
                  <span className="product-card__shine" />
                  <span className="product-card__name">{product.name}</span>
                  <span className="product-card__description">{product.description}</span>
                  <span className="product-card__footer">
                    <span>
                      {firstOffer ? `от ${formatOfferNominal(firstOffer, product)}` : 'номиналы недоступны'}
                    </span>
                    <span>{getProductCatalogState(product, meta)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="checkout-panel">
          <div className="section-heading">
            <span>Заказ</span>
            <strong>Предпросмотр</strong>
          </div>

          <div className={`selected-product -${selectedProduct.accent}`}>
            <div>
              <span className="selected-product__label">Выбранный товар</span>
              <strong>{selectedProduct.name}</strong>
            </div>
            <span className="selected-product__pill">
              {getProductBadge(selectedProduct, selectedProductMeta)}
            </span>
          </div>

          <label className="field-label">Выберите номинал</label>
          <div className="denomination-grid">
            {visibleSelectedOffers.length > 0 ? (
              visibleSelectedOffers.map((offer) => (
                <button
                  key={getOfferKey(offer)}
                  className={`denomination ${isSameOffer(selectedOffer, offer) ? '-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setSelectedOffer(offer);
                    setOrderStatus('idle');
                  }}
                >
                  {formatOfferNominal(offer, selectedProduct)}
                </button>
              ))
            ) : (
              <div className="denomination-empty">
                Номиналы временно недоступны. Попробуйте позже.
              </div>
            )}
          </div>
          {isAppStoreProduct(selectedProduct) && selectedProductOffers.length > visibleSelectedOffers.length && (
            <button
              className="btn-link denomination-toggle"
              type="button"
              onClick={() => setShowAllDenominations(true)}
            >
              Показать все номиналы
            </button>
          )}
          {isAppStoreProduct(selectedProduct) && showAllDenominations && selectedProductOffers.length > 6 && (
            <button
              className="btn-link denomination-toggle"
              type="button"
              onClick={() => setShowAllDenominations(false)}
            >
              Скрыть номиналы
            </button>
          )}

          <div className="delivery-box">
            <span className="delivery-box__title">{getOrderFlowTitle(selectedOrderFlow)}</span>
            <p>{getOrderFlowHint(selectedOrderFlow)}</p>
          </div>

          {selectedOrderFlow === 'steam_balance' && (
            <>
              <label className="field-label" htmlFor="steam-login">
                Steam логин
              </label>
              <input
                id="steam-login"
                className="input"
                type="text"
                placeholder="Введите логин Steam"
                value={orderFields.steamLogin}
                onChange={(e) => updateOrderField('steamLogin', e.target.value)}
              />
            </>
          )}

          {(selectedOrderFlow === 'telegram_stars' || selectedOrderFlow === 'telegram_premium') && (
            <>
              <label className="field-label" htmlFor="telegram-username">
                Username Telegram
              </label>
              <input
                id="telegram-username"
                className="input"
                type="text"
                placeholder="@username"
                value={orderFields.telegramUsername}
                onChange={(e) => updateOrderField('telegramUsername', e.target.value)}
              />
            </>
          )}

          {selectedOrderFlow === 'game_balance' && (
            <>
              <label className="field-label" htmlFor="player-id">
                ID игрока / UID
              </label>
              <input
                id="player-id"
                className="input"
                type="text"
                placeholder="Введите ID игрока"
                value={orderFields.playerId}
                onChange={(e) => updateOrderField('playerId', e.target.value)}
              />
              {requiredOrderFields.includes('serverRegion') && (
                <>
                  <label className="field-label" htmlFor="server-region">
                    Сервер / регион
                  </label>
                  <input
                    id="server-region"
                    className="input"
                    type="text"
                    placeholder="Введите сервер или регион"
                    value={orderFields.serverRegion}
                    onChange={(e) => updateOrderField('serverRegion', e.target.value)}
                  />
                </>
              )}
            </>
          )}

          <div className="total-box">
            <span className="total-box__label">Итого к оплате</span>
            <span className="total-box__nominal">
              Номинал: {selectedOffer ? formatOfferNominal(selectedOffer, selectedProduct) : 'не выбран'}
            </span>
            <strong className="total-box__amount">
              {clientPrice === null ? 'нет номинала' : `К оплате: ${formatUsdt(clientPrice)}`}
            </strong>
            <span className="total-box__rub">
              {clientPriceRub === null ? 'Ожидаем реальные данные FazerCards' : `≈ ${formatRub(clientPriceRub)}`}
            </span>
            <span className="total-box__delivery">
              Получение: {getDeliverySummary(selectedOrderFlow)}
            </span>
          </div>

          <button className="btn -accent" type="button" disabled={!canContinue} onClick={previewOrder}>
            Продолжить
          </button>

          {orderStatus === 'preview' && (
            <div className="success-note">
              <strong>Предпросмотр заказа готов</strong>
              <span>Товар: {selectedProduct.name}</span>
              <span>Вариант: {selectedOffer ? formatOfferNominal(selectedOffer, selectedProduct) : 'не выбран'}</span>
              <span>К оплате: {clientPrice === null ? 'нет номинала' : formatUsdt(clientPrice)}</span>
              <span>Получение: {getDeliverySummary(selectedOrderFlow)}</span>
              {selectedOrderFlow === 'steam_balance' && (
                <span>Steam логин: {orderFields.steamLogin.trim()}</span>
              )}
              {(selectedOrderFlow === 'telegram_stars' || selectedOrderFlow === 'telegram_premium') && (
                <span>Telegram: {normalizeTelegramUsername(orderFields.telegramUsername)}</span>
              )}
              {selectedOrderFlow === 'game_balance' && (
                <span>ID игрока: {orderFields.playerId.trim()}</span>
              )}
              {selectedOrderFlow === 'game_balance' && orderFields.serverRegion.trim() && (
                <span>Сервер / регион: {orderFields.serverRegion.trim()}</span>
              )}
              <small>Оплата будет выполнена на следующем шаге.</small>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
