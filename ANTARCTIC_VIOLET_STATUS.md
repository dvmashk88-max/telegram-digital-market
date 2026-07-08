# Antarctic Violet — Project Status

## PUBG / Free Fire read-only pricing fix 2026-07-07

### Что исправлено

- PUBG и Free Fire теперь получают варианты и закупочные цены через read-only endpoint:
  - `GET /api/v2/topups/offers?category_id=pubg_mobile_auto`;
  - `GET /api/v2/topups/offers?category_id=free_fire_eu`.
- POST/order endpoints не вызывались.
- Payment flow и Antarctic Wallet SDK не менялись.
- Для каждого topup offer в `/api/fazercards/violet-catalog` теперь формируется:
  - `cardId = offer_id`;
  - `name`;
  - `rawPriceUsd = price_usd`;
  - `priceUsdt = roundStorePriceUsdt(rawPriceUsd * 1.50)`;
  - `priceRubApprox = Math.round(priceUsdt * ANTARCTIC_USDT_RATE_RUB)`.
- `denominations` строятся из offers; frontend показывает человекочитаемый `name`:
  - `60 UC`;
  - `325 UC`;
  - `25 Diamonds`;
  - `Weekly Lite`.
- `fields[].key = "player_id"` из FazerCards metadata мапится в frontend key:
  - `requiredFields: ["playerId"]`.

### Production examples

- PUBG:
  - `60_uc` / `60 UC` / `0.8805 USD` -> `1.4 USDT` (`≈109 ₽`);
  - `325_uc` / `325 UC` / `4.4157 USD` -> `6.7 USDT` (`≈522 ₽`);
  - `660_uc` / `660 UC` / `8.9000 USD` -> `14 USDT` (`≈1091 ₽`);
  - `1800_uc` / `1800 UC` / `22.2500 USD` -> `34 USDT` (`≈2650 ₽`);
  - `3850_uc` / `3850 UC` / `44.5000 USD` -> `67 USDT` (`≈5223 ₽`).
- Free Fire:
  - `25_diamonds` / `25 Diamonds` / `0.2550 USD` -> `0.5 USDT` (`≈39 ₽`);
  - `weekly_lite` / `Weekly Lite` / `0.2747 USD` -> `0.5 USDT` (`≈39 ₽`);
  - `evo_access_3d` / `Evo Access 3D` / `0.5494 USD` -> `0.9 USDT` (`≈70 ₽`);
  - `evo_access_7d` / `Evo Access 7D` / `0.8241 USD` -> `1.3 USDT` (`≈101 ₽`);
  - `100_diamonds` / `100 Diamonds` / `0.8437 USD` -> `1.3 USDT` (`≈101 ₽`).

### Проверки

- `npm run build` -> проходит.
- `npm run check:violet-pricing-all` -> проходит.
- Local read-only check:
  - `VIOLET_CATALOG_URL=http://localhost:3351/api/fazercards/violet-catalog npm run check:violet-pricing-all`;
  - `pubg: 23 variants match rawPriceUsd * 1.50`;
  - `free-fire: 19 variants match rawPriceUsd * 1.50`.
- Production read-only check:
  - `VIOLET_CATALOG_URL=https://example-app-production-e00d.up.railway.app/api/fazercards/violet-catalog npm run check:violet-pricing-all`;
  - `pubg: 23 variants match rawPriceUsd * 1.50`;
  - `free-fire: 19 variants match rawPriceUsd * 1.50`.
- Production metadata:
  - `pubg.requiredFields = ["playerId"]`;
  - `free-fire.requiredFields = ["playerId"]`;
  - `raw.offersEndpoint = "/api/v2/topups/offers"`.

### Commit и deployment

- Code commit: `555728c` (`Load topup offers for Violet catalog`).
- Railway deployment ID: `434aaa9a-419a-42e4-8045-6b681397f41d`.

## FazerCards order flow research 2026-07-07

### Важное ограничение

- Это был исследовательский проход по order flow.
- Боевые заказы намеренно не планировались.
- Публичная документация/OpenAPI на `api.fzr.cards` не найдена:
  - `GET /docs` -> 404;
  - `GET /documentation` -> 404;
  - `GET /openapi.json` -> 404;
  - `GET /swagger.json` -> 404;
  - `GET /api-docs` -> 404;
  - `GET /api/v2/docs` -> 404;
  - `GET /api/v2/openapi.json` -> 404.
- `GET` на order endpoints возвращает 404, endpoints являются POST-only.
- `OPTIONS` на order endpoints возвращает `Invalid Preflight Request`, schema через OPTIONS не отдаётся.

### Важный инцидент во время validation probing

- При проверке validation schema один запрос оказался не dry-run, а реальным order create:
  - endpoint: `POST /api/v2/telegram/premium/buy`;
  - body: `{ "telegram_username": "invalid_user", "months": 3 }`;
  - создан order: `ord-147037`;
  - `chargedUsd`: `12.1869`;
  - `balanceTxId`: `163683`;
  - статус позже стал `completed`;
  - `GET /api/v2/orders/ord-147037` вернул `account_display_name: "Invalid User"`.
- После этого все POST-запросы были остановлены; дальше выполнялись только GET/read-only проверки.
- Вывод: FazerCards order endpoints нельзя трогать даже с seemingly test username без отдельного подтверждения и отдельного low-risk test budget.
- Safe dry-run/test/schema endpoint не найден.

### Order status endpoints

- Рабочий endpoint статуса конкретного заказа:
  - `GET /api/v2/orders/{order_id}`;
  - пример: `GET /api/v2/orders/ord-147037`.
- Рабочий endpoint списка/поиска заказов:
  - `GET /api/v2/orders`;
  - `GET /api/v2/orders?id={order_id}`.
- Order object содержит:
  - `id`;
  - `kind`;
  - `status`;
  - `chargedUsd`;
  - `failReason`;
  - `balanceTxId`;
  - `refundTxId`;
  - `statusHistory`;
  - `createdAt`;
  - `completedAt`.
- Проверенные статусы:
  - `created`;
  - `processing`;
  - `completed`.
- Отдельные status endpoints не найдены:
  - `/api/v2/order/{id}` -> 404;
  - `/api/v2/status/{id}` -> 404;
  - `/api/v2/telegram/premium/order/{id}` -> 404;
  - `/api/v2/telegram/premium/status/{id}` -> 404.

### Balance endpoint

- `GET /api/v2/balance` работает.
- После accidental Telegram Premium order баланс был:
  - `{"ok":true,"balance":"7.8231","currency":"USD"}`.
- Ошибку недостаточного баланса безопасно не проверяли, потому что это требует реального order attempt.

### Gift Cards

- Catalog/variants:
  - `GET /api/v2/giftcards`;
  - `GET /api/v2/giftcards/cards?category_id={category_id}`.
- Order endpoint:
  - `POST /api/v2/giftcards/order`.
- Validation probing показал обязательные поля:
  - `category_id`;
  - `card_id`;
  - `quantity`.
- Если `category_id/card_id` не совпадают с реальным offer:
  - HTTP 404;
  - `No matching offer: check category_id and card_id (same pair as in GET /giftcards/cards for that category).`
