CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    category VARCHAR(60) NOT NULL CHECK (char_length(trim(category)) BETWEEN 1 AND 60),
    description VARCHAR(120) NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 120),
    transaction_date DATE NOT NULL,
    note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (transaction_date DESC, created_at DESC);
