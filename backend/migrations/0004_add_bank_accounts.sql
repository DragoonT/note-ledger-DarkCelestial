CREATE TABLE IF NOT EXISTS bank_accounts (id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,name VARCHAR(100) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,name));
INSERT INTO bank_accounts(id,user_id,name,currency) SELECT gen_random_uuid(),u.id,'Main Account',u.default_currency FROM users u WHERE NOT EXISTS(SELECT 1 FROM bank_accounts a WHERE a.user_id=u.id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT;
UPDATE transactions t SET account_id=(SELECT a.id FROM bank_accounts a WHERE a.user_id=t.user_id ORDER BY a.created_at LIMIT 1) WHERE account_id IS NULL;
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(account_id,transaction_date DESC);
