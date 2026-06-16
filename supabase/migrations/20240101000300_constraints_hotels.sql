-- ============================================================================
-- hotels — CHECK + UNIQUE constraints
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.hotels
    ADD CONSTRAINT hotels_plan_check
    CHECK (plan IS NULL OR plan IN ('starter', 'growth', 'professional'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.hotels
    ADD CONSTRAINT hotels_status_check
    CHECK (status IS NULL OR status IN ('pending', 'active', 'suspended', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.hotels
    ADD CONSTRAINT hotels_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.hotels
    ADD CONSTRAINT hotels_clerk_org_id_unique UNIQUE (clerk_org_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.hotels
    ADD CONSTRAINT hotels_custom_domain_unique UNIQUE (custom_domain);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.hotels
    ADD CONSTRAINT hotels_paystack_subaccount_code_unique
    UNIQUE (paystack_subaccount_code);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Length caps (idempotent via DO + information_schema check)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hotels'
      AND column_name = 'phone' AND character_maximum_length IS NULL
  ) THEN
    ALTER TABLE public.hotels
      ALTER COLUMN phone TYPE varchar(32);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hotels'
      AND column_name = 'email' AND character_maximum_length IS NULL
  ) THEN
    ALTER TABLE public.hotels
      ALTER COLUMN email TYPE varchar(320);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hotels'
      AND column_name = 'name' AND character_maximum_length IS NULL
  ) THEN
    ALTER TABLE public.hotels
      ALTER COLUMN name TYPE varchar(255);
  END IF;
END $$;
