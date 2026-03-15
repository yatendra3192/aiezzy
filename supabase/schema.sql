-- ═══════════════════════════════════════════════════════════════════════════════
-- AIEzzy Database Schema for Supabase
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  avatar_url    TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── TRIPS ────────────────────────────────────────────────────────────────────
CREATE TABLE public.trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT,
  from_city       JSONB NOT NULL,
  from_address    TEXT NOT NULL,
  departure_date  DATE NOT NULL,
  adults          SMALLINT NOT NULL DEFAULT 1 CHECK (adults >= 1),
  children        SMALLINT NOT NULL DEFAULT 0 CHECK (children >= 0),
  infants         SMALLINT NOT NULL DEFAULT 0 CHECK (infants >= 0),
  trip_type       TEXT NOT NULL DEFAULT 'roundTrip' CHECK (trip_type IN ('roundTrip', 'oneWay')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_user_id ON public.trips(user_id);
CREATE INDEX idx_trips_user_status ON public.trips(user_id, status);

-- ─── TRIP DESTINATIONS ────────────────────────────────────────────────────────
CREATE TABLE public.trip_destinations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  position        SMALLINT NOT NULL,
  city            JSONB NOT NULL,
  nights          SMALLINT NOT NULL DEFAULT 2 CHECK (nights >= 0),
  selected_hotel  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_dest_trip ON public.trip_destinations(trip_id);
CREATE UNIQUE INDEX idx_trip_dest_pos ON public.trip_destinations(trip_id, position);

-- ─── TRIP TRANSPORT LEGS ──────────────────────────────────────────────────────
CREATE TABLE public.trip_transport_legs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  position         SMALLINT NOT NULL,
  transport_type   TEXT NOT NULL DEFAULT 'drive' CHECK (transport_type IN ('flight', 'train', 'bus', 'drive')),
  duration         TEXT,
  distance         TEXT,
  departure_time   TEXT,
  arrival_time     TEXT,
  selected_flight  JSONB,
  selected_train   JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_legs_trip ON public.trip_transport_legs(trip_id);
CREATE UNIQUE INDEX idx_trip_legs_pos ON public.trip_transport_legs(trip_id, position);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_transport_legs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trips
CREATE POLICY "Users can view own trips" ON public.trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON public.trips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trips" ON public.trips FOR DELETE USING (auth.uid() = user_id);

-- Destinations (via trip ownership)
CREATE POLICY "Users can manage own trip destinations" ON public.trip_destinations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_destinations.trip_id AND trips.user_id = auth.uid()));

-- Transport legs (via trip ownership)
CREATE POLICY "Users can manage own trip transport legs" ON public.trip_transport_legs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_transport_legs.trip_id AND trips.user_id = auth.uid()));

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