- Как именно возвращается купленный код без реальной покупки не подтверждено.
- Гипотеза по общей модели API: после POST нужно читать `GET /api/v2/orders/{order_id}`; наличие кода/ключа в completed order нужно подтвердить отдельным контролируемым тестовым заказом или документацией поставщика.

### Steam

- В текущем Violet catalog Steam представлен как gift card category:
  - `category_id = steam_wallet_global`;
  - read-only variants доступны через `GET /api/v2/giftcards/cards?category_id=steam_wallet_global`;
  - offers имеют `card_id`, `name`, `price_usd`, `stock`.
- Текущий backend metadata всё ещё мапит `steam-top-up` на:
  - `POST /api/v2/steam-topup/order`;
  - `orderFlow = steam_balance`;
  - required field в UI: `steamLogin`.
- Validation probing `POST /api/v2/steam-topup/order` показал обязательные поля:
  - `steamLogin`;
  - `currency`;
  - следующие поля не проверялись, чтобы не создать заказ.
- Вывод: нужно уточнить продуктовую модель Steam:
  - если продаём Steam Wallet gift codes, вероятно безопаснее использовать `POST /api/v2/giftcards/order` с `category_id=steam_wallet_global`, `card_id`, `quantity`;
  - если продаём прямой Steam top-up, нужен точный schema для `steam-topup/order` и список поддерживаемых `currency/amount`.

### Telegram Stars

- Read-only endpoint:
  - `GET /api/v2/telegram/stars`;
  - отдаёт `price_per_star`, `min_amount`, `max_amount`.
- Order endpoint:
  - `POST /api/v2/telegram/stars/buy`.
- Validation probing показал обязательные поля:
  - `telegram_username`;
  - `quantity`.
- Safe example response без создания заказа не найден.
- Ожидаемый результат заказа нужно получать через:
  - `GET /api/v2/orders/{order_id}`.

### Telegram Premium

- Read-only endpoint:
  - `GET /api/v2/telegram/premium`;
  - отдаёт `plans[]` с `months` и `price_usd`.
- Order endpoint:
  - `POST /api/v2/telegram/premium/buy`.
- Обязательные поля:
  - `telegram_username`;
  - `months`.
- Важно: валидный payload сразу создаёт заказ и списывает баланс.
- Подтверждённый response create:
  - HTTP 201;
  - `ok: true`;
  - `order.id`;
  - `order.kind = telegram_premium`;
  - `order.status = created`;
  - `chargedUsd`;
  - `balanceTxId`.
- Статус потом читается через:
  - `GET /api/v2/orders/{order_id}`.

### PUBG Mobile

- Причина прошлой проблемы с ценами:
  - `GET /api/v2/topups` отдаёт только категории без вариантов и без price fields.
- Правильный read-only endpoint вариантов:
  - `GET /api/v2/topups/offers?category_id=pubg_mobile_auto`.
- Endpoint отдаёт:
  - `offers[]`;
  - `offer_id`;
  - `name`;
  - `price_usd`;
  - `fields`;
  - `note`.
- Required fields metadata:
  - `{ "key": "player_id", "label": "Player ID", "type": "text" }`.
- Проверенные примеры offers:
  - `60_uc` / `60 UC` / `price_usd: 0.8805`;
  - `325_uc` / `325 UC` / `price_usd: 4.4157`;
  - `660_uc` / `660 UC` / `price_usd: 8.9000`;
  - `1800_uc` / `1800 UC` / `price_usd: 22.2500`;
  - `3850_uc` / `3850 UC` / `price_usd: 44.5000`.
- Order endpoint:
  - `POST /api/v2/topups/order`.
- Validation probing показал обязательные поля:
  - `category_id`;
  - `offer_id`;
  - `fields`.
- Для PUBG `fields` должен включать `player_id`.

### Free Fire

- Причина прошлой проблемы с ценами такая же:
  - `GET /api/v2/topups` отдаёт категорию без вариантов и без price fields.
- Правильный read-only endpoint вариантов:
  - `GET /api/v2/topups/offers?category_id=free_fire_eu`.
- Endpoint отдаёт:
  - `offers[]`;
  - `offer_id`;
  - `name`;
  - `price_usd`;
  - `fields`;
  - `note`.
- Required fields metadata:
  - `{ "key": "player_id", "label": "Player ID", "type": "text" }`.
- Проверенные примеры offers:
  - `25_diamonds` / `25 Diamonds` / `price_usd: 0.2550`;
  - `weekly_lite` / `Weekly Lite` / `price_usd: 0.2747`;
  - `evo_access_3d` / `Evo Access 3D` / `price_usd: 0.5494`;
  - `100_diamonds` / `100 Diamonds` / `price_usd: 0.8437`;
  - `weekly_membership` / `Weekly Membership` / `price_usd: 1.6630`.
- Order endpoint:
  - `POST /api/v2/topups/order`.
- Validation probing показал обязательные поля:
  - `category_id`;
  - `offer_id`;
  - `fields`.
- Для Free Fire `fields` должен включать `player_id`.

### Game Keys

- Read-only endpoints:
  - `GET /api/v2/gamekeys`;
  - `GET /api/v2/gamekeys/keys?game_id={game_id}`.
- `GET /api/v2/gamekeys/keys` без `game_id` возвращает validation error:
  - `querystring: must have required property 'game_id'`.
- Пример:
  - `GET /api/v2/gamekeys/keys?game_id=among_us_global`;
  - key: `key_id = base`;
  - `name = Among Us`;
  - `price_usd = 3.1310`;
  - `stock = 11`.
- Order endpoint:
  - `POST /api/v2/gamekeys/order`.
- Validation probing показал обязательные поля:
  - `game_id`;
  - `key_id`.

### Как FazerCards отдаёт ключи и коды

- Без реального gift card / game key заказа невозможно безопасно подтвердить, находится ли код:
  - сразу в response `POST /order`;
  - позже в `GET /api/v2/orders/{order_id}`;
  - в отдельном endpoint.
- Подтверждённая часть:
  - order create для Telegram Premium возвращает `order`;
  - `GET /api/v2/orders/{order_id}` возвращает актуальный статус, историю и финансовые поля;
  - webhook endpoint/documentation не найден.
- Для подключения кодов/ключей следующим шагом нужен один из двух вариантов:
  - официальная документация/ответ поддержки FazerCards по completed order payload;
  - контролируемый low-value test order с явным подтверждением пользователя и заранее выбранным минимальным SKU.

### Что можно подключать следующим шагом

- Read-only catalog:
  - добавить в backend `GET /api/v2/topups/offers?category_id=...` для PUBG и Free Fire;
  - добавить variants/pricing для PUBG и Free Fire по `offer_id` и `price_usd`;
  - обновить frontend формы так, чтобы topup `fields` строились из metadata (`player_id`).
- Order preparation без покупки:
  - собрать backend-only draft payload builder для каждого orderFlow;
  - валидировать наличие `category_id/card_id/offer_id/fields/telegram_username/months/quantity` до wallet payment;
  - не вызывать FazerCards POST до отдельного confirmed purchase step.
