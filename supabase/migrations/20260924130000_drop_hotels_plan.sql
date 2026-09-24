-- Drop the subscription-plan column. The starter/growth/professional tiers no
-- longer exist in the product; room-count-based pricing will be designed later
-- as a separate feature. Destructive and irreversible: existing values are
-- discarded. Nothing in the app reads or writes this column anymore (all
-- references removed in the same change set). The hotels_plan_check constraint
-- drops automatically with the column.
ALTER TABLE public.hotels DROP COLUMN IF EXISTS plan;
