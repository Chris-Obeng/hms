-- Tax / VAT settings are stored in hotels.settings JSONB as:
--   { "tax_enabled": bool, "tax_percentage": number, ...existing }
-- No schema change is needed for the settings column (already JSONB).
-- We add a safety constraint to ensure tax_amount is never negative.

ALTER TABLE bookings
  ADD CONSTRAINT bookings_tax_amount_non_negative CHECK (tax_amount >= 0);
