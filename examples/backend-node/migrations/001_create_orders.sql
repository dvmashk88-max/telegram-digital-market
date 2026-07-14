CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  alfa_order_id text UNIQUE,
  max_user_id text,
  category_id text NOT NULL,
  card_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  payment_status text NOT NULL CHECK (
    payment_status IN ('created', 'registered', 'pending', 'paid', 'failed', 'cancelled')
  ),
  supplier_status text NOT NULL CHECK (
    supplier_status IN ('not_started', 'ordering', 'ordered', 'delivered', 'failed')
  ),
  supplier_order_id text UNIQUE,
  supplier_payload jsonb,
  digital_code text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_max_user_id_idx ON orders (max_user_id);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_supplier_status_idx ON orders (supplier_status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);