- Реальный purchase flow:
  - после оплаты через Antarctic Wallet backend вызывает FazerCards order endpoint;
  - сохраняет `order_id`;
  - polling через `GET /api/v2/orders/{order_id}`;
  - показывает код/ключ только после подтверждения, где именно FazerCards возвращает секретные данные.

## Единый pricing +50% для всего каталога 2026-07-07

### Что изменено

- Введён единый helper backend:
  - `calculateSalePriceFromPurchaseUsd(purchasePriceUsd)`;
  - формула: `roundStorePriceUsdt(purchasePriceUsd * 1.50)`;
  - `priceRubApprox = Math.round(priceUsdt * ANTARCTIC_USDT_RATE_RUB)`.
- Helper используется для всех вариантов, где FazerCards отдаёт закупочную цену:
  - App Store / iTunes TR;
  - App Store / iTunes US;
  - App Store / iTunes RU;
  - App Store / iTunes IN;
  - Roblox Gift Card;
  - PlayStation Gift Card;
  - Xbox Gift Card;
  - Steam Wallet / Steam Top-Up;
  - Telegram Stars;
  - Telegram Premium.
- Реальные поля закупочной цены:
  - gift cards / Steam offers: `offers[].price_usd`;
  - Telegram Stars: `price_per_star`, для каждого pack считается `amount * price_per_star`;
  - Telegram Premium: `plans[].price_usd`;
  - generic fallback для единичных catalog items: `price_usd`, `priceUsd`, `price`, `cost`.
- Для каждого priced варианта backend отдаёт:
  - `rawPriceUsd`;
  - `priceUsdt`;
  - `priceRubApprox`.
- Frontend теперь использует `priceUsdt` для всех товаров, у которых backend отдал priced variants, и не считает локальную фейковую цену от номинала после загрузки реального catalog.

### Что без закупочной цены

- В текущем FazerCards topups catalog для `pubg_mobile_auto` и `free_fire_eu` нет цены, вариантов или usable purchase-price fields.
- Для них backend не отдаёт фейковую цену и пишет warning:
  - `pubg`;
  - `free-fire`.
- В UI после загрузки catalog такие товары показывают отсутствие доступных номиналов вместо локально рассчитанной фейковой цены.

### Проверенные товары и варианты

- Production check:
  - `apple-tr: 23 variants match rawPriceUsd * 1.50`;
  - `apple-us: 29 variants match rawPriceUsd * 1.50`;
  - `apple-ru: 15 variants match rawPriceUsd * 1.50`;
  - `apple-in: 13 variants match rawPriceUsd * 1.50`;
  - `roblox-gift-card: 6 variants match rawPriceUsd * 1.50`;
  - `playstation-gift-card: 17 variants match rawPriceUsd * 1.50`;
  - `xbox-gift-card: 8 variants match rawPriceUsd * 1.50`;
  - `steam-top-up: 7 variants match rawPriceUsd * 1.50`;
  - `telegram-stars: 4 variants match rawPriceUsd * 1.50`;
  - `telegram-premium: 3 variants match rawPriceUsd * 1.50`.

### Примеры production цен

- Apple RU:
  - `600 RUB @ 16.97 USD` -> `26 USDT`;
  - `700 RUB @ 19.80 USD` -> `30 USDT`;
  - `800 RUB @ 22.62 USD` -> `34 USDT`;
  - `900 RUB @ 25.45 USD` -> `39 USDT`;
  - `1000 RUB @ 30.72 USD` -> `47 USDT`;
  - `1500 RUB @ 42.42 USD` -> `64 USDT`.
- Other products:
  - `Roblox 200 Robux @ 2.8179 USD` -> `4.3 USDT`;
  - `PlayStation 10 USD @ 8.8000 USD` -> `14 USDT`;
  - `Xbox 10 USD @ 8.5000 USD` -> `13 USDT`;
  - `Steam 10 USD @ 10.4000 USD` -> `16 USDT`;
  - `Telegram Stars 100 @ 1.52627 USD` -> `2.3 USDT`;
  - `Telegram Premium 3 months @ 12.1869 USD` -> `19 USDT`.

### Проверки

- `npm run build` -> проходит.
- `npm run check:violet-pricing-all` -> проходит.
- `npm run check:violet-ru-pricing` -> проходит как alias на новый full pricing check.
- Local:
  - `VIOLET_CATALOG_URL=http://localhost:3351/api/fazercards/violet-catalog npm run check:violet-pricing-all` -> проходит.
- Production:
  - `VIOLET_CATALOG_URL=https://example-app-production-e00d.up.railway.app/api/fazercards/violet-catalog npm run check:violet-pricing-all` -> проходит.

### Commit и deployment

- Code commit: `be1b787` (`Apply purchase-cost pricing to Violet catalog`).
- Railway deployment ID: `fcc2c5c2-2b9f-4b6d-85ff-6f3a81d10231`.

## Срочное исправление App Store pricing от FazerCards cost 2026-07-07

### Старая ошибка

- App Store / iTunes price считался от номинала карты и ручных курсов валют:
  - `baseRub = nominal * manualCurrencyRate`;
  - `baseUsdt = baseRub / ANTARCTIC_USDT_RATE_RUB`;
  - затем применялся markup.
- Это было неверно для всех App Store регионов:
  - Turkey;
  - USA;
  - Russia;
  - India.
- Особенно заметно ошибка проявлялась на Apple RU:
  - пример `1000 RUB` считался около `21 USDT` после предыдущего RU markup;
  - при реальной закупочной цене FazerCards `30.72 USD` правильная цена должна быть `47 USDT`.

### Новая логика

- Для всех App Store / iTunes offers цена продажи считается только от реальной закупочной цены FazerCards:
  - `purchasePriceUsd = Number(offer.price_usd)`;
  - `priceUsdt = roundStorePriceUsdt(purchasePriceUsd * 1.50)`;
  - `priceRubApprox = Math.round(priceUsdt * ANTARCTIC_USDT_RATE_RUB)`.
- Markup:
  - `APP_STORE_MARKUP_RATE = 0.50`.
- Ручные курсы App Store удалены из backend pricing.
- Отдельный `APP_STORE_RU_MARKUP_RATE` больше не используется.
- Если у App Store offer нет валидного `price_usd`, offer пропускается и backend пишет warning.
- Товары, номиналы, FazerCards API, payment flow и Antarctic Wallet SDK не менялись.

### Apple RU цены после исправления

- `600 RUB @ 16.97 USD` -> `26 USDT`.
- `700 RUB @ 19.80 USD` -> `30 USDT`.
- `800 RUB @ 22.62 USD` -> `34 USDT`.
- `900 RUB @ 25.45 USD` -> `39 USDT`.
- `1000 RUB @ 30.72 USD` -> `47 USDT`.
- `1500 RUB @ 42.42 USD` -> `64 USDT`.

### Проверки

