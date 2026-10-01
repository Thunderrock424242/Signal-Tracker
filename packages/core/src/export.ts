import type { SignalSession, EstimatedRegion } from "./models";
export const exportJSON = (s: SignalSession) => JSON.stringify(s, null, 2);
function cell(value: unknown): string {
  let text = value === undefined ? "" : String(value);
  if (/^[=+@\-\t\r]/.test(text) && typeof value !== "number") text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function exportCSV(s: SignalSession): string {
  const keys = [
    "id",
    "timestamp",
    "receiverID",
    "receiverType",
    "provenance",
    "signalIdentifier",
    "latitude",
    "longitude",
    "horizontalAccuracy",
    "altitude",
    "heading",
    "headingAccuracy",
    "frequencyHz",
    "bandwidthHz",
    "rssiDbm",
    "powerDb",
    "powerUnit",
    "snrDb",
    "bearingDegrees",
    "bearingAccuracyDegrees",
    "metadata",
  ];
  return [
    keys.join(","),
    ...s.measurements.map((m) =>
      [
        m.id,
        m.timestamp,
        m.receiverID,
        m.receiverType,
        m.provenance,
        m.signalIdentifier,
        m.location?.latitude,
        m.location?.longitude,
        m.location?.horizontalAccuracy,
        m.location?.altitude,
        m.heading,
        m.headingAccuracy,
        m.frequencyHz,
        m.bandwidthHz,
        m.rssiDbm,
        m.powerDb,
        m.powerUnit,
        m.snrDb,
        m.bearingDegrees,
        m.bearingAccuracyDegrees,
        JSON.stringify(m.metadata ?? {}),
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
}
interface Feature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}
function circle(e: EstimatedRegion): number[][] {
  const lat = (e.centerLatitude * Math.PI) / 180,
    lon = (e.centerLongitude * Math.PI) / 180,
    r = e.radiusMeters / 6371000;
  return Array.from({ length: 65 }, (_, i) => {
    const b = (i * 2 * Math.PI) / 64,
      l = Math.asin(
        Math.sin(lat) * Math.cos(r) + Math.cos(lat) * Math.sin(r) * Math.cos(b),
      ),
      o =
        lon +
        Math.atan2(
          Math.sin(b) * Math.sin(r) * Math.cos(lat),
          Math.cos(r) - Math.sin(lat) * Math.sin(l),
        );
    return [(((o * 180) / Math.PI + 540) % 360) - 180, (l * 180) / Math.PI];
  });
}
export function exportGeoJSON(s: SignalSession): {
  type: "FeatureCollection";
  features: Feature[];
} {
  const features: Feature[] = s.measurements
    .filter((m) => m.location)
    .map((m) => ({
      type: "Feature",
      properties: {
        kind: "measurement",
        id: m.id,
        timestamp: m.timestamp,
        provenance: m.provenance,
        rssiDbm: m.rssiDbm,
        powerDb: m.powerDb,
        powerUnit: m.powerUnit,
        receiverID: m.receiverID,
      },
      geometry: {
        type: "Point",
        coordinates: [m.location!.longitude, m.location!.latitude],
      },
    }));
  const segments: (typeof s.route)[] = [];
  for (const p of s.route) {
    if (!segments.length || p.segmentStart) segments.push([]);
    segments.at(-1)!.push(p);
  }
  for (const segment of segments)
    if (segment.length >= 2)
      features.push({
        type: "Feature",
        properties: {
          kind: "breadcrumb",
          timestamps: segment.map((p) => p.timestamp),
        },
        geometry: {
          type: "LineString",
          coordinates: segment.map((p) => [p.longitude, p.latitude]),
        },
      });
  for (const e of s.estimatedRegions)
    features.push({
      type: "Feature",
      properties: {
        kind: "estimated-region",
        label: e.label,
        radiusMeters: e.radiusMeters,
        confidence: e.confidence,
        algorithm: e.algorithm,
        provenance: e.provenance,
      },
      geometry: { type: "Polygon", coordinates: [circle(e)] },
    });
  for (const w of s.waypoints)
    features.push({
      type: "Feature",
      properties: { kind: "waypoint", name: w.name, timestamp: w.timestamp },
      geometry: { type: "Point", coordinates: [w.longitude, w.latitude] },
    });
  return { type: "FeatureCollection", features };
}
