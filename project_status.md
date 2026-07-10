# Project Status

Дата обновления: 2026-07-09

Проект: MAX Digital Market

Production URL: https://max-bot-production-6049.up.railway.app

MAX webhook URL: https://max-bot-production-6049.up.railway.app/api/max/webhook

## Краткий статус

Проект приведён к рабочему MVP.

На текущий момент работают:

- Railway production окружение.
- GitHub репозиторий и синхронизация с Railway.
- Node.js backend.
- React frontend.
- MAX mini app.
- FazerCards integration.
- Каталог товаров.
- Реальные цены в каталоге.
- MAX Bot.
- MAX webhook.
- Ответ бота на `/start`.
- Ответ бота на `Привет`.
- Приветственное сообщение бота.
- Кнопка `🛍 Открыть магазин`.
- Открытие мини-приложения из кнопки бота.

Покупка и оплата пока не реализованы.

## Текущий статус компонентов

Frontend: OK

Backend: OK

Railway: OK

GitHub: OK

MAX Bot: OK

Webhook: OK

Mini App: OK

FazerCards: OK

Каталог: OK

Покупка: НЕ РЕАЛИЗОВАНА

Оплата: НЕ РЕАЛИЗОВАНА

## Что сделано сегодня

### 1. Railway приведён в рабочее состояние

Railway production service `max-bot` проверен и приведён в рабочее состояние.

Backend запускается через root `package.json`.

Production start command сейчас:

```bash
NODE_EXTRA_CA_CERTS=certs/russian-trusted-ca.pem STATIC_DIR=examples/react/dist node examples/backend-node/server.mjs
```

Railway build использует:

```bash
npm run build
```

Railway start использует:

```bash
npm run start
```

Production health endpoint отвечает:

```text
GET /health
{"ok":true}
```

### 2. GitHub и Railway синхронизированы

GitHub и Railway синхронизированы через ветку `master`.

После исправлений были выполнены commit, push и production deploy.

Railway получил последние изменения из GitHub и успешно развернул приложение.

### 3. MAX Digital Market mini app работает

Мини-приложение MAX Digital Market открывается по production URL:

```text
https://max-bot-production-6049.up.railway.app
```

React frontend обслуживается backend-приложением из каталога:

```text
examples/react/dist
```

### 4. React frontend работает

React frontend собирается командой:

```bash
npm run build
```

Сборка Vite проходит успешно.

Frontend получает данные каталога через backend API.

### 5. Backend работает

Backend находится в:

```text
examples/backend-node/server.mjs
```

Основные рабочие endpoint:

- `GET /health`
- `GET /config.json`
- `GET /api/fazercards/giftcards`
- `GET /api/fazercards/violet-catalog`
- `GET /api/max/status`
- `POST /api/max/webhook`
- `GET /api/max/webhook`

Backend обслуживает production frontend и проксирует запросы к FazerCards.

### 6. FazerCards работает

FazerCards API подключён через Railway variables:

- `FAZERCARDS_API_BASE`
- `FAZERCARDS_API_KEY`

Backend читает эти переменные через:

```text
config.mjs
```

FazerCards catalog endpoint работает через backend.

### 7. Каталог отображает реальные цены

Была проверена полная цепочка цен:

```text
FazerCards API
↓
Backend response
↓
Frontend fetch
↓
React state
↓
UI render
```

Проблема отображения цен была исправлена.

Каталог теперь показывает реальные цены из FazerCards.

Формула расчёта цен не менялась сверх необходимого для корректного отображения.

### 8. Исправлена проблема production frontend со старым endpoint

Production frontend ранее обращался к старому endpoint.

Проблема была найдена и исправлена.

После исправления production frontend использует актуальный backend endpoint и получает рабочие данные каталога.

### 9. Исправлена интеграция MAX Bot

MAX Bot integration была доведена до рабочего состояния.

Основной файл:

```text
examples/backend-node/max-bot.mjs
```

Backend теперь:

- принимает webhook от MAX;
- распознаёт события MAX;
- обрабатывает `/start`;
- обрабатывает `Привет`;
- отправляет приветственное сообщение пользователю;
- отправляет кнопку открытия магазина.

### 10. Зарегистрирован webhook

