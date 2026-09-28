ALTER TABLE transaction_options
ADD COLUMN IF NOT EXISTS optional_text_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE transaction_options
SET optional_text_enabled = true
WHERE value = 'Other';

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS category_detail VARCHAR(120),
ADD COLUMN IF NOT EXISTS payment_channel_detail VARCHAR(120);