- `npm run build` -> проходит.
- `npm run check:violet-ru-pricing` -> проходит и печатает контрольные Apple RU цены.
- Local:
  - `VIOLET_CATALOG_URL=http://localhost:3351/api/fazercards/violet-catalog npm run check:violet-ru-pricing`;
  - `apple-tr: 23 offers match rawPriceUsd * 1.50`;
  - `apple-us: 29 offers match rawPriceUsd * 1.50`;
  - `apple-ru: 15 offers match rawPriceUsd * 1.50`;
  - `apple-in: 13 offers match rawPriceUsd * 1.50`.
- Production:
  - `VIOLET_CATALOG_URL=https://example-app-production-e00d.up.railway.app/api/fazercards/violet-catalog npm run check:violet-ru-pricing`;
  - `apple-tr: 23 offers match rawPriceUsd * 1.50`;
  - `apple-us: 29 offers match rawPriceUsd * 1.50`;
  - `apple-ru: 15 offers match rawPriceUsd * 1.50`;
  - `apple-in: 13 offers match rawPriceUsd * 1.50`;
  - Apple RU контрольные цены совпали с новой логикой.

### Commit и deployment

- Code commit: `ca38351` (`Price App Store offers from FazerCards cost`).
- Railway deployment ID: `c7ff3196-a24c-4ddd-a9a9-eaf2b6ff1d69`.

## Исправление иконки и Apple RU pricing 2026-07-07

### Что было не так с иконкой

- `/icon.svg` уже отдавал новую иконку.
- `/favicon.ico` уже был привязан к новой `icon.svg`.
- `/app-icon.svg` всё ещё отдавал старую AV-иконку:
  - local/production hash старой иконки: `9629e031eb1a0b2d3e5a870376b88185c0ee0868e78ae6f462e58f38cbc5a97a`;
  - именно этот URL ранее использовался как App Icon URL для Antarctic Wallet.
- `config.json` указывал `"icon": "./icon.svg"`, а не на `/app-icon.svg`, поэтому источники иконки были несинхронны.

### Что исправлено по иконке

- `examples/react/public/app-icon.svg` заменён на тот же SVG, что и `icon.svg`.
- `examples/react/public/config.json` теперь указывает:
  - `"icon": "/app-icon.svg"`.
- Backend route `GET /app-icon.svg` теперь явно отдаёт `STATIC_DIR/icon.svg`, так же как `GET /favicon.ico`.
- После `npm run build` проверено, что dist assets совпадают:
  - `examples/react/dist/icon.svg`;
  - `examples/react/dist/app-icon.svg`.

### Проверенные URL иконки

- Local после исправления:
  - `GET /icon.svg` -> hash `c55c9e6f634e45e70fb0b0faee5ac02021179ab73a793366c3c53d4d323bb4e0`;
  - `GET /app-icon.svg` -> hash `c55c9e6f634e45e70fb0b0faee5ac02021179ab73a793366c3c53d4d323bb4e0`;
  - `GET /favicon.ico` -> hash `c55c9e6f634e45e70fb0b0faee5ac02021179ab73a793366c3c53d4d323bb4e0`;
  - `GET /config.json` -> `"icon": "/app-icon.svg"`.
- Production после деплоя:
  - `GET /icon.svg` -> hash `c55c9e6f634e45e70fb0b0faee5ac02021179ab73a793366c3c53d4d323bb4e0`;
  - `GET /app-icon.svg` -> hash `c55c9e6f634e45e70fb0b0faee5ac02021179ab73a793366c3c53d4d323bb4e0`;
  - `GET /favicon.ico` -> hash `c55c9e6f634e45e70fb0b0faee5ac02021179ab73a793366c3c53d4d323bb4e0`;
  - `GET /config.json` -> `"icon": "/app-icon.svg"`.

### Что было не так с Apple RU pricing

- Все App Store регионы использовали общий `APP_STORE_MARKUP_RATE = 0.30`.
- Для `app_store_itunes_ru` это давало слишком низкую цену:
  - `1000 RUB` получался около `17 USDT`.
- Требуемая логика для RU:
  - `APP_STORE_RU_MARKUP_RATE = 0.60`;
  - `baseRub = nominal * RUB_RUB`;
  - `baseUsdt = baseRub / ANTARCTIC_USDT_RATE_RUB`;
  - `priceUsdt = baseUsdt * 1.60`;
  - дальше применяется текущее округление вверх.

### Что исправлено по Apple RU pricing

- В `examples/backend-node/server.mjs` добавлен `APP_STORE_RU_MARKUP_RATE = 0.6`.
- `calculateAppStoreSalePrice()` теперь выбирает markup по валюте:
  - `RUB` -> `0.60`;
  - `TRY`, `USD`, `INR` -> общий `APP_STORE_MARKUP_RATE = 0.30`.
- Товары, номиналы, FazerCards API, payment flow и Antarctic Wallet SDK не менялись.

### Проверочные цены Apple RU

- Добавлен проверочный скрипт:
  - `npm run check:violet-ru-pricing`;
  - опционально сверяет catalog через `VIOLET_CATALOG_URL`.
- Расчётные цены:
  - `500 RUB` -> `11 USDT`;
  - `1000 RUB` -> `21 USDT`;
  - `2500 RUB` -> `52 USDT`;
  - `5000 RUB` -> `103 USDT`.
- Local `/api/fazercards/violet-catalog` после исправления:
  - `500 RUB catalog -> 11 USDT`;
  - `1000 RUB catalog -> 21 USDT`;
  - `2500 RUB catalog -> not in current FazerCards offers; formula price would be 52 USDT`;
  - `5000 RUB catalog -> 103 USDT`.
- Production `/api/fazercards/violet-catalog` после деплоя:
  - `500 RUB catalog -> 11 USDT`;
  - `1000 RUB catalog -> 21 USDT`;
  - `2500 RUB catalog -> not in current FazerCards offers; formula price would be 52 USDT`;
  - `5000 RUB catalog -> 103 USDT`.

### Проверки

- `npm run check:violet-ru-pricing` -> проходит.
- `VIOLET_CATALOG_URL=http://localhost:3351/api/fazercards/violet-catalog npm run check:violet-ru-pricing` -> проходит.
- `VIOLET_CATALOG_URL=https://example-app-production-e00d.up.railway.app/api/fazercards/violet-catalog npm run check:violet-ru-pricing` -> проходит.
- `npm run build` -> проходит.

### Commit и deployment

- Code commit: `7b74c89` (`Fix Violet icon and Apple RU pricing`).
- Railway deployment ID: `5040d990-572f-4253-9edf-69b152ff8cd1`.

## Read-write аудит и тестирование 2026-07-07

### Что проверено

- Локально поднят production backend/static server:
  - `STATIC_DIR=examples/react/dist PORT=3351 node examples/backend-node/server.mjs`;
  - затем сервер перезапущен через `railway run` с реальными Railway env для FazerCards.
- Проверены API:
  - `GET /health` -> HTTP 200, `{"ok":true}`;
  - `GET /config.json` -> HTTP 200, `AW_APP_ID` подтягивается из env, `requiredScopes=["user.profile.read"]`;
  - `GET /api/fazercards/violet-catalog` -> HTTP 200 с реальным FazerCards catalog;
  - `GET /favicon.ico` после исправления -> HTTP 200, `image/svg+xml`.
