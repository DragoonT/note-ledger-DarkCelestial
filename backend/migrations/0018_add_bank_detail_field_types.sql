ALTER TABLE bank_detail_templates
  ADD COLUMN IF NOT EXISTS field_types JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS field_options JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE bank_detail_templates
SET field_types = field_types || jsonb_build_object('Expiration date', 'date', 'Issue date', 'date')
WHERE fields && ARRAY['Expiration date', 'Issue date']::text[];
