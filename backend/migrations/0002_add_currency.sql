ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD'
CHECK (currency ~ '^[A-Z]{3}$');
