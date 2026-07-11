-- Enable btree_gist extension if it doesn't exist
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Ensure room_types has a unique constraint on (id, hotel_id) for foreign key matching
ALTER TABLE public.room_types ADD CONSTRAINT room_types_id_hotel_id_key UNIQUE (id, hotel_id);

-- ============================================================================
-- Seasonal Rates
-- ============================================================================
CREATE TABLE public.seasonal_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_start_end_date CHECK (start_date <= end_date),
  CONSTRAINT no_overlapping_seasons EXCLUDE USING gist (
    hotel_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ),
  CONSTRAINT seasonal_rates_id_hotel_id_key UNIQUE (id, hotel_id)
);

-- ============================================================================
-- Seasonal Rate Overrides
-- ============================================================================
CREATE TABLE public.seasonal_rate_overrides (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  hotel_id uuid NOT NULL,
  seasonal_rate_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  base_price numeric(10,2) NOT NULL CONSTRAINT check_seasonal_base_price CHECK (base_price > 0),
  weekend_price numeric(10,2) CONSTRAINT check_seasonal_weekend_price CHECK (weekend_price IS NULL OR weekend_price > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_seasonal_rate_room_type UNIQUE (seasonal_rate_id, room_type_id),
  CONSTRAINT seasonal_rate_overrides_seasonal_rate_fk FOREIGN KEY (seasonal_rate_id, hotel_id) REFERENCES public.seasonal_rates(id, hotel_id) ON DELETE CASCADE,
  CONSTRAINT seasonal_rate_overrides_room_type_fk FOREIGN KEY (room_type_id, hotel_id) REFERENCES public.room_types(id, hotel_id) ON DELETE CASCADE
);

-- ============================================================================
-- Daily Rate Overrides
-- ============================================================================
CREATE TABLE public.daily_rate_overrides (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  date date NOT NULL,
  price numeric(10,2) NOT NULL CONSTRAINT check_daily_price CHECK (price > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_room_type_date UNIQUE (room_type_id, date),
  CONSTRAINT daily_rate_overrides_room_type_fk FOREIGN KEY (room_type_id, hotel_id) REFERENCES public.room_types(id, hotel_id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_seasonal_rates_hotel_id ON public.seasonal_rates(hotel_id);
CREATE INDEX idx_seasonal_rates_dates ON public.seasonal_rates(start_date, end_date);
CREATE INDEX idx_seasonal_rate_overrides_hotel_id ON public.seasonal_rate_overrides(hotel_id);
CREATE INDEX idx_seasonal_rate_overrides_seasonal_rate_id ON public.seasonal_rate_overrides(seasonal_rate_id);
CREATE INDEX idx_seasonal_rate_overrides_room_type_id ON public.seasonal_rate_overrides(room_type_id);
CREATE INDEX idx_daily_rate_overrides_hotel_id ON public.daily_rate_overrides(hotel_id);
CREATE INDEX idx_daily_rate_overrides_room_type_id ON public.daily_rate_overrides(room_type_id);
CREATE INDEX idx_daily_rate_overrides_date ON public.daily_rate_overrides(date);
CREATE INDEX idx_daily_rate_overrides_lookup ON public.daily_rate_overrides(room_type_id, date);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================
CREATE TRIGGER handle_seasonal_rates_updated_at
  BEFORE UPDATE ON public.seasonal_rates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_seasonal_rate_overrides_updated_at
  BEFORE UPDATE ON public.seasonal_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_daily_rate_overrides_updated_at
  BEFORE UPDATE ON public.daily_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE public.seasonal_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_rate_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_rate_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY seasonal_rates_org_isolation ON public.seasonal_rates FOR ALL
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

CREATE POLICY seasonal_rate_overrides_org_isolation ON public.seasonal_rate_overrides FOR ALL
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

CREATE POLICY daily_rate_overrides_org_isolation ON public.daily_rate_overrides FOR ALL
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));