- Проверен полный пользовательский сценарий через Playwright:
  - загрузка витрины и синхронизация каталога;
  - все категории: Apple / Gift Cards, Steam, Игры, Telegram;
  - все карточки товаров;
  - все формы orderFlow:
    - Gift Cards / App Store -> без обязательного поля, показывается блок `Как вы получите код`;
    - Steam -> поле `Steam логин`;
    - Telegram Stars / Premium -> поле `Username Telegram`;
    - Games -> поле `ID игрока / UID`;
  - блокировка кнопки `Продолжить` для Steam, Telegram и Games до заполнения обязательного поля;
  - preview заказа после нажатия `Продолжить`;
  - отображение названий товаров, номиналов, валют, цен в USDT и примерных цен в ₽;
  - раскрытие полного списка номиналов App Store;
  - мобильная адаптивность на viewport `390x844`.
- Проверены browser console и network:
  - JavaScript ошибок не найдено;
  - React warning не найдено;
  - `pageerror` не найдено;
  - failed network requests не найдено;
  - HTTP responses `>=400` в Playwright-сценарии не найдено;
  - битых изображений в сценарии не найдено.
- Проверен production build:
  - `npm run build` проходит успешно.

### Проверка App Store цен, валют, номиналов и количества вариантов

- `apple-tr` / `app_store_itunes_tr`:
  - валюта: `TRY`;
  - вариантов: 23;
  - номиналы: `10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750, 799, 1000, 1250, 1500, 1750, 2000`;
  - все цены `priceUsdt` и `priceRubApprox` совпали с текущей формулой расчёта.
- `apple-us` / `app_store_itunes_us`:
  - валюта: `USD`;
  - вариантов: 29;
  - номиналы: `2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 75, 80, 90, 100, 150, 200, 250, 300, 400, 500`;
  - все цены `priceUsdt` и `priceRubApprox` совпали с текущей формулой расчёта.
- `apple-ru` / `app_store_itunes_ru`:
  - валюта: `RUB`;
  - вариантов: 15;
  - номиналы: `500, 600, 700, 800, 900, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000`;
  - все цены `priceUsdt` и `priceRubApprox` совпали с текущей формулой расчёта.
- `apple-in` / `app_store_itunes_in`:
  - валюта: `INR`;
  - вариантов: 13;
  - номиналы: `100, 200, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000`;
  - все цены `priceUsdt` и `priceRubApprox` совпали с текущей формулой расчёта.
- `matchedIds` содержит 12 товаров:
  - `apple-tr`;
  - `apple-us`;
  - `apple-ru`;
  - `apple-in`;
  - `roblox-gift-card`;
  - `playstation-gift-card`;
  - `xbox-gift-card`;
  - `steam-top-up`;
  - `pubg`;
  - `free-fire`;
  - `telegram-stars`;
  - `telegram-premium`.

### Что найдено

- Критических проблем не обнаружено.
- Найден один некритический дефект static backend:
  - прямой запрос `GET /favicon.ico` возвращал HTTP 404;
  - основной HTML уже ссылался на `/icon.svg`, поэтому в Playwright-сценарии отсутствующий favicon не ломал страницу, но совместимость с клиентами, которые автоматически запрашивают `/favicon.ico`, была неполной.
- Первый запрос к FazerCards catalog во время аудита один раз вернул backend 502 из-за временного `ConnectTimeout` до `api.fzr.cards`; повторная проверка и минимальный Node `fetch` с теми же Railway env прошли успешно. Ошибок нормализации каталога или расчёта цен не найдено.

### Что исправлено

- В `examples/backend-node/server.mjs` добавлен route:
  - `GET /favicon.ico`;
  - отдаёт существующий `icon.svg` из `STATIC_DIR` с content-type `image/svg+xml`.
- SDK Antarctic Wallet не менялся.
- FazerCards API, endpoints, payloads и расчёт цен не менялись.
- Новые функции не добавлялись.

### Что осталось сделать

- Реальный checkout/payment всё ещё не реализован.
- Реальные FazerCards order endpoints всё ещё не вызываются:
  - `POST /api/v2/giftcards/order`;
  - `POST /api/v2/topups/order`;
  - `POST /api/v2/telegram/stars/buy`;
  - `POST /api/v2/telegram/premium/buy`;
  - `POST /api/v2/steam-topup/order`;
  - `POST /api/v2/gamekeys/order`.
- Купленные коды/ключи всё ещё не сохраняются и не показываются, потому что реальная покупка не подключена.

## Итоги сессии 2026-06-28

### Нормализация названий App Store регионов

- Frontend App Store карточки приведены к единому виду:
  - `App Store & iTunes (Турция)`;
  - `App Store & iTunes (США)`;
  - `App Store & iTunes (Россия)`;
  - `App Store & iTunes (Индия)`.
- Название используется единообразно на карточке товара, в блоке выбранного товара и в preview заказа через `selectedProduct.name`.
- Не менялись `category_id`, `cardId`, `orderFlow`, FazerCards API, цены, номиналы и wallet SDK/payment flow.
- Проверено локально: `npm run build` проходит, production bundle содержит все 4 русских названия без старых `TR/US/RU` вариантов.

### Замена App Store Indonesia на App Store India

- Через `railway run` с реальными `FAZERCARDS_API_BASE` и `FAZERCARDS_API_KEY` проверен полный FazerCards giftcards catalog:
  - всего 568 категорий;
  - пагинация: 200 + 200 + 168;
  - `app_store_itunes_in` найден как `App Store & iTunes (IN)`.
- Проверен `GET /api/v2/giftcards/cards?category_id=app_store_itunes_in`:
  - HTTP 200;
  - 13 offers;
  - валюта номиналов: `INR`;
  - реальные номиналы: `100`, `200`, `250`, `500`, `1000`, `1500`, `2000`, `2500`, `3000`, `4000`, `5000`, `7500`, `10000` INR.
- App Store Indonesia заменён на App Store India:
  - backend matcher: `app_store_itunes_id` -> `app_store_itunes_in`;
  - productId: `apple-idr` -> `apple-in`;
  - валюта: `IDR` -> `INR`;
  - добавлен ручной курс `INR_RUB = 0.815631`;
  - orderFlow остался `code_delivery`;
  - endpoint покупки остался `/api/v2/giftcards/order`.
- Frontend карточка обновлена:
  - название: `App Store & iTunes (Индия)`;
  - описание: `Подарочная карта App Store и iTunes для индийского аккаунта Apple. После оплаты код появится прямо здесь, в приложении.`;
  - badge: `Регион: IN`;
  - номиналы отображаются в `INR`;
  - популярные номиналы взяты только из реальных FazerCards offers.
- Локально проверено:
  - `/api/fazercards/violet-catalog` отдаёт `apple-in`, `app_store_itunes_in`, 13 offers с `cardId`, `stock`, `priceUsdt`, `priceRubApprox`;
  - Gift Card orderFlow остался `code_delivery`;
  - frontend HTML открывается через backend static server;
  - `npm run build --prefix examples/react` проходит успешно.

