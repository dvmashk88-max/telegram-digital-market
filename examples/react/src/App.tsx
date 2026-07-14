import { useEffect, useMemo, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

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
  priceRub?: number;
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
  priceRub?: number;
}

interface RegisteredOrder {
  id: string;
  orderNumber: string;
  alfaOrderId: string;
  categoryId: string;
  cardId: string;
  quantity: number;
  amount: number;
  currency: string;
  paymentStatus: string;
  supplierStatus: string;
}

const VIOLET_CATALOG_ENDPOINT =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3351/api/fazercards/violet-catalog'
    : `${window.location.origin}/api/fazercards/violet-catalog`;
const ORDER_REGISTER_ENDPOINT =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3351/api/orders/register'
    : `${window.location.origin}/api/orders/register`;
const APP_DISPLAY_NAME = 'Маркет цифровых товаров';

const CATEGORIES: Category[] = [
  { id: 'gift-cards', name: 'Apple', subtitle: 'Подарочные карты' },
  { id: 'steam', name: 'Steam', subtitle: 'Пополнение кошелька' },
  { id: 'game-top-up', name: 'Игры', subtitle: 'Баланс игрока' },
  { id: 'telegram', name: 'Telegram', subtitle: 'Stars и Premium' },
];

const APP_STORE_POPULAR_NOMINALS: Record<string, number[]> = {
  'apple-tr': [10, 50, 100, 250, 500, 1000],
  'apple-us': [5, 10, 25, 50, 100, 200],
  'apple-ru': [500, 1000, 2000, 3000],
  'apple-in': [100, 200, 500, 1000, 2000, 5000],
};
const APP_STORE_VISIBLE_NOMINALS: Record<string, number[]> = {
  'apple-ru': [500, 1000, 2000, 3000],
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

function formatCategoryLabel(categoryId: CategoryId): string {
  const labels: Record<CategoryId, string> = {
    telegram: 'Telegram',
    steam: 'Steam',
    'gift-cards': 'Подарочные карты',
    'game-top-up': 'Игровые пополнения',
  };
  return labels[categoryId];
}

function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

function formatNominalAmount(amount: number, currency?: VioletCatalogOffer['currency']): string {
  if (currency === 'RUB') return formatRub(amount);
  return amount.toLocaleString('ru-RU');
}

function formatOfferNominal(offer: VioletCatalogOffer, product: Product): string {
  if (!offer.currency && !product.nominalCurrency && offer.name) return offer.name;
  return formatNominalAmount(offer.nominal, offer.currency ?? product.nominalCurrency);
}

function formatOfferPrice(offer: VioletCatalogOffer): string {
  return offer.priceRub === undefined ? 'нет цены' : formatRub(offer.priceRub);
}

function isAppStoreProduct(product: Product): boolean {
  return Boolean(product.nominalCurrency);
}

function resolveProductOffers(product: Product, meta: VioletCatalogItem | null): VioletCatalogOffer[] {
  if (meta?.offers?.length) return meta.offers;
  if (meta) {
    if (meta.denominations.length && meta.priceRub && meta.rawPriceUsd) {
      return meta.denominations.map((nominal) => ({
        cardId: meta.cardId,
        nominal,
        name: null,
        rawPriceUsd: meta.rawPriceUsd,
        priceRub: meta.priceRub,
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

function getDisplayableProductOffers(product: Product, offers: VioletCatalogOffer[]): VioletCatalogOffer[] {
  const visibleNominals = APP_STORE_VISIBLE_NOMINALS[product.id];
  if (!visibleNominals) return offers;
  const visibleNominalSet = new Set(visibleNominals);
  return offers.filter((offer) => visibleNominalSet.has(offer.nominal));
}

function getProductCatalogState(product: Product, meta: VioletCatalogItem | null): string {
  if (isAppStoreProduct(product) || meta?.offers) {
    if (!meta) return 'Нет данных FazerCards';
    const visibleOffers = getDisplayableProductOffers(product, meta.offers ?? []);
    return visibleOffers.length ? `${visibleOffers.length} вариантов` : 'Нет номиналов';
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

function getOrderRegisterErrorMessage(error: string | undefined): string {
  const messages: Record<string, string> = {
    INVALID_CATEGORY_ID: 'Неверно выбран товар',
    INVALID_CARD_ID: 'Неверно выбран товар',
    OFFER_NOT_FOUND: 'Товар больше недоступен',
    INSUFFICIENT_STOCK: 'Товар закончился',
    INVALID_SUPPLIER_PRICE: 'Не удалось рассчитать цену',
    ORDER_CONFIG_MISSING: 'Оплата временно недоступна',
    ORDER_STORAGE_FAILED: 'Не удалось создать заказ',
    ALFA_REGISTER_FAILED: 'Банк отклонил создание платежа',
    ALFA_REQUEST_FAILED: 'Не удалось связаться с банком',
  };
  return error ? messages[error] ?? 'Не удалось создать платёж' : 'Не удалось создать платёж';
}

// ── Component ───────────────────────────────────────────────────────────────

export function App() {
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('gift-cards');
  const [selectedProductId, setSelectedProductId] = useState('apple-tr');
  const [selectedOffer, setSelectedOffer] = useState<VioletCatalogOffer | null>(null);
  const [showAllDenominations, setShowAllDenominations] = useState(false);
  const [orderFields, setOrderFields] = useState<OrderFields>(EMPTY_ORDER_FIELDS);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('idle');
  const [violetCatalog, setVioletCatalog] = useState<Record<string, VioletCatalogItem>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [orderRegistering, setOrderRegistering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [registeredOrder, setRegisteredOrder] = useState<RegisteredOrder | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showPaymentFallback, setShowPaymentFallback] = useState(false);

  useEffect(() => {
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
  }, []);

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
  const displayableSelectedProductOffers = useMemo(
    () => getDisplayableProductOffers(selectedProduct, selectedProductOffers),
    [selectedProduct, selectedProductOffers],
  );
  const visibleSelectedOffers = useMemo(
    () =>
      showAllDenominations || !isAppStoreProduct(selectedProduct)
        ? displayableSelectedProductOffers
        : getPopularOffers(selectedProduct, displayableSelectedProductOffers),
    [displayableSelectedProductOffers, selectedProduct, showAllDenominations],
  );

  const clientPriceRub = selectedOffer?.priceRub ?? null;
  const selectedOrderFlow = resolveOrderFlow(selectedProduct, selectedProductMeta);
  const requiredOrderFields = getRequiredOrderFields(selectedOrderFlow, selectedProductMeta);
  const canContinue =
    selectedProduct !== null &&
    clientPriceRub !== null &&
    requiredOrderFields.every((field) => isOrderFieldFilled(field, orderFields));
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
    setOrderError(null);
    setRegisteredOrder(null);
    setPaymentUrl(null);
    setShowPaymentFallback(false);
  }

  function selectProduct(product: Product) {
    const meta = violetCatalog[product.id] ?? null;
    const offers = resolveProductOffers(product, meta);
    setSelectedProductId(product.id);
    setSelectedOffer(getDefaultOffer(product, offers));
    setShowAllDenominations(false);
    setOrderFields(EMPTY_ORDER_FIELDS);
    setOrderStatus('idle');
    setOrderError(null);
    setRegisteredOrder(null);
    setPaymentUrl(null);
    setShowPaymentFallback(false);
  }

  function updateOrderField(field: OrderFieldKey, value: string) {
    setOrderFields((prev) => ({ ...prev, [field]: value }));
    setOrderStatus('idle');
    setOrderError(null);
  }

  function previewOrder() {
    if (!canContinue) return;
    setOrderStatus('preview');
  }

  async function registerGiftCardOrder() {
    if (!canContinue || orderRegistering) return;

    const categoryId = selectedProductMeta?.categoryId;
    const cardId = selectedOffer?.cardId;

    setOrderError(null);
    setRegisteredOrder(null);
    setPaymentUrl(null);
    setShowPaymentFallback(false);

    if (!categoryId || !cardId) {
      setOrderError('Не удалось определить выбранный товар');
      return;
    }

    setOrderRegistering(true);

    try {
      const response = await fetch(ORDER_REGISTER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          cardId,
          quantity: 1,
        }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        order?: RegisteredOrder;
        formUrl?: string;
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !payload.order || !payload.formUrl) {
        setOrderError(getOrderRegisterErrorMessage(payload.error));
        return;
      }

      setRegisteredOrder(payload.order);
      setPaymentUrl(payload.formUrl);
      setOrderStatus('idle');

      const opened = window.open(payload.formUrl, '_blank', 'noopener,noreferrer');
      if (!opened) setShowPaymentFallback(true);
    } catch (_error) {
      setOrderError('Не удалось создать платёж');
    } finally {
      setOrderRegistering(false);
    }
  }

  function continueOrder() {
    if (selectedOrderFlow === 'code_delivery') {
      void registerGiftCardOrder();
      return;
    }

    previewOrder();
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
    setOrderError(null);
    setRegisteredOrder(null);
    setPaymentUrl(null);
    setShowPaymentFallback(false);
  }, [selectedProductId, violetCatalog, visibleProducts]);

  useEffect(() => {
    if (displayableSelectedProductOffers.some((offer) => isSameOffer(selectedOffer, offer))) return;
    setSelectedOffer(getDefaultOffer(selectedProduct, displayableSelectedProductOffers));
    setOrderStatus('idle');
    setOrderError(null);
    setRegisteredOrder(null);
    setPaymentUrl(null);
    setShowPaymentFallback(false);
  }, [displayableSelectedProductOffers, selectedOffer, selectedProduct]);

  return (
    <div className="app">
      <header className="violet-header">
        <div>
          <div className="eyebrow">MAX Digital Market</div>
          <h1 className="violet-title">{APP_DISPLAY_NAME}</h1>
          <p className="violet-copy">
            Витрина цифровых товаров для Telegram, Steam, подарочных карт
            и игровых пополнений.
          </p>
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
                      {firstOffer ? `от ${formatOfferPrice(firstOffer)}` : 'цены недоступны'}
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
                    setOrderError(null);
                    setRegisteredOrder(null);
                    setPaymentUrl(null);
                    setShowPaymentFallback(false);
                  }}
                >
                  <span>{formatOfferNominal(offer, selectedProduct)}</span>
                  <small>{formatOfferPrice(offer)}</small>
                </button>
              ))
            ) : (
              <div className="denomination-empty">
                Номиналы временно недоступны. Попробуйте позже.
              </div>
            )}
          </div>
          {isAppStoreProduct(selectedProduct) && displayableSelectedProductOffers.length > visibleSelectedOffers.length && (
            <button
              className="btn-link denomination-toggle"
              type="button"
              onClick={() => setShowAllDenominations(true)}
            >
              Показать все номиналы
            </button>
          )}
          {isAppStoreProduct(selectedProduct) && showAllDenominations && displayableSelectedProductOffers.length > 6 && (
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
              {clientPriceRub === null ? 'нет цены' : `К оплате: ${formatRub(clientPriceRub)}`}
            </strong>
            {clientPriceRub === null && (
              <span className="total-box__rub">Ожидаем реальные данные FazerCards</span>
            )}
            <span className="total-box__delivery">
              Получение: {getDeliverySummary(selectedOrderFlow)}
            </span>
          </div>

          <button
            className="btn -accent"
            type="button"
            disabled={!canContinue || orderRegistering}
            onClick={continueOrder}
          >
            {orderRegistering ? 'Создаём заказ…' : 'Продолжить'}
          </button>

          {orderError && (
            <div className="success-note -error">
              <strong>{orderError}</strong>
            </div>
          )}

          {registeredOrder && (
            <div className="success-note">
              <strong>Заказ создан</strong>
              <span>Номер заказа: {registeredOrder.orderNumber}</span>
              <span>Сумма: {formatRub(registeredOrder.amount / 100)}</span>
              <span>Статус: Ожидает оплаты</span>
              {showPaymentFallback && paymentUrl && (
                <button
                  className="btn -accent"
                  type="button"
                  onClick={() => window.open(paymentUrl, '_blank', 'noopener,noreferrer')}
                >
                  Перейти к оплате
                </button>
              )}
            </div>
          )}

          {orderStatus === 'preview' && (
            <div className="success-note">
              <strong>Предпросмотр заказа готов</strong>
              <span>Товар: {selectedProduct.name}</span>
              <span>Вариант: {selectedOffer ? formatOfferNominal(selectedOffer, selectedProduct) : 'не выбран'}</span>
              <span>К оплате: {clientPriceRub === null ? 'нет цены' : formatRub(clientPriceRub)}</span>
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
