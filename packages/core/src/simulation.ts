import type { SignalSession, SignalMeasurement, SpectrumFrame } from "./models";
import { distanceMeters } from "./geo";
import { estimateRegion } from "./estimator";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export interface SimulationOptions {
  seed?: number;
  noiseDb?: number;
  sampleCount?: number;
  latitude?: number;
  longitude?: number;
}
export function simulateHunt(options: SimulationOptions = {}): SignalSession {
  let seed = options.seed ?? 42;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  const transmitter = {
    latitude: options.latitude ?? 44.2702,
    longitude: options.longitude ?? -71.3022,
  };
  const count = Math.max(12, Math.min(500, options.sampleCount ?? 90)),
    start = Date.parse("2026-09-29T14:20:00Z");
  const measurements: SignalMeasurement[] = Array.from(
    { length: count },
    (_, i) => {
      const t = i / (count - 1),
        location = {
          latitude: transmitter.latitude - 0.0018 + t * 0.0019,
          longitude:
            transmitter.longitude -
            0.0022 +
            t * 0.0019 +
            Math.sin(t * 5) * 0.00055,
          horizontalAccuracy: 6,
          altitude: 628 + t * 22,
        };
      return {
        id: uuid(i + 10),
        timestamp: new Date(start + i * 4000).toISOString(),
        receiverID: "simulated-phone",
        receiverType: "simulation",
        provenance: "simulated",
        signalIdentifier: "demo-camp-beacon",
        rssiDbm:
          Math.round(
            (-39 -
              22 *
                Math.log10(Math.max(1, distanceMeters(location, transmitter))) +
              noise() * (options.noiseDb ?? 6)) *
              10,
          ) / 10,
        location,
        heading: 38,
        headingAccuracy: 8,
        metadata: { scenario: "SIMULATED — not hardware data" },
      };
    },
  );
  const spectrum: SpectrumFrame[] = Array.from({ length: 64 }, (_, f) => ({
    id: uuid(1000 + f),
    timestamp: new Date(start + f * 4000).toISOString(),
    receiverID: "simulated-sdr",
    provenance: "simulated",
    centerFrequencyHz: 915e6,
    spanHz: 2e6,
    powerUnit: "dbfs",
    bins: Array.from(
      { length: 128 },
      (_, b) =>
        -99 +
        noise() * 6 +
        48 * Math.exp(-(((b - 68 - Math.sin(f / 10) * 2) / 2.5) ** 2)) +
        28 * Math.exp(-(((b - 34) / 4) ** 2)),
    ),
  }));
  const region = estimateRegion(measurements);
  return {
    schemaVersion: 1,
    id: uuid(1),
    name: "Camp Beacon · Demo Hunt",
    type: "hunt",
    startedAt: measurements[0]!.timestamp,
    endedAt: measurements.at(-1)!.timestamp,
    targetSignal: "demo-camp-beacon",
    measurements,
    route: measurements.map((m) => ({
      ...m.location!,
      timestamp: m.timestamp,
    })),
    estimatedRegions: region ? [region] : [],
    spectrum,
    waypoints: [],
    notes:
      "SIMULATED deterministic trail and spectrum. No real transmitter, receiver, or field recording.",
  };
}
export const createDemoSession = () => simulateHunt();
