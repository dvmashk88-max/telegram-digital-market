ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_message_id text;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_email_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_email_status_check
  CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS orders_email_status_idx ON orders (email_status);
