ALTER TABLE bank_account_protected_details ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE bank_account_protected_details DROP CONSTRAINT bank_account_protected_details_pkey;
ALTER TABLE bank_account_protected_details ADD PRIMARY KEY (id);
