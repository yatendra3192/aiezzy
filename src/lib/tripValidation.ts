import { z } from 'zod';

/** Schema for validating trip create/update payloads from the client */

const citySchema = z.object({
  name: z.string().max(200).default(''),
  country: z.string().max(200).default(''),
  fullName: z.string().max(500).optional(),
  parentCity: z.string().max(200).optional(),
}).passthrough(); // Allow extra JSONB fields like lat/lng

const destinationSchema = z.object({
  city: citySchema.optional().default({ name: '', country: '' }),
  nights: z.number().int().min(0).max(365).default(2),
  selectedHotel: z.any().nullable().default(null),
  additionalHotels: z.array(z.any()).max(20).default([]),
  notes: z.string().max(5000).optional(),
  places: z.array(z.any()).max(100).default([]),
});

const transportLegSchema = z.object({
  type: z.string().max(20).default('drive'),
  duration: z.any().nullable(),
  distance: z.any().nullable(),
  departureTime: z.any().nullable(),
  arrivalTime: z.any().nullable(),
  selectedFlight: z.any().nullable().default(null),
  selectedTrain: z.any().nullable().default(null),
});

export const tripPayloadSchema = z.object({
  from: z.any().default({}),
  fromAddress: z.string().max(500).default(''),
  destinations: z.array(destinationSchema).max(50).default([]),
  transportLegs: z.array(transportLegSchema).max(51).default([]),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
  adults: z.number().int().min(1).max(20).default(1),
  children: z.number().int().min(0).max(20).default(0),
  infants: z.number().int().min(0).max(10).default(0),
  tripType: z.enum(['roundTrip', 'oneWay']).default('roundTrip'),
  deepPlanData: z.any().optional(),
  bookingDocs: z.any().optional(),
});

export type TripPayload = z.infer<typeof tripPayloadSchema>;

/**
 * Validate and sanitize a trip payload.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateTripPayload(body: unknown) {
  const result = tripPayloadSchema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      success: false as const,
      error: `Invalid trip data: ${firstError.path.join('.')} — ${firstError.message}`,
    };
  }
  return { success: true as const, data: result.data };
}
