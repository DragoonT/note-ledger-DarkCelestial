CREATE TABLE IF NOT EXISTS transaction_options (
    id UUID PRIMARY KEY,
    option_type VARCHAR(20) NOT NULL CHECK (option_type IN ('income_category', 'expense_category', 'payment_channel')),
    value VARCHAR(60) NOT NULL CHECK (char_length(trim(value)) BETWEEN 1 AND 60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(option_type, value)
);

INSERT INTO transaction_options (id, option_type, value) VALUES
    ('10000000-0000-0000-0000-000000000001', 'income_category', 'Salary'),
    ('10000000-0000-0000-0000-000000000002', 'income_category', 'Freelance'),
    ('10000000-0000-0000-0000-000000000003', 'income_category', 'Gift'),
    ('10000000-0000-0000-0000-000000000004', 'income_category', 'Investment'),
    ('10000000-0000-0000-0000-000000000005', 'income_category', 'Transfer'),
    ('10000000-0000-0000-0000-000000000006', 'income_category', 'Other'),
    ('20000000-0000-0000-0000-000000000001', 'expense_category', 'Salary'),
    ('20000000-0000-0000-0000-000000000002', 'expense_category', 'Food'),
    ('20000000-0000-0000-0000-000000000003', 'expense_category', 'Housing'),
    ('20000000-0000-0000-0000-000000000004', 'expense_category', 'Transport'),
    ('20000000-0000-0000-0000-000000000005', 'expense_category', 'Shopping'),
    ('20000000-0000-0000-0000-000000000006', 'expense_category', 'Health'),
    ('20000000-0000-0000-0000-000000000007', 'expense_category', 'Education'),
    ('20000000-0000-0000-0000-000000000008', 'expense_category', 'Entertainment'),
    ('20000000-0000-0000-0000-000000000009', 'expense_category', 'Transfer'),
    ('20000000-0000-0000-0000-000000000010', 'expense_category', 'Other'),
    ('30000000-0000-0000-0000-000000000001', 'payment_channel', 'PromptPay'),
    ('30000000-0000-0000-0000-000000000002', 'payment_channel', 'Bank transfer'),
    ('30000000-0000-0000-0000-000000000003', 'payment_channel', 'Mobile banking'),
    ('30000000-0000-0000-0000-000000000004', 'payment_channel', 'Debit card'),
    ('30000000-0000-0000-0000-000000000005', 'payment_channel', 'Credit card'),
    ('30000000-0000-0000-0000-000000000006', 'payment_channel', 'Cash'),
    ('30000000-0000-0000-0000-000000000007', 'payment_channel', 'Other')
ON CONFLICT (option_type, value) DO NOTHING;
