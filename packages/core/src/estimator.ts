import {
  MeasurementSchema,
  type SignalMeasurement,
  type EstimatedRegion,
} from "./models";
import { bearingDegrees, distanceMeters, wrapLongitude } from "./geo";
export interface RegionEstimator {
  estimate(samples: SignalMeasurement[]): EstimatedRegion | undefined;
}
export function smoothRSSI(values: number[], alpha = 0.25): number[] {
  if (alpha <= 0 || alpha > 1)
    throw Error("Smoothing alpha must be in (0, 1].");
  let previous: number | undefined;
  return values.filter(Number.isFinite).map((v) => {
    previous = previous === undefined ? v : alpha * v + (1 - alpha) * previous;
    return previous;
  });
}
export function signalTrend(
  values: number[],
): "stronger" | "weaker" | "steady" {
  const clean = smoothRSSI(values.slice(-12));
  if (clean.length < 4) return "steady";
  const delta = clean.at(-1)! - clean[0]!;
  return delta > 2 ? "stronger" : delta < -2 ? "weaker" : "steady";
}
export function estimateRegion(
  input: SignalMeasurement[],
): EstimatedRegion | undefined {
  const valid = input.filter(
    (m) =>
      MeasurementSchema.safeParse(m).success &&
      m.location &&
      m.location.horizontalAccuracy <= 65,
  );
  if (valid.length < 4) return;
  const domain = (m: SignalMeasurement) =>
    JSON.stringify([
      m.receiverID,
      m.signalIdentifier,
      m.rssiDbm !== undefined ? "dbm" : m.powerUnit,
      m.frequencyHz,
      m.provenance,
    ]);
  if (new Set(valid.map(domain)).size !== 1) return;
  const raw = valid.map((m) => m.rssiDbm ?? m.powerDb!),
    sorted = [...raw].sort((a, b) => a - b),
    median = sorted[Math.floor(sorted.length / 2)]!;
  const deviations = raw.map((v) => Math.abs(v - median)).sort((a, b) => a - b),
    mad = deviations[Math.floor(deviations.length / 2)]!;
  const filtered = valid.filter(
    (m) =>
      Math.abs((m.rssiDbm ?? m.powerDb!) - median) <= Math.max(12, 3 * mad),
  );
  const points: SignalMeasurement[] = [],
    buckets = new Map<string, SignalMeasurement[]>();
  for (const m of filtered) {
    const lat = (m.location!.latitude * Math.PI) / 180,
      lon = (m.location!.longitude * Math.PI) / 180,
      r = 6371000 / 3,
      x = Math.floor(r * Math.cos(lat) * Math.cos(lon)),
      y = Math.floor(r * Math.cos(lat) * Math.sin(lon)),
      z = Math.floor(r * Math.sin(lat));
    let duplicate = false;
    for (let dx = -1; dx <= 1 && !duplicate; dx++)
      for (let dy = -1; dy <= 1 && !duplicate; dy++)
        for (let dz = -1; dz <= 1 && !duplicate; dz++)
          duplicate = (buckets.get(`${x + dx}:${y + dy}:${z + dz}`) ?? []).some(
            (p) => distanceMeters(p.location!, m.location!) < 3,
          );
    if (!duplicate) {
      points.push(m);
      const key = `${x}:${y}:${z}`,
        bucket = buckets.get(key) ?? [];
      bucket.push(m);
      buckets.set(key, bucket);
    }
  }
  if (points.length < 4) return;
  const origin = points[0]!.location!;
  const xy = points.map((m) => ({
    m,
    x:
      wrapLongitude(m.location!.longitude - origin.longitude) *
      111320 *
      Math.cos((origin.latitude * Math.PI) / 180),
    y: (m.location!.latitude - origin.latitude) * 111320,
    power: m.rssiDbm ?? m.powerDb!,
  }));
  const span = Math.hypot(
    Math.max(...xy.map((p) => p.x)) - Math.min(...xy.map((p) => p.x)),
    Math.max(...xy.map((p) => p.y)) - Math.min(...xy.map((p) => p.y)),
  );
  if (span < 12 || span > 50000) return;
  const min = Math.min(...xy.map((p) => p.power)),
    weights = xy.map(
      (p) =>
        10 ** (Math.min(24, p.power - min) / 20) /
        Math.max(5, p.m.location!.horizontalAccuracy),
    ),
    total = weights.reduce((a, b) => a + b, 0);
  const cx = xy.reduce((s, p, i) => s + p.x * weights[i]!, 0) / total,
    cy = xy.reduce((s, p, i) => s + p.y * weights[i]!, 0) / total;
  const center = {
    latitude: origin.latitude + cy / 111320,
    longitude: wrapLongitude(
      origin.longitude +
        cx /
          (111320 *
            Math.max(0.01, Math.cos((origin.latitude * Math.PI) / 180))),
    ),
  };
  const accuracy =
    points.reduce((s, p) => s + p.location!.horizontalAccuracy, 0) /
    points.length;
  const mean = xy.reduce((s, p) => s + p.power, 0) / xy.length,
    variance = xy.reduce((s, p) => s + (p.power - mean) ** 2, 0) / xy.length;
  const mx = xy.reduce((s, p) => s + p.x, 0) / xy.length,
    my = xy.reduce((s, p) => s + p.y, 0) / xy.length;
  const xx = xy.reduce((s, p) => s + (p.x - mx) ** 2, 0),
    yy = xy.reduce((s, p) => s + (p.y - my) ** 2, 0),
    cross = xy.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const discriminant = Math.sqrt((xx - yy) ** 2 + 4 * cross ** 2),
    ratio = (xx + yy - discriminant) / Math.max(1, xx + yy + discriminant);
  // Confidence is a geometry/quality heuristic, never a calibrated containment probability.
  const confidence =
    points.length >= 40 &&
    span >= 50 &&
    accuracy <= 10 &&
    ratio >= 0.2 &&
    variance <= 100
      ? "high"
      : points.length >= 12 && span >= 30 && accuracy <= 20 && ratio >= 0.08
        ? "medium"
        : "low";
  const latest = points.at(-1)!;
  const bearing =
    span >= 30 &&
    points.length >= 12 &&
    ratio >= 0.08 &&
    variance >= 4 &&
    distanceMeters(latest.location!, center) > accuracy * 2
      ? bearingDegrees(latest.location!, center)
      : undefined;
  return {
    id: latest.id,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    radiusMeters: Math.max(20, accuracy * 2, span * 0.65),
    confidence,
    algorithm: "WeightedRegionEstimator/v1",
    sampleCount: points.length,
    meanRSSI: latest.rssiDbm !== undefined ? mean : undefined,
    variance,
    createdAt: latest.timestamp,
    label: "Estimated source region",
    bearingDegrees: bearing,
    provenance: latest.provenance,
  };
}
export class WeightedRegionEstimator implements RegionEstimator {
  estimate(samples: SignalMeasurement[]) {
    return estimateRegion(samples);
  }
}
