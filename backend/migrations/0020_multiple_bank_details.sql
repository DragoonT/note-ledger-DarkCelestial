ALTER TABLE bank_account_protected_details DROP CONSTRAINT bank_account_protected_details_pkey;
ALTER TABLE bank_account_protected_details ADD PRIMARY KEY (account_id, template_id);
