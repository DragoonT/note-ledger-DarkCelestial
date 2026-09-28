CREATE TABLE IF NOT EXISTS bank_detail_templates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  fields TEXT[] NOT NULL CHECK (cardinality(fields) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO bank_detail_templates (id,name,fields) VALUES
('9d50c16e-f911-4d93-884f-2c6d3dca1001','Mastercard',ARRAY['Cardholder name','Card number','Expiration date','CVC'])
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS bank_account_protected_details (
  account_id UUID PRIMARY KEY REFERENCES bank_accounts(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES bank_detail_templates(id),
  salt BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  ciphertext BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