### Что сделано сегодня

- Исправлено получение реальных App Store / iTunes offers из FazerCards:
  - категории по-прежнему находятся через `GET /api/v2/giftcards`;
  - реальные номиналы и SKU/cardId теперь берутся через `GET /api/v2/giftcards/cards?category_id=...`;
  - endpoint применён для:
    - `app_store_itunes_tr`;
    - `app_store_itunes_us`;
    - `app_store_itunes_ru`;
    - `app_store_itunes_in`.
- App Store offers нормализуются в backend в структуру с:
  - `cardId`;
  - `nominal`;
  - `currency`;
  - `name`;
  - `rawPriceUsd`;
  - `stock`;
  - `minOrderQuantity`;
  - `maxOrderQuantity`;
  - `priceUsdt`;
  - `priceRubApprox`.
- Номиналы App Store показываются в валюте региона:
  - TR -> `TRY`;
  - US -> `USD`;
  - RU -> `RUB` / `₽`;
  - IN -> `INR`.
- Цена к оплате для App Store считается в `USDT` вручную:
  - `ANTARCTIC_USDT_RATE_RUB = 77.95`;
  - `APP_STORE_MARKUP_RATE = 0.30`;
  - курсы:
    - `TRY_RUB = 1.65822`;
    - `USD_RUB = 77.0611`;
    - `RUB_RUB = 1`;
    - `INR_RUB = 0.815631`;
  - формула:
    - `baseRub = nominal * currencyToRub`;
    - `baseUsdt = baseRub / 77.95`;
    - `priceUsdt = baseUsdt * 1.30`.
- Финальная App Store цена округляется только вверх:
  - `< 1 USDT` -> вверх до ближайших `0.10 USDT`, минимум `0.50 USDT`;
  - `1 <= priceUsdt < 10` -> вверх до ближайших `0.10 USDT`;
  - `>= 10 USDT` -> вверх до целого `USDT`;
  - `priceRubApprox` пересчитывается от уже округлённого `priceUsdt`.
- Пример проверенного расчёта:
  - `100 USD` -> `129 USDT`;
  - примерная цена в рублях считается от `129 * 77.95`.
- Русифицированы видимые тексты карточек и интерфейса каталога:
  - убраны английские описания FazerCards вроде `Region`, `Storeable`, `gift cards`, `Codes can be safely stored`, `redeemed later`;
  - карточки используют локальные русские описания;
  - UI-тексты переведены: выбор номинала, раскрытие номиналов, статус наличия, итог, получение и т.д.
- Для App Store в UI:
  - карточки показывают `от ...` в валюте региона;
  - рядом показывается количество вариантов;
  - сначала отображаются популярные номиналы;
  - полный список раскрывается кнопкой `Показать все номиналы`;
  - выбранный offer хранит `cardId`, `nominal`, `currency`, `priceUsdt`, `priceRubApprox`.
- Удалено универсальное e-mail / recipient поле для Gift Cards:
  - Gift Cards больше не требуют e-mail;
  - для Gift Cards показывается блок `Как вы получите код`;
  - текст: код появится прямо на экране заказа после оплаты;
  - fake-код в preview не генерируется.
- Добавлены orderFlow формы:
  - `code_delivery`;
  - `steam_balance`;
  - `telegram_stars`;
  - `telegram_premium`;
  - `game_balance`.
- Backend `/api/fazercards/violet-catalog` теперь отдаёт для товаров:
  - `orderFlow`;
  - `orderEndpoint`;
  - `requiredFields`.
- Текущее соответствие orderFlow:
  - `giftcards` -> `/api/v2/giftcards/order` -> `code_delivery` -> без полей формы;
  - `steam-top-up` -> `/api/v2/steam-topup/order` -> `steam_balance` -> `steamLogin`;
  - `telegram_stars` -> `/api/v2/telegram/stars/buy` -> `telegram_stars` -> `telegramUsername`;
  - `telegram_premium` -> `/api/v2/telegram/premium/buy` -> `telegram_premium` -> `telegramUsername`;
  - `topups` -> `/api/v2/topups/order` -> `game_balance` -> `playerId`.
- Frontend строит форму по `product.orderFlow` / `meta.orderFlow`:
  - Gift Cards: только информационный блок получения кода;
  - Steam: поле `Steam логин`;
  - Telegram Stars/Premium: поле `Username Telegram`;
  - игровые пополнения: поле `ID игрока / UID`;
  - кнопка `Продолжить` заблокирована, если обязательное поле не заполнено.
- Preview заказа показывает:
  - товар;
  - номинал / вариант;
  - сумму к оплате;
  - способ получения;
  - введённые данные аккаунта, если они нужны.
- Добавлен favicon для локального/production frontend, чтобы убрать 404 на `/favicon.ico`.

### Текущий статус

- Сейчас реализована витрина и preview заказа.
- Реальный checkout/payment ещё не реализован.
- Реальный FazerCards order ещё не реализован.
- Backend пока не вызывает:
  - `POST /api/v2/giftcards/order`;
  - `POST /api/v2/topups/order`;
  - `POST /api/v2/telegram/stars/buy`;
  - `POST /api/v2/telegram/premium/buy`;
  - `POST /api/v2/steam-topup/order`;
  - `POST /api/v2/gamekeys/order`.
- Купленные коды/ключи пока не сохраняются и не показываются, потому что реальная покупка ещё не подключена.
- Логика Antarctic Wallet SDK, wallet init, auth, scopes, appId, env и moderation-параметры в рамках этих изменений не менялись.

### Локальная проверка

- `GET /api/fazercards/violet-catalog` локально вернул реальные App Store offers с `cardId`, `nominal`, `currency`, `priceUsdt`, `priceRubApprox`.
- Проверенный UI URL:
  - `http://localhost:5175/?appId=local-browser-check`
- Browser/headless проверка:
  - Gift Cards без e-mail поля;
  - есть блок `Как вы получите код`;
  - Steam/Telegram/игры блокируют `Продолжить`, пока обязательное поле пустое;
  - browser console и network без ошибок приложения.
- `npm run build` проходил успешно локально.

---

## Audit Report 2026-06-21

### Результаты read-only аудита интеграции Antarctic Wallet SDK

- AWSDK создаётся корректно: один экземпляр за жизненный цикл компонента, cleanup на unmount через `sdk.destroy()`.
- Scope `user.profile.read` используется корректно: соответствует актуальному SDK-идентификатору `AWScopes.USER_PROFILE_READ`.
- APP ID приходит из Railway env `AW_APP_ID` через backend-эндпоинт `/config.json`, hardcode отсутствует.
- Double init отсутствует: в production-сборке React StrictMode не дублирует эффекты; deps `[addLog, appId]` стабильны.
- Старые appId (`dev`, `antarctic-violet`) в source и bundle не найдены.
- Старые scopes (`accounts.read`, `accounts.balances.read`) в source и bundle не найдены.
- Frontend корректно читает `/config.json` по абсолютному пути; backend инжектирует `AW_APP_ID` в ответ.
- Сравнение с официальными примерами (Angular, Vue) не выявило ошибок; React-реализация корректнее оригиналов (абсолютный fetch, env-override вместо хардкода).
- **Баг в коде не найден.**
- **Наиболее вероятная причина ошибки 422** находится на стороне Antarctic Wallet backend или настройках APP ID: SDK делает `postMessage` → wallet shell выполняет `POST /api/v2/sdk/scopes` → backend возвращает 422. Наш код к этому HTTP-вызову прямого отношения не имеет.

