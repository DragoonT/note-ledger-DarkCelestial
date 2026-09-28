UPDATE bank_detail_templates
SET field_types = field_types || jsonb_build_object('Expiration date', 'month')
WHERE fields @> ARRAY['Expiration date']::text[]
  AND COALESCE(field_types->>'Expiration date', 'date') = 'date';
