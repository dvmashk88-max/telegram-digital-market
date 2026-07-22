# Telegram Digital Market — статус проекта

## Текущий этап

Исходный проект был создан как MAX Digital Market. Кодовая база адаптирована
под Telegram Bot API и Telegram Mini Apps и работает в production.

Текущее production-состояние:

- добавлен Telegram webhook endpoint;
- `/start` обрабатывается только в приватном чате;
- бот отправляет кнопку Telegram `web_app`;
- frontend подключает официальный Telegram Web Apps SDK;
- Telegram Mini App `initData` проверяется на backend по HMAC и `auth_date`;
- Telegram user ID извлекается только из проверенных данных;
- подготовлена миграция `004_add_telegram_user_id.sql`;
- в Railway Project `observant-perfection` создан отдельный сервис `Postgres`;
- `DATABASE_URL` application service ссылается на этот новый сервис через
  Railway reference variable;
- миграции `001`–`004` успешно применены к новой базе;
- Telegram webhook зарегистрирован и production deployment проверен;
- Стартовое сообщение Telegram использует официальный логотип проекта.
- группа поддержки: https://t.me/+ZkPkMZrcOTM3MDIy;
- публичная ссылка Telegram-бота: https://t.me/marketcards163bot;
- ссылка для сайта с автоматическим запуском:
  https://t.me/marketcards163bot?start=shop.

## Критическая защита FazerCards

Реальные заказы FazerCards успешно включены в production через предусмотренный
флаг `ENABLE_FAZER_GIFTCARD_ORDERS`. Защитная проверка остаётся непосредственно
рядом с supplier order endpoint и не позволяет выполнять заказ при выключенном
флаге.

В production подтверждены:

- успешная реальная покупка;
- автоматическая обработка заказа после оплаты;
- получение настоящего цифрового кода;
- доставка цифрового кода покупателю по электронной почте;
- круглосуточная работа Telegram-магазина.

Поддельные цифровые коды не создаются, и заказ не переводится в `delivered` без
настоящего ответа supplier order.

## Состояние PostgreSQL

Миграции создают таблицу `orders`, статусы платежа и supplier, цифровые коды и
состояние e-mail доставки. Миграция `004` добавила nullable
`telegram_user_id text` и индекс `orders_telegram_user_id_idx`. Историческая
колонка `max_user_id` сохранена исключительно для обратной совместимости схемы
и не используется новым backend-кодом.

Новый PostgreSQL полностью отделён от базы MAX Digital Market. До отдельного
решения нельзя создавать новые базы, менять `DATABASE_URL` или запускать новые
миграции.

## Подтверждённый production-цикл

В Telegram production подтверждены:

- регистрация и проверка платежа через Alfa;
- автоматический fulfillment через FazerCards;
- сохранение цифрового кода в PostgreSQL;
- idempotency и защита от повторной supplier-покупки;
- доставка кода через SMTP Mail.ru;
- повторная отправка e-mail без повторной покупки товара.

Проблема SMTP-соединения Railway → Mail.ru ранее была устранена переходом
workspace на Railway Pro; production-отправка работает напрямую через
`smtp.mail.ru`.

## UX после оплаты

Backend завершает заказ независимо от frontend. Alfa возвращает пользователя на
`/api/payment/success`, который переносит нейтральный `orderId` на главную
страницу. Mini App также хранит последний checkout локально и при повторном
открытии один раз запрашивает безопасный статус заказа.

Внешняя страница Alfa может открыться вне Telegram WebView, поэтому устойчивый
пользовательский путь:

1. Открыть магазин кнопкой бота.
2. Создать заказ из подтверждённой Telegram Mini App-сессии.
3. Перейти на страницу Alfa.
4. После оплаты снова открыть магазин в Telegram.
5. Получить подтверждение отправки кода на e-mail.

## Эксплуатационный статус

Telegram-магазин работает в production. Каталог, оформление заказа, оплата,
FazerCards fulfillment и отправка цифрового кода покупателю остаются действующим
production-процессом. Текущая задача меняет только приветствие `/start` и не
затрагивает этот процесс.
