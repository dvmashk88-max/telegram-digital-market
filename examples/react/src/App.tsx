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
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

type AppStatus = 'idle' | 'connecting' | 'ready' | 'error';
type CategoryId = 'telegram' | 'steam' | 'gift-cards' | 'game-top-up';
type OrderStatus = 'idle' | 'preview';

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
  inputLabel: string;
  inputPlaceholder: string;
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
  available: boolean;
}

const APP_ID_STORAGE_KEY = 'aw-demo:appId';
const VIOLET_CATALOG_ENDPOINT =
  'https://example-app-production-e00d.up.railway.app/api/fazercards/violet-catalog';

const CATEGORIES: Category[] = [
  { id: 'gift-cards', name: 'Apple', subtitle: 'Regional gift cards' },
  { id: 'steam', name: 'Steam', subtitle: 'Wallet top-ups' },
  { id: 'game-top-up', name: 'Games', subtitle: 'Player balance' },
  { id: 'telegram', name: 'Telegram', subtitle: 'Stars and Premium' },
];

const USDT_RATE_RUB = 90;

const PRODUCTS: Product[] = [
  {
    id: 'apple-tr',
    category: 'gift-cards',
    name: 'Apple TR',
    description: 'Apple gift card mock code for the TR storefront.',
    denominations: [5, 10, 25, 50],
    inputLabel: 'Delivery note',
    inputPlaceholder: 'email or note',
    accent: 'violet',
  },
  {
    id: 'apple-us',
    category: 'gift-cards',
    name: 'Apple US',
    description: 'Apple gift card mock code for the US storefront.',
    denominations: [10, 25, 50, 100],
    inputLabel: 'Delivery note',
    inputPlaceholder: 'email or note',
    accent: 'blue',
  },
  {
    id: 'apple-ru',
    category: 'gift-cards',
    name: 'Apple RU',
    description: 'Apple gift card mock code for the RU storefront.',
    denominations: [5, 10, 25, 50],
    inputLabel: 'Delivery note',
    inputPlaceholder: 'email or note',
    accent: 'silver',
  },
  {
    id: 'apple-idr',
    category: 'gift-cards',
    name: 'Apple IDR',
    description: 'Apple gift card mock code for the Indonesian storefront.',
    denominations: [5, 10, 20],
    inputLabel: 'Delivery note',
    inputPlaceholder: 'email or note',
    accent: 'cyan',
  },
  {
    id: 'roblox-gift-card',
    category: 'gift-cards',
    name: 'Roblox Gift Card',
    description: 'Roblox balance code preview for gifts and purchases.',
    denominations: [10, 25, 50],
    inputLabel: 'Delivery note',
    inputPlaceholder: 'email or note',
    accent: 'pink',
  },
  {
    id: 'playstation-gift-card',
    category: 'gift-cards',
    name: 'PlayStation Gift Card',
    description: 'PlayStation Store code preview.',
    denominations: [10, 25, 50],
    inputLabel: 'Delivery note',
    inputPlaceholder: 'email or note',
    accent: 'blue',
  },
  {
    id: 'xbox-gift-card',
    category: 'gift-cards',
    name: 'Xbox Gift Card',
    description: 'Xbox wallet card preview.',
    denominations: [10, 25, 50],
    inputLabel: 'Delivery note',
    inputPlaceholder: 'email or note',
    accent: 'green',
  },
  {
    id: 'steam-top-up',
    category: 'steam',
    name: 'Steam Top-Up',
    description: 'Wallet balance refill preview for Steam accounts.',
    denominations: [5, 10, 20, 50, 100],
    inputLabel: 'Steam login',
    inputPlaceholder: 'steam_login',
    accent: 'cyan',
  },
  {
    id: 'pubg',
    category: 'game-top-up',
    name: 'PUBG',
    description: 'Mock UC top-up flow for PUBG players.',
    denominations: [5, 10, 25, 50],
    inputLabel: 'Player ID',
    inputPlaceholder: 'player ID',
    accent: 'gold',
  },
  {
    id: 'free-fire',
    category: 'game-top-up',
    name: 'Free Fire',
    description: 'Mock diamond top-up flow for Free Fire accounts.',
    denominations: [2, 5, 10, 25],
    inputLabel: 'Player ID',
    inputPlaceholder: 'player ID',
    accent: 'pink',
  },
  {
    id: 'roblox-top-up',
    category: 'game-top-up',
    name: 'Roblox Top-Up',
    description: 'Roblox account balance preview.',
    denominations: [5, 10, 20, 50],
    inputLabel: 'Roblox username',
    inputPlaceholder: 'roblox_username',
    accent: 'violet',
  },
  {
    id: 'minecraft',
    category: 'game-top-up',
    name: 'Minecraft',
    description: 'Minecraft account credit preview.',
    denominations: [10, 25, 50],
    inputLabel: 'Minecraft username',
    inputPlaceholder: 'minecraft_username',
    accent: 'green',
  },
  {
    id: 'telegram-stars',
    category: 'telegram',
    name: 'Telegram Stars',
    description: 'Mock Stars package for creators, gifts, and in-app purchases.',
    denominations: [2, 5, 10, 25, 50],
    inputLabel: 'Telegram recipient',
    inputPlaceholder: '@username',
    accent: 'violet',
  },
  {
    id: 'telegram-premium',
    category: 'telegram',
    name: 'Telegram Premium',
    description: 'Premium subscription preview for Telegram accounts.',
    denominations: [5, 15, 30],
    inputLabel: 'Telegram recipient',
    inputPlaceholder: '@username',
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

function getParentOrigin(): string {
  const params = new URLSearchParams(window.location.search);
  const fromParam = params.get('parentOrigin');
  if (fromParam) return fromParam;
  if (window.parent !== window && document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      //
    }
  }
  return 'https://localhost:3310';
}

function handleSdkError(error: unknown): string {
  if (error instanceof AWOperationError) {
    return `Operation error [${error.errorCode}]: ${error.message} (opId: ${error.operationId})`;
  }
  if (error instanceof AWInitError) return `Init error [${error.errorCode}]: ${error.message}`;
  if (error instanceof AWSessionError) return `Session error [${error.errorCode}]: ${error.message}`;
  if (error instanceof AWScopeError) return `Scope error [${error.errorCode}]: ${error.message}`;
  if (error instanceof AWTimeoutError) return `Timeout: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function getCategoryMarkupRate(categoryId: CategoryId): number {
  if (categoryId === 'telegram') return 0.15;
  if (categoryId === 'steam') return 0.2;
  if (categoryId === 'gift-cards') return 0.3;
  return 0.25;
}

function formatUsdt(amount: number): string {
  return `${amount.toFixed(2)} USDT`;
}

function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

function calculateClientPrice(amount: number, categoryId: CategoryId): number {
  return Number((amount * (1 + getCategoryMarkupRate(categoryId))).toFixed(2));
}

// ── Component ───────────────────────────────────────────────────────────────

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [session, setSession] = useState<AWSession | null>(null);
  const [user, setUser] = useState<AWUserContext | null>(null);
  const [insideWallet, setInsideWallet] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [appId, setAppId] = useState<string | null>(() => resolveStoredAppId());
  const [appIdInput, setAppIdInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('gift-cards');
  const [selectedProductId, setSelectedProductId] = useState('apple-tr');
  const [selectedDenomination, setSelectedDenomination] = useState(5);
  const [recipient, setRecipient] = useState('');
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
    setInsideWallet(AWSDK.isInsideWallet());
    addLog(`isInsideWallet: ${AWSDK.isInsideWallet()}`);

    if (!appId) {
      addLog('Waiting for appId...', 'warn');
      return;
    }

    (async () => {
      const cfg: AppConfig = await fetch('./config.json').then((r) => r.json());
      if (destroyed) return;
      setConfig(cfg);

      const sdk = new AWSDK({
        appId,
        scopes: [...cfg.requiredScopes],
        parentOrigin: getParentOrigin(),
        debug: true,
        timeout: 30_000,
        persistSession: true,
        retry: { maxAttempts: 3, baseDelay: 1000 },
      });
      sdkRef.current = sdk;

      sdk.events.on('sdk.ready', (s: AWSession) => {
        addLog('SDK ready!', 'success');
        setStatus('ready');
        setSession(s);
        setUser(s.userContext ?? null);
      });

      sdk.events.on('sdk.error', ({ code, message }) => {
        addLog(`SDK error: [${code}] ${message}`, 'error');
        setStatus('error');
      });

      sdk.events.on('scopes.granted', ({ scopes }) =>
        addLog(`Scopes granted: ${scopes.join(', ')}`, 'success'),
      );

      sdk.events.on('session.refreshed', ({ sessionToken, expiresAt }) => {
        addLog(`Session refreshed, expires: ${new Date(expiresAt).toLocaleTimeString()}`);
        setSession((prev) => (prev ? { ...prev, sessionToken, expiresAt } : prev));
      });

      sdk.events.on('session.expired', () => {
        addLog('Session expired!', 'warn');
        setStatus('error');
        setSession(null);
        setUser(null);
      });

      sdk.events.on('operation.rejected', ({ operationId, reason }) =>
        addLog(`Operation ${operationId} rejected: ${reason}`, 'warn'),
      );

      addLog('Initializing SDK...');
      setStatus('connecting');
      try {
        await sdk.init();
      } catch (error) {
        if (destroyed) return;
        addLog(`Init failed: ${handleSdkError(error)}`, 'error');
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
    if (!appId) return;
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
        setCatalogError(error instanceof Error ? error.message : 'Unable to load FazerCards data.');
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }

    void loadVioletCatalog();

    return () => {
      cancelled = true;
    };
  }, [appId]);

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
  const selectedProductDenominations =
    selectedProductMeta?.denominations.length ? selectedProductMeta.denominations : selectedProduct.denominations;

  const supplierPrice = selectedDenomination;
  const clientPrice = calculateClientPrice(supplierPrice, selectedCategory);
  const clientPriceRub = clientPrice * USDT_RATE_RUB;
  const canContinue = recipient.trim().length > 0 && selectedProduct !== null;

  function selectCategory(categoryId: CategoryId) {
    const firstProduct = PRODUCTS.find((product) => product.category === categoryId);
    if (!firstProduct) return;
    setSelectedCategory(categoryId);
    setSelectedProductId(firstProduct.id);
    setSelectedDenomination(firstProduct.denominations[0]);
    setRecipient('');
    setOrderStatus('idle');
  }

  function selectProduct(product: Product) {
    const meta = violetCatalog[product.id] ?? null;
    const denominations = meta?.denominations.length ? meta.denominations : product.denominations;
    setSelectedProductId(product.id);
    setSelectedDenomination(denominations[0]);
    setRecipient('');
    setOrderStatus('idle');
  }

  function previewOrder() {
    if (!canContinue) return;
    setOrderStatus('preview');
  }

  useEffect(() => {
    if (visibleProducts.length === 0) return;
    if (visibleProducts.some((product) => product.id === selectedProductId)) return;
    setSelectedProductId(visibleProducts[0].id);
    setSelectedDenomination(
      violetCatalog[visibleProducts[0].id]?.denominations[0] ?? visibleProducts[0].denominations[0],
    );
    setRecipient('');
    setOrderStatus('idle');
  }, [selectedProductId, violetCatalog, visibleProducts]);

  useEffect(() => {
    if (selectedProductDenominations.includes(selectedDenomination)) return;
    setSelectedDenomination(selectedProductDenominations[0]);
    setOrderStatus('idle');
  }, [selectedDenomination, selectedProductDenominations]);

  if (!appId) {
    return (
      <div className="app app--narrow">
        <header className="header">
          <h1 className="header__title">Example DApp (React)</h1>
          <div className="header__badges">
            <span className={insideWallet ? 'badge -inside' : 'badge -outside'}>
              {insideWallet ? 'In Wallet' : 'Standalone'}
            </span>
          </div>
        </header>
        <section className="panel">
          <div className="panel__title">Enter App ID</div>
          <form onSubmit={submitAppId}>
            <input
              className="input"
              type="text"
              autoFocus
              placeholder="e.g. dev"
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value)}
            />
            <button className="btn -accent" type="submit" disabled={!appIdInput.trim()}>
              Continue
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
          <div className="eyebrow">Antarctic Apps</div>
          <h1 className="violet-title">{config?.name ?? 'Antarctic Violet'}</h1>
          <p className="violet-copy">
            Premium digital goods storefront prototype for Telegram, Steam, gift cards,
            and game top-ups.
          </p>
        </div>
        <div className="wallet-card">
          <div className="wallet-card__row">
            <span className={insideWallet ? 'badge -inside' : 'badge -outside'}>
              {insideWallet ? 'In Wallet' : 'Standalone'}
            </span>
            <span className={`status-dot -${status}`} />
            <span className="status-label">{status}</span>
          </div>
          <div className="wallet-card__meta">
            {user?.displayName ?? (session ? 'Wallet session active' : 'Awaiting wallet session')}
          </div>
          <button className="btn-link" onClick={changeAppId} type="button">
            Change App ID
          </button>
        </div>
      </header>

      <nav className="category-tabs" aria-label="Product categories">
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
            <span>Catalog</span>
            <strong>
              {Object.keys(violetCatalog).length > 0
                ? `${visibleProducts.length} products`
                : `${visibleProducts.length} mock products`}
            </strong>
          </div>
          {(catalogLoading || catalogError) && (
            <div className={`catalog-state ${catalogError ? '-error' : ''}`}>
              {catalogLoading
                ? 'Syncing FazerCards data for current cards...'
                : `FazerCards unavailable. Current cards stay in mock fallback. ${catalogError}`}
            </div>
          )}
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const meta = violetCatalog[product.id] ?? null;
              const denominations = meta?.denominations.length ? meta.denominations : product.denominations;
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
                  <span className="product-card__name">{meta?.name ?? product.name}</span>
                  <span className="product-card__description">{meta?.note ?? product.description}</span>
                  <span className="product-card__footer">
                    <span>от {formatUsdt(denominations[0])}</span>
                    <span>{meta ? 'Live' : 'Mock'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="checkout-panel">
          <div className="section-heading">
            <span>Order</span>
            <strong>Preview only</strong>
          </div>

          <div className={`selected-product -${selectedProduct.accent}`}>
            <div>
              <span className="selected-product__label">Selected product</span>
              <strong>{selectedProductMeta?.name ?? selectedProduct.name}</strong>
            </div>
            <span className="selected-product__pill">
              {selectedProductMeta?.externalId ?? selectedCategory.replace('-', ' ')}
            </span>
          </div>

          <label className="field-label">Nominal</label>
          <div className="denomination-grid">
            {selectedProductDenominations.map((amount) => (
              <button
                key={amount}
                className={`denomination ${selectedDenomination === amount ? '-active' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedDenomination(amount);
                  setOrderStatus('idle');
                }}
              >
                {formatUsdt(amount)}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="recipient">
            {selectedProduct.inputLabel}
          </label>
          <input
            id="recipient"
            className="input"
            type="text"
            placeholder={selectedProduct.inputPlaceholder}
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              setOrderStatus('idle');
            }}
          />

          <div className="total-box">
            <span className="total-box__label">Итого к оплате</span>
            <strong className="total-box__amount">{formatUsdt(clientPrice)}</strong>
            <span className="total-box__rub">≈ {formatRub(clientPriceRub)}</span>
            <span className="total-box__note">Сервисный сбор включён</span>
          </div>

          <button className="btn -accent" type="button" disabled={!canContinue} onClick={previewOrder}>
            Continue
          </button>

          {orderStatus === 'preview' && (
            <div className="success-note">Order preview ready. Payment integration is next.</div>
          )}
        </aside>
      </main>
    </div>
  );
}
