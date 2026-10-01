import { z } from "zod";
const finite = z.number().finite();
const timestamp = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const identifier = z.string().min(1).max(200);
const uuid = z.uuid().transform((value) => value.toLowerCase());
export const PowerUnitSchema = z.enum(["dbm", "dbfs", "db"]);
export const CoordinateSchema = z
  .object({
    latitude: finite.min(-90).max(90),
    longitude: finite.min(-180).max(180),
  })
  .strict();
export const LocationSchema = CoordinateSchema.extend({
  horizontalAccuracy: finite.min(0).max(100000),
  altitude: finite.optional(),
});
export const RoutePointSchema = LocationSchema.extend({
  timestamp,
  segmentStart: z.boolean().optional(),
});
export const MeasurementSchema = z
  .object({
    id: uuid,
    timestamp,
    receiverID: identifier,
    receiverType: z.enum([
      "ble",
      "esp32",
      "sdr",
      "lora",
      "directional",
      "simulation",
    ]),
    provenance: z.enum(["measured", "simulated"]),
    location: LocationSchema.optional(),
    heading: finite.min(0).lt(360).optional(),
    headingAccuracy: finite.min(0).max(180).optional(),
    frequencyHz: finite.positive().max(1e13).optional(),
    bandwidthHz: finite.positive().max(1e12).optional(),
    rssiDbm: finite.min(-160).max(20).optional(),
    powerDb: finite.min(-300).max(200).optional(),
    powerUnit: PowerUnitSchema.optional(),
    snrDb: finite.min(-100).max(150).optional(),
    bearingDegrees: finite.min(0).lt(360).optional(),
    bearingAccuracyDegrees: finite.min(0).max(180).optional(),
    signalIdentifier: identifier.optional(),
    metadata: z
      .record(z.string().max(80), z.string().max(1000))
      .refine((v) => Object.keys(v).length <= 30)
      .optional(),
  })
  .strict()
  .refine(
    (m) =>
      m.rssiDbm !== undefined ||
      (m.powerDb !== undefined && m.powerUnit !== undefined),
    "A measured power value with a known unit is required",
  );
export const EstimatedRegionSchema = z
  .object({
    id: uuid,
    centerLatitude: finite.min(-90).max(90),
    centerLongitude: finite.min(-180).max(180),
    radiusMeters: finite.positive().max(2e7),
    confidence: z.enum(["low", "medium", "high"]),
    algorithm: z.string().min(1).max(100),
    sampleCount: z.number().int().min(4).max(20000),
    meanRSSI: finite.optional(),
    variance: finite.min(0),
    createdAt: timestamp,
    label: z.literal("Estimated source region"),
    bearingDegrees: finite.min(0).lt(360).optional(),
    provenance: z.enum(["measured", "simulated"]),
  })
  .strict();
export const SpectrumSchema = z
  .object({
    id: uuid,
    timestamp,
    receiverID: identifier,
    provenance: z.enum(["measured", "simulated"]),
    centerFrequencyHz: finite.positive().max(1e13),
    spanHz: finite.positive().max(1e12),
    powerUnit: PowerUnitSchema,
    bins: z.array(finite.min(-300).max(200)).min(2).max(1024),
  })
  .strict()
  .refine(
    (f) => f.centerFrequencyHz - f.spanHz / 2 >= 0,
    "Span must stay above 0 Hz",
  );
export const BeaconSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).max(100),
    type: z.enum(["ble", "rf"]),
    identifier,
    icon: z.string().max(50),
    notes: z.string().max(2000),
    frequencyHz: finite.positive().max(1e13).optional(),
    tags: z.array(z.string().max(50)).max(20),
  })
  .strict();
export const BookmarkSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).max(100),
    frequencyHz: finite.positive().max(1e13),
    bandwidthHz: finite.positive().max(1e12),
    mode: z.string().max(50),
    notes: z.string().max(2000),
  })
  .strict();
export const WaypointSchema = LocationSchema.extend({
  id: uuid,
  name: z.string().min(1).max(100),
  timestamp,
});
export const SessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: uuid,
    name: z.string().min(1).max(120),
    type: z.enum(["hunt", "wilderness"]),
    startedAt: timestamp,
    endedAt: timestamp.optional(),
    targetSignal: identifier.optional(),
    measurements: z.array(MeasurementSchema).max(20000),
    route: z.array(RoutePointSchema).max(20000),
    estimatedRegions: z.array(EstimatedRegionSchema).max(1000),
    spectrum: z.array(SpectrumSchema).max(300),
    waypoints: z.array(WaypointSchema).max(1000),
    lastServicePoint: RoutePointSchema.optional(),
    notes: z.string().max(10000),
  })
  .strict()
  .refine(
    (s) => !s.endedAt || Date.parse(s.endedAt) >= Date.parse(s.startedAt),
    "End time precedes start",
  );
export const PublicInfrastructureSchema = z
  .object({
    label: z.literal("PUBLIC DATABASE"),
    name: z.string().min(1).max(120),
    latitude: finite.min(-90).max(90),
    longitude: finite.min(-180).max(180),
    sourceURL: z.url().refine((s) => s.startsWith("https://")),
    updatedAt: timestamp,
  })
  .strict();
export type Coordinate = z.infer<typeof CoordinateSchema>;
export type LocationFix = z.infer<typeof LocationSchema>;
export type RoutePoint = z.infer<typeof RoutePointSchema>;
export type SignalMeasurement = z.infer<typeof MeasurementSchema>;
export type SignalSession = z.infer<typeof SessionSchema>;
export type EstimatedRegion = z.infer<typeof EstimatedRegionSchema>;
export type SpectrumFrame = z.infer<typeof SpectrumSchema>;
export type KnownBeacon = z.infer<typeof BeaconSchema>;
export type FrequencyBookmark = z.infer<typeof BookmarkSchema>;
export type PublicInfrastructure = z.infer<typeof PublicInfrastructureSchema>;
export function parseSessionJSON(text: string): SignalSession {
  if (new TextEncoder().encode(text).byteLength > 2_000_000)
    throw Error(
      "Session exceeds the 2 MB interchange limit. Split long recordings.",
    );
  return SessionSchema.parse(JSON.parse(text));
}