### Вопросы для поддержки Antarctic

1. Включён ли scope `user.profile.read` для нашего APP ID? Какие scopes доступны?
2. Добавлен ли origin `https://example-app-production-e00d.up.railway.app` в whitelist для нашего APP ID?
3. Требуется ли статус "approved" / "active" для приложения до того, как SDK session заработает?
4. Что содержит тело 422-ответа — есть ли error code или message?
5. Нужно ли отдельно регистрировать scopes через developer portal?

---

## Итоги сессии 2026-06-20

### Что сделали

- Добавлен тестовый production-путь:
  - https://example-app-production-e00d.up.railway.app/antarctic-violet
- Путь `/antarctic-violet` отдаёт ту же React-витрину Antarctic Violet, что и корневой URL.
- `/antarctic-violet/` канонически редиректит на `/antarctic-violet`, чтобы Vite assets с `base: './'` не запрашивались из вложенного пути.
- Frontend теперь читает config через `/config.json`, а не `./config.json`, чтобы конфиг стабильно открывался с тестового route.
- Commit: `a98aac3` (`Add Antarctic Violet test route`).
- Push в `origin/master` выполнен.
- Railway автодеплой применился после задержки; ручной Railway CLI был недоступен из-за протухшего OAuth token (`railway login` требуется только для CLI-операций).

### Что проверено на production

- `GET /antarctic-violet` -> HTTP 200, `text/html; charset=UTF-8`.
- `GET /config.json` -> HTTP 200:
  - `requiredScopes` = `["user.profile.read"]`;
  - `diagnostics.awAppIdPresent` = `true`;
  - `diagnostics.appIdSource` = `"env"`.
- `GET /health` -> HTTP 200, `{"ok":true}`.
- `GET /api/fazercards/violet-catalog` -> HTTP 200:
  - `ok` = `true`;
  - `matchedIds` содержит 12 товаров:
    - `apple-tr`;
    - `apple-us`;
    - `apple-ru`;
    - `apple-idr`;
    - `roblox-gift-card`;
    - `playstation-gift-card`;
    - `xbox-gift-card`;
    - `steam-top-up`;
    - `pubg`;
    - `free-fire`;
    - `telegram-stars`;
    - `telegram-premium`.

### Локальная проверка перед deploy

- `npm run build` прошёл успешно.
- Локальный production-сервер на `STATIC_DIR=examples/react/dist` проверен:
  - `/antarctic-violet` -> HTTP 200;
  - `/antarctic-violet/` -> HTTP 301 на `/antarctic-violet`;
  - `/config.json` -> HTTP 200;
  - `/health` -> HTTP 200.

## Итоги сессии 2026-06-19

### Что сделали сегодня

- Подняли публичную витрину Antarctic Violet на Railway.
- App URL: https://example-app-production-e00d.up.railway.app/
- App Icon URL: https://example-app-production-e00d.up.railway.app/app-icon.svg
- Убрали старый query `?appId=dev` из App URL в Antarctic Wallet Dev Mode.
- Добавили публичную SVG-иконку приложения.
- FazerCards API подключён к backend.
- Каталог FazerCards `/api/fazercards/violet-catalog` отдаёт HTTP 200.
- Витрина открывается внутри Antarctic Wallet.
- В Railway добавлены переменные `AW_APP_ID`, `AW_API_KEY`, `AW_API_SECRET`.
- Реальный `AW_APP_ID` начал использоваться вместо старых `dev` / `antarctic-violet`.
- Старые appId и старые scopes из deployed bundle убраны.
- `requiredScopes` временно сокращены до одного scope: `user.profile.read`.

### Что проверено

- `/` отдаёт HTTP 200 и открывает React-витрину.
- `/health` отдаёт HTTP 200.
- `/config.json` публично отдаёт:
  - `id` = значение `AW_APP_ID`;
  - `requiredScopes` = `["user.profile.read"]`;
  - `diagnostics.awAppIdPresent` = `true`;
  - `diagnostics.appIdSource` = `"env"`.
- Deployed bundle не содержит:
  - `appId=dev`;
  - `antarctic-violet`;
  - `accounts.read`;
  - `accounts.balances.read`.
- `AWSDK.init()` вызывается один раз за production-загрузку.
- Повторного цикла `sdk.init()` нет.
- React StrictMode не должен давать double-effect в production.
- Был проверен официальный Antarctic example-app: он тоже передаёт `scopes: [...cfg.requiredScopes]` в `new AWSDK(...)`, то есть текущая схема `config.json -> requiredScopes -> AWSDK` корректная.
- Добавлялся тестовый helper для очистки SDK/localStorage/sessionStorage cache и отключался/проверялся `persistSession`, но ошибка не изменилась.

### Текущий блокер

Текущая ошибка внутри Antarctic Wallet:

```text
POST https://app.antarcticwallet.com/api/v2/sdk/scopes -> HTTP 422
```

Диагностика на экране приложения показывает:

- `appId` = реальный `AW_APP_ID`;
- `AW_APP_ID` = found;
- `source` = env;
- `origin` = `https://example-app-production-e00d.up.railway.app`;
- `parent` = `https://app.antarcticwallet.com`;
- `scopes` = `user.profile.read`.

Ранее были промежуточные ошибки:

- 404 на `/api/v2/sdk/session`, когда использовался неправильный appId (`dev` / `antarctic-violet`);
- 429 на `/api/v2/sdk/session`, вероятно после большого количества тестовых попыток;
- после паузы и исправления appId остался стабильный 422 на `/api/v2/sdk/scopes`.

### Текущий вывод

Наиболее вероятная причина блокера: Antarctic Wallet backend не разрешает scope `user.profile.read` для текущего SDK APP ID, либо этот scope/appId/origin ещё не активирован на стороне Antarctic Wallet.

Оценка вероятностей:

- 50% — scope не включён/не разрешён для текущего APP ID;
- 25% — APP ID привязан к старому/другому origin или не обновился в backend Antarctic;
- 15% — Antarctic backend ожидает другой scope identifier;
- 10% — залипшая/битая session/consent после сегодняшних тестов, хотя cache-cleaning уже не помог.

### Поддержка Antarctic

В Telegram-поддержку Antarctic уже отправлено сообщение с описанием проблемы. Поддержка ответила, что передала вопрос техническим специалистам / товарищам, и они свяжутся или дадут ответ.

В поддержку передано:

- APP ID;
- App URL;
- ошибка `/api/v2/sdk/scopes -> 422`;
- scope `user.profile.read`;
- информация, что `config.json` и bundle проверены.

### Что НЕ надо завтра делать первым делом