Webhook зарегистрирован через MAX Bot API.

Webhook URL:

```text
https://max-bot-production-6049.up.railway.app/api/max/webhook
```

Регистрация выполняется существующим скриптом:

```bash
railway run npm run max:set-webhook
```

Скрипт использует Railway env:

- `MAX_API_BASE`
- `MAX_BOT_TOKEN`

### 11. Webhook подписан на нужные события

Webhook подписан на:

- `message_created`
- `bot_started`

Это важно для нормального первого входа пользователя:

- `bot_started` приходит, когда пользователь впервые начинает общение с ботом или возобновляет его после остановки;
- `message_created` приходит, когда пользователь отправляет сообщение боту.

### 12. Исправлена обработка webhook

Была изучена структура MAX webhook events по официальной документации MAX.

Исправлена обработка событий:

- `bot_started`
- `message_created`

Текущий поток:

```text
POST /api/max/webhook
↓
handleMaxWebhookPayload()
↓
sendStartMessageToMaxUser()
↓
sendMaxMessageToUser()
↓
callMaxApi("/messages")
```

Для `bot_started` используется `update.user.user_id`.

Для `message_created` используется message payload, текст сообщения и `message.sender.user_id`.

### 13. Исправлена отправка сообщений через MAX API

Отправка сообщения выполняется через:

```text
POST https://platform-api2.max.ru/messages?user_id={user_id}
```

Авторизация выполняется через header:

```text
Authorization: <MAX_BOT_TOKEN>
```

Токен не передаётся через query string.

Тело запроса содержит:

- `text`
- `attachments`

Кнопка магазина отправляется как `inline_keyboard`.

### 14. Исправлена TLS проблема platform-api2.max.ru

Была найдена production проблема:

```text
unable to get local issuer certificate
UNABLE_TO_GET_ISSUER_CERT_LOCALLY
```

Проблема возникала при запросах Node.js к:

```text
https://platform-api2.max.ru
```

Исправление сделано безопасным способом:

- TLS проверка не отключалась;
- `NODE_TLS_REJECT_UNAUTHORIZED=0` не использовался;
- был добавлен CA bundle;
- Node.js запускается с `NODE_EXTRA_CA_CERTS`.

Добавлен файл:

```text
certs/russian-trusted-ca.pem
```

В него добавлены:

- Russian Trusted Root CA
- Russian Trusted Sub CA

Production start теперь использует:

```bash
NODE_EXTRA_CA_CERTS=certs/russian-trusted-ca.pem
```

Это решило проблему TLS без отключения проверки сертификатов.

### 15. MAX Bot отвечает пользователю

Бот успешно отвечает на:

- `/start`
- `Привет`

Ответ содержит приветственное сообщение и кнопку открытия магазина.

### 16. Обновлено приветственное сообщение бота

Приветственное сообщение обновлено.

Текущий текст:

```text
🛒 Добро пожаловать в Маркет цифровых товаров

Здесь можно купить цифровые коды и подарочные карты:
• Apple / iTunes
• Steam
• игры и игровые пополнения
• Telegram и другие сервисы

Выберите товар в магазине, оплатите заказ и получите код прямо здесь в чате.

Нажмите кнопку ниже, чтобы открыть магазин.
```

### 17. Кнопка открытия магазина обновлена

Кнопка сейчас:

```text
🛍 Открыть магазин
```

URL кнопки:

```text
https://max-bot-production-6049.up.railway.app
```

Тип кнопки пока оставлен:

```text
link
```

Это сделано специально, чтобы не менять рабочую структуру интеграции без отдельной проверки.

По документации MAX существует также тип кнопки:

```text
open_app
```

Переход с `link` на `open_app` оставлен как отдельная будущая задача.

### 18. Проект сейчас имеет рабочий MVP

Текущий MVP включает:

- работающий production backend;
- работающий production frontend;
- рабочее MAX mini app;
- рабочий FazerCards каталог;
- реальные цены;
- рабочий MAX Bot;
- webhook на события `message_created` и `bot_started`;
- приветствие бота;
- кнопку открытия магазина.

Не входит в текущий MVP:

- создание заказа;
- оплата;
- интеграция ЮKassa;
- подтверждение оплаты;
- выдача купленного цифрового кода;
- финальный production purchase flow.

