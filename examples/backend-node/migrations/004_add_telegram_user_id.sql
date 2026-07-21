ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS telegram_user_id text;

CREATE INDEX IF NOT EXISTS orders_telegram_user_id_idx
  ON orders (telegram_user_id);
