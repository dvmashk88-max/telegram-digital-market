ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS digital_codes jsonb;
