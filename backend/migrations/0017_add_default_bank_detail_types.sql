INSERT INTO bank_detail_templates (id, name, fields) VALUES
  ('9d50c16e-f911-4d93-884f-2c6d3dca1002', 'Visa card', ARRAY['Cardholder name', 'Card number', 'Expiration date', 'CVC']),
  ('9d50c16e-f911-4d93-884f-2c6d3dca1003', 'Bank account', ARRAY['Account holder name', 'Bank name', 'Account number', 'Branch', 'SWIFT / BIC']),
  ('9d50c16e-f911-4d93-884f-2c6d3dca1004', 'PromptPay', ARRAY['Account name', 'PromptPay ID', 'Phone number', 'Bank name']),
  ('9d50c16e-f911-4d93-884f-2c6d3dca1005', 'Membership', ARRAY['Member name', 'Membership number', 'Issue date', 'Expiration date']),
  ('9d50c16e-f911-4d93-884f-2c6d3dca1006', 'Digital wallet', ARRAY['Account name', 'Provider', 'Wallet ID', 'Registered phone or email'])
ON CONFLICT (name) DO NOTHING;
