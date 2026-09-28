ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS card_color VARCHAR(7)
CHECK (card_color IS NULL OR card_color ~ '^#[0-9A-Fa-f]{6}$');