- Не менять FazerCards.
- Не менять товары, цены и каталог.
- Не делать случайные redeploy без причины.
- Не возвращать `?appId=dev`.
- Не возвращать scopes `accounts.read` и `accounts.balances.read`, пока не решится `user.profile.read`.
- Не менять APP ID без ответа поддержки.

### Что делать завтра / следующий шаг

Сначала прочитать этот файл.

Потом:

1. Проверить, ответила ли поддержка Antarctic.
2. Если поддержка активировала scopes или дала инструкцию — применить её.
3. Если поддержки нет — один раз открыть Antarctic Wallet -> Antarctic Violet и проверить, остался ли 422.
4. Если 422 остался — подготовить повторное сообщение поддержке: "После очистки cache, корректного config.json и минимального scope user.profile.read ошибка /api/v2/sdk/scopes 422 сохраняется."
5. После успешной SDK session:
   - вернуть нужные scopes по одному;
   - проверить доступ к профилю;
   - потом переходить к payment/intents;
   - проверить `AW_API_BASE`, потому что сейчас `/api/intents` отвечает `MISSING_CREDENTIALS` и требует `AW_API_BASE` + `AW_API_KEY` + `AW_API_SECRET`.

### Важная заметка

`AW_API_KEY` и `AW_API_SECRET` сейчас не участвуют в SDK session.

Они понадобятся дальше для backend server-to-server flow:

- `/api/intents`;
- HMAC подпись;
- payments/transfers;
- подтверждение операций.

Сейчас основной блокер — именно SDK session/scopes внутри Antarctic Wallet.

---

## Railway

- **Project:** diligent-vibrancy
- **Service:** example-app
- **GitHub:** подключён
- **Автодеплой:** работает
- **Последний deployment:** SUCCESS
- **Deployment ID:** f2c3fa36-0afd-404c-8dd6-e39ae5778b15

---

## FazerCards

- Подключён через Railway backend
- Переменные окружения:
  - `FAZERCARDS_API_BASE`
  - `FAZERCARDS_API_KEY`

---

## Backend Endpoints

- `GET /api/fazercards/giftcards`
- `GET /api/fazercards/violet-catalog`

---

## Текущая витрина

### Apple
- Apple TR
- Apple US
- Apple RU
- Apple India
- Roblox Gift Card
- PlayStation Gift Card
- Xbox Gift Card

### Steam
- Steam Wallet

### Games
- PUBG Mobile
- Free Fire

### Telegram
- Telegram Stars
- Telegram Premium

---

## Удалённые товары

- Roblox Top-Up
- Minecraft

---

## NEXT STEPS

1. Проверка реальных `offer_id` и номиналов через FazerCards API.
2. Сопоставление всех номиналов витрины с реальными офферами.
3. Тестовый заказ без оплаты.
4. Подключение оплаты.
5. Подготовка к модерации Antarctic Apps.

---

## 2026-06-25 — русификация UI и подготовка к модерации

### Что изменено
- Пользовательский интерфейс React-приложения полностью переведён на русский язык.
- Видимое название приложения в UI заменено на `Маркет цифровых товаров`.
- Обновлены пользовательские подписи категорий, товаров, кнопок, статусов, ошибок, placeholder и checkout-блока.
- HTML-документ React-примера получил `lang="ru"` и русский `<title>`.
- Проверено, что новая `icon.svg` попадает в production build.

### Что осталось без изменений
- SDK Antarctic Wallet не изменялся.
- Express backend не изменялся.
- Railway, `nixpacks.toml`, маршруты и deployment-настройки не изменялись.
- `config.json`, `appId`, scopes и env-переменные не изменялись.
- Endpoint, headers, запросы, ответы и структура FazerCards API не изменялись.
- Product IDs, внутренние идентификаторы, номиналы и данные, приходящие из FazerCards, не преобразуются.

### Что проверено
- `npm run build --prefix examples/react` проходит успешно.
- TypeScript/React build ошибок не показывает.
- `examples/react/dist/icon.svg` совпадает с `examples/react/public/icon.svg`.
- Diff запрещённых зон (`config.json`, SDK/package files, backend, Railway/nixpacks) отсутствует.

### Совместимость
- FazerCards API полностью совместим: русификация затрагивает только пользовательский UI вокруг данных.
- SDK Antarctic Wallet не изменялся.

---

## Финальная проверка перед модерацией

### Что проверено
- Локальный production build запущен через Express backend с `STATIC_DIR=examples/react/dist`.
- Маршруты `/`, `/antarctic-violet`, `/config.json`, `/icon.svg` локально отвечают HTTP 200.
- UI проверен визуально через Playwright screenshots на desktop и mobile.
- Новая иконка открывается по `/icon.svg` и `examples/react/dist/icon.svg` совпадает с `examples/react/public/icon.svg`.
- В UI отображается название `Маркет цифровых товаров`.
- Русифицированы пользовательские подписи, кнопки, статусы, placeholder, уведомления и ошибки.
- Каталог FazerCards загружается: endpoint вернул `ok: true`, 12 items и ожидаемые `matchedIds`.
- Карточки товаров, выбор номинала и checkout-блок отображаются корректно.
- `npm run build` проходит успешно без ошибок TypeScript/React.
- Проверен diff запрещённых зон: `config.json`, package files, backend, Railway/nixpacks без изменений.

### Что исправлено
- Исправлены оставшиеся англоязычные диагностические подписи `App ID`/`Origin` в пользовательском интерфейсе.
- Других исправлений не потребовалось.

### Готовность
- Приложение готово к деплою.
- SDK Antarctic Wallet не изменялся.
- Совместимость с FazerCards полностью сохранена: API, endpoint, headers, JSON-структура, product IDs, номиналы и данные поставщика не менялись.
- Приложение готово к отправке на модерацию Antarctic Wallet.

---

## Production Deployment перед отправкой на модерацию

### Deployment
- Commit hash: `4390569`
- GitHub Push выполнен: `master -> origin/master`
- Railway Deploy выполнен: deployment ID `91734aca-242b-47e4-9b7d-1d0ca3b5af3d`
- Production URL: `https://example-app-production-e00d.up.railway.app`

### Production проверен
- `/` отвечает HTTP 200.
- `/config.json` отвечает HTTP 200 и сохраняет `icon: "./icon.svg"`, `requiredScopes: ["user.profile.read"]`.
- `/icon.svg` отвечает HTTP 200 и отдаёт новую иконку.
- `/api/fazercards/violet-catalog` отвечает HTTP 200, `ok: true`, 12 items и ожидаемые `matchedIds`.
- HTML production содержит `lang="ru"` и title `Маркет цифровых товаров`.
- Playwright screenshots production desktop/mobile подтверждают отображение русифицированного UI, нового названия и загруженного каталога.
- Railway build прошёл успешно без ошибок сборки.

### Итог
- SDK Antarctic Wallet не изменялся.
- FazerCards API и совместимость полностью сохранены.
- Приложение готово к отправке на модерацию Antarctic Wallet.
- 2026-06-28: скрыты внутренний курс Antarctic и наценка из блока «Итого к оплате».
