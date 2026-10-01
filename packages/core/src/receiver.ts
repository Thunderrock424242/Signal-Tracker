import { z } from "zod";
import {
  MeasurementSchema,
  SpectrumSchema,
  PowerUnitSchema,
  LocationSchema,
  type SignalMeasurement,
  type SpectrumFrame,
} from "./models";
const common = {
  version: z.literal(1),
  id: z.uuid().optional(),
  timestamp: z.string().datetime({ offset: true }),
  receiverId: z.string().min(1).max(200),
  batteryPercent: z.number().finite().min(0).max(100).optional(),
};
const measurement = z
  .object({
    ...common,
    kind: z.literal("measurement"),
    receiverType: z
      .enum(["sdr", "esp32", "lora", "directional"])
      .default("sdr"),
    frequencyHz: z.number().positive().max(1e13).optional(),
    bandwidthHz: z.number().positive().max(1e12).optional(),
    powerDb: z.number().finite().min(-300).max(200),
    powerUnit: PowerUnitSchema,
    signalIdentifier: z.string().min(1).max(200),
    location: LocationSchema.optional(),
    bearingDegrees: z.number().min(0).lt(360).optional(),
    bearingAccuracyDegrees: z.number().min(0).max(180).optional(),
  })
  .strict();
const spectrum = z
  .object({
    ...common,
    kind: z.literal("spectrum"),
    centerFrequencyHz: z.number().positive(),
    spanHz: z.number().positive(),
    powerUnit: PowerUnitSchema,
    bins: z.array(z.number().finite().min(-300).max(200)).min(2).max(1024),
  })
  .strict();
export type ReceiverPacket = (
  | { kind: "measurement"; measurement: SignalMeasurement }
  | { kind: "spectrum"; frame: SpectrumFrame }
) & { batteryPercent?: number };
export function parseReceiverPacket(input: unknown): ReceiverPacket {
  const p = z.discriminatedUnion("kind", [measurement, spectrum]).parse(input);
  if (p.kind === "spectrum")
    return {
      kind: "spectrum",
      batteryPercent: p.batteryPercent,
      frame: SpectrumSchema.parse({
        id: p.id ?? crypto.randomUUID(),
        timestamp: p.timestamp,
        receiverID: p.receiverId,
        provenance: "measured",
        centerFrequencyHz: p.centerFrequencyHz,
        spanHz: p.spanHz,
        powerUnit: p.powerUnit,
        bins: p.bins,
      }),
    };
  return {
    kind: "measurement",
    batteryPercent: p.batteryPercent,
    measurement: MeasurementSchema.parse({
      id: p.id ?? crypto.randomUUID(),
      timestamp: p.timestamp,
      receiverID: p.receiverId,
      receiverType: p.receiverType,
      provenance: "measured",
      signalIdentifier: p.signalIdentifier,
      frequencyHz: p.frequencyHz,
      bandwidthHz: p.bandwidthHz,
      powerDb: p.powerDb,
      powerUnit: p.powerUnit,
      location: p.location,
      bearingDegrees: p.bearingDegrees,
      bearingAccuracyDegrees: p.bearingAccuracyDegrees,
    }),
  };
}
export function detectPeaks(
  frame: SpectrumFrame,
  thresholdDb = 8,
): { frequencyHz: number; powerDb: number; index: number }[] {
  const sorted = [...frame.bins].sort((a, b) => a - b),
    floor = sorted[Math.floor(sorted.length / 2)]!;
  return frame.bins
    .flatMap((p, i) =>
      i > 0 &&
      i < frame.bins.length - 1 &&
      p > frame.bins[i - 1]! &&
      p >= frame.bins[i + 1]! &&
      p - floor >= thresholdDb
        ? [
            {
              frequencyHz:
                frame.centerFrequencyHz -
                frame.spanHz / 2 +
                (i * frame.spanHz) / (frame.bins.length - 1),
              powerDb: p,
              index: i,
            },
          ]
        : [],
    )
    .sort((a, b) => b.powerDb - a.powerDb)
    .slice(0, 12);
}
