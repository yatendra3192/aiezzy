-- Atomic Trip Functions for AIEzzy
-- Run this in Supabase Dashboard > SQL Editor
-- These functions wrap trip create/update in real PostgreSQL transactions
-- so a failed INSERT after a DELETE doesn't leave orphaned data.

-- ============================================================================
-- 1. UPDATE TRIP (atomic: metadata + destinations + transport legs)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_trip_atomic(
  p_trip_id UUID,
  p_user_id UUID,
  p_title TEXT,
  p_from_city JSONB,
  p_from_address TEXT,
  p_departure_date DATE,
  p_adults SMALLINT,
  p_children SMALLINT,
  p_infants SMALLINT,
  p_trip_type TEXT,
  p_deep_plan_data JSONB DEFAULT NULL,
  p_booking_docs JSONB DEFAULT NULL,
  p_destinations JSONB DEFAULT '[]'::JSONB,
  p_legs JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_dest JSONB;
  v_leg JSONB;
BEGIN
  -- 1. Verify trip ownership (RLS also enforces this, but belt-and-suspenders)
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'TRIP_NOT_FOUND';
  END IF;

  -- 2. Update trip metadata
  UPDATE public.trips SET
    title = p_title,
    from_city = p_from_city,
    from_address = p_from_address,
    departure_date = p_departure_date,
    adults = p_adults,
    children = p_children,
    infants = p_infants,
    trip_type = p_trip_type,
    deep_plan_data = COALESCE(p_deep_plan_data, deep_plan_data),
    booking_docs = COALESCE(p_booking_docs, booking_docs),
    updated_at = now()
  WHERE id = p_trip_id AND user_id = p_user_id;

  -- 3. Replace destinations atomically
  DELETE FROM public.trip_destinations WHERE trip_id = p_trip_id;
  FOR v_dest IN SELECT * FROM jsonb_array_elements(p_destinations)
  LOOP
    INSERT INTO public.trip_destinations (trip_id, position, city, nights, selected_hotel)
    VALUES (
      p_trip_id,
      (v_dest->>'position')::SMALLINT,
      v_dest->'city',
      (v_dest->>'nights')::SMALLINT,
      v_dest->'selected_hotel'
    );
  END LOOP;

  -- 4. Replace transport legs atomically
  DELETE FROM public.trip_transport_legs WHERE trip_id = p_trip_id;
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    INSERT INTO public.trip_transport_legs (trip_id, position, transport_type, duration, distance, departure_time, arrival_time, selected_flight, selected_train)
    VALUES (
      p_trip_id,
      (v_leg->>'position')::SMALLINT,
      COALESCE(v_leg->>'transport_type', 'drive'),
      v_leg->>'duration',
      v_leg->>'distance',
      v_leg->>'departure_time',
      v_leg->>'arrival_time',
      CASE WHEN v_leg->'selected_flight' = 'null'::JSONB THEN NULL ELSE v_leg->'selected_flight' END,
      CASE WHEN v_leg->'selected_train' = 'null'::JSONB THEN NULL ELSE v_leg->'selected_train' END
    );
  END LOOP;

  -- If we get here, all 4 steps succeeded — Postgres commits the entire transaction
  RETURN jsonb_build_object('id', p_trip_id, 'updated', true);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;


-- ============================================================================
-- 2. CREATE TRIP (atomic: trip row + destinations + transport legs)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_trip_atomic(
  p_user_id UUID,
  p_title TEXT,
  p_from_city JSONB,
  p_from_address TEXT,
  p_departure_date DATE,
  p_adults SMALLINT,
  p_children SMALLINT,
  p_infants SMALLINT,
  p_trip_type TEXT,
  p_deep_plan_data JSONB DEFAULT NULL,
  p_booking_docs JSONB DEFAULT NULL,
  p_destinations JSONB DEFAULT '[]'::JSONB,
  p_legs JSONB DEFAULT '[]'::JSONB
) RETURNS UUID AS $$
DECLARE
  v_trip_id UUID;
  v_dest JSONB;
  v_leg JSONB;
BEGIN
  -- 1. Create the trip row
  INSERT INTO public.trips (user_id, title, from_city, from_address, departure_date, adults, children, infants, trip_type, status, deep_plan_data, booking_docs)
  VALUES (p_user_id, p_title, p_from_city, p_from_address, p_departure_date, p_adults, p_children, p_infants, p_trip_type, 'draft', p_deep_plan_data, p_booking_docs)
  RETURNING id INTO v_trip_id;

  -- 2. Insert destinations
  FOR v_dest IN SELECT * FROM jsonb_array_elements(p_destinations)
  LOOP
    INSERT INTO public.trip_destinations (trip_id, position, city, nights, selected_hotel)
    VALUES (
      v_trip_id,
      (v_dest->>'position')::SMALLINT,
      v_dest->'city',
      (v_dest->>'nights')::SMALLINT,
      v_dest->'selected_hotel'
    );
  END LOOP;

  -- 3. Insert transport legs
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    INSERT INTO public.trip_transport_legs (trip_id, position, transport_type, duration, distance, departure_time, arrival_time, selected_flight, selected_train)
    VALUES (
      v_trip_id,
      (v_leg->>'position')::SMALLINT,
      COALESCE(v_leg->>'transport_type', 'drive'),
      v_leg->>'duration',
      v_leg->>'distance',
      v_leg->>'departure_time',
      v_leg->>'arrival_time',
      CASE WHEN v_leg->'selected_flight' = 'null'::JSONB THEN NULL ELSE v_leg->'selected_flight' END,
      CASE WHEN v_leg->'selected_train' = 'null'::JSONB THEN NULL ELSE v_leg->'selected_train' END
    );
  END LOOP;

  RETURN v_trip_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
