ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS account_number VARCHAR(64);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS transfer_id UUID,
ADD COLUMN IF NOT EXISTS counterparty_account_id UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS transactions_transfer_id_idx
ON transactions(transfer_id)
WHERE transfer_id IS NOT NULL;
