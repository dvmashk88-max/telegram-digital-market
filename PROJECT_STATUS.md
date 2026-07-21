# Telegram Digital Market — статус проекта

## Текущий этап

Исходный проект был создан как MAX Digital Market. Локальная кодовая база
адаптирована под Telegram Bot API и Telegram Mini Apps. Старые проверки MAX
production являются только историей исходной версии и не подтверждают работу
нового Telegram deployment.

Адаптация завершена локально:

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
- Telegram webhook ещё не зарегистрирован;
- production deployment Telegram-версии ещё не проверен.

## Критическая защита FazerCards

Реальное создание supplier orders полностью отключено программной заглушкой.
Заглушка находится непосредственно рядом с единственным POST к supplier order
endpoint и не снимается переменной окружения. Даже значение
`ENABLE_FAZER_GIFTCARD_ORDERS=true` не разрешает покупку.

Заблокированы:

- автоматическая покупка после оплаты;
- ручной fulfillment;
- legacy supplier-order route;
- покупающие ветки background reconciler;
- прямой вызов supplier-order helper.

Разрешены только read-only операции: каталог и проверка статуса уже созданного
supplier order. Поддельные цифровые коды не создаются, и заказ не переводится в
`delivered` без настоящего ответа ранее созданного supplier order.

## Состояние PostgreSQL

Миграции создают таблицу `orders`, статусы платежа и supplier, цифровые коды и
состояние e-mail доставки. Миграция `004` добавила nullable
`telegram_user_id text` и индекс `orders_telegram_user_id_idx`. Историческая
колонка `max_user_id` сохранена исключительно для обратной совместимости схемы
и не используется новым backend-кодом.

Новый PostgreSQL полностью отделён от базы MAX Digital Market. До отдельного
решения нельзя создавать новые базы, менять `DATABASE_URL` или запускать новые
миграции.

## Сохранённая полезная история исходной версии

В исходном production были подтверждены:

- регистрация и проверка платежа через Alfa;
- автоматический fulfillment через FazerCards;
- сохранение цифрового кода в PostgreSQL;
- idempotency и защита от повторной supplier-покупки;
- доставка кода через SMTP Mail.ru;
- повторная отправка e-mail без повторной покупки товара.

Проблема SMTP-соединения Railway → Mail.ru ранее была устранена переходом
workspace на Railway Pro; после этого production-отправка работала напрямую
через `smtp.mail.ru`. Эта информация полезна для инфраструктуры, но после
Telegram deploy весь цикл необходимо проверить заново без реальных покупок до
отдельного разрешения.

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

## Следующие обязательные шаги

1. Выполнить и проверить production deployment Telegram-версии.
2. Проверить `/health`, `/api/telegram/status` и загрузку frontend.
3. При необходимости добавить необязательный `TELEGRAM_SUPPORT_URL`.
4. Отдельно подтвердить `setWebhook`.
5. После регистрации webhook проверить `/start` и открытие Mini App без платежа.
6. Сохранить жёсткую заглушку FazerCards до отдельного code review и разрешения.