## Важные технические решения

### Webhook регистрируется через API

Webhook для MAX Bot API регистрируется не через поле в MAX Business, а через API:

```text
POST /subscriptions
```

Текущая подписка:

```json
{
  "url": "https://max-bot-production-6049.up.railway.app/api/max/webhook",
  "update_types": ["message_created", "bot_started"]
}
```

### Авто-сообщение до действия пользователя невозможно

По текущей модели MAX Bot API бот не должен отправлять первое сообщение пользователю до первого действия пользователя.

Правильный первый сценарий:

```text
Пользователь открывает бота
↓
Пользователь нажимает старт / начинает общение / пишет первое сообщение
↓
MAX отправляет bot_started или message_created
↓
Backend отправляет приветственное сообщение
↓
Пользователь нажимает "🛍 Открыть магазин"
↓
Открывается mini app
```

### Картинка или баннер возможны, но не добавлены

По документации MAX можно отправлять изображения как attachment:

```text
type: "image"
```

Можно использовать:

- загрузку через `/uploads` и `payload.token`;
- прямой внешний URL через `payload.url` для изображений.

Также вместе с изображением можно отправить `inline_keyboard`.

Баннер первого сообщения не добавлен сегодня, потому что это отдельная продуктовая и визуальная задача.

## Последние важные коммиты

- `16a7eb2 update max bot welcome message`
- `032b70d fix max api tls trust`
- `c8a594b fix max bot webhook handling`
- `1eeb67c fix fazer cards price display`
- `c9d04f3 fix max bot webhook auth`
- `a02f78e connect max bot api`
- `0f89ae0 fix railway config asset response`
- `63b0d10 cleanup remaining antarctic example artifacts`
- `54ff96c prepare max digital market for first deployment`

## Что не трогать без отдельной задачи

- FazerCards price formula.
- FazerCards API credentials.
- Railway env variables.
- MAX_BOT_TOKEN.
- MAX_API_BASE.
- TLS certificate setup.
- Webhook URL.
- Payment flow placeholder.
- Working catalog logic.
- Working frontend storefront flow.

## План на завтра

### Главная задача №1: подключить ЮKassa

Нужно изучить лучший способ интеграции ЮKassa именно для MAX Mini App.

После анализа нужно выбрать архитектуру оплаты.

Целевой полный цикл:

```text
Пользователь
↓
Выбор товара
↓
Создание заказа
↓
Оплата ЮKassa
↓
Подтверждение оплаты
↓
Запрос в FazerCards
↓
Получение цифрового кода
↓
Отправка кода пользователю в MAX Bot
↓
Заказ завершён
```

### Что нужно продумать для ЮKassa

Нужно определить:

- где создаётся заказ;
- где хранится pending order;
- как связывать MAX user_id с заказом;
- как возвращать пользователя после оплаты;
- как принимать webhook ЮKassa;
- как проверять статус платежа;
- когда делать запрос в FazerCards;
- как безопасно отправлять цифровой код пользователю;
- что делать при ошибке оплаты;
- что делать при ошибке выдачи кода;
- как не выдать код дважды;
- как логировать оплату без утечки секретов.

### Проверка полного цикла покупки

После подключения оплаты нужно проверить полный цикл на реальном товаре:

```text
Открыть mini app из MAX Bot
↓
Выбрать товар
↓
Создать заказ
↓
Оплатить через ЮKassa
↓
Получить подтверждение
↓
Получить код из FazerCards
↓
Получить код в MAX Bot
↓
Проверить, что заказ завершён
```

## После завершения оплаты

После того как оплата будет реализована и проверена, нужно заняться первым пользовательским сценарием и визуальным оформлением:

- иконкой бота;
- баннером первого сообщения;
- описанием бота;
- возможным переходом с `link` на `open_app`;
- улучшением первого пользовательского сценария;
- финальной полировкой приветственного flow;
- проверкой, как новый пользователь видит бота до первого действия.

## Текущий вывод

MAX Digital Market сейчас находится в состоянии рабочего MVP.

Можно переходить к следующему крупному блоку:

```text
ЮKassa → заказ → оплата → FazerCards purchase → выдача кода в MAX Bot
```

