import { describe, expect, it } from "vitest";
import {
  SessionSchema,
  MeasurementSchema,
  estimateRegion,
  smoothRSSI,
  createDemoSession,
  distanceMeters,
  bearingDegrees,
  exportCSV,
  exportGeoJSON,
  parseReceiverPacket,
  SyncQueue,
  type SignalMeasurement,
  type QueueStorage,
} from "../src/index";

const samples = (): SignalMeasurement[] =>
  Array.from({ length: 30 }, (_, i) => ({
    id: crypto.randomUUID(),
    timestamp: new Date(1700000000000 + i * 1000).toISOString(),
    receiverID: "phone",
    receiverType: "ble",
    provenance: "measured",
    signalIdentifier: "owned-beacon",
    rssiDbm: -85 + i / 2,
    location: {
      latitude: 40 + i * 0.00004,
      longitude: -75 + Math.sin(i / 4) * 0.0003,
      horizontalAccuracy: 8,
    },
  }));

describe("interchange safety", () => {
  it("rejects impossible coordinates before storing", () => {
    expect(() =>
      MeasurementSchema.parse({
        ...samples()[0],
        location: { latitude: 91, longitude: 0, horizontalAccuracy: 5 },
      }),
    ).toThrow();
  });
  it("rejects unknown schema versions", () => {
    expect(() =>
      SessionSchema.parse({ ...createDemoSession(), schemaVersion: 999 }),
    ).toThrow();
  });
  it("requires a power value and its unit", () => {
    expect(() =>
      MeasurementSchema.parse({
        ...samples()[0],
        rssiDbm: undefined,
        powerDb: -60,
      }),
    ).toThrow();
  });
  it("rejects RSSI sentinel 127", () => {
    expect(() =>
      MeasurementSchema.parse({ ...samples()[0], rssiDbm: 127 }),
    ).toThrow();
  });
  it("bounds metadata instead of accepting arbitrary nested data", () => {
    expect(() =>
      MeasurementSchema.parse({
        ...samples()[0],
        metadata: { secret: { value: 1 } },
      }),
    ).toThrow();
  });
});
describe("movement and estimation", () => {
  it("calculates geodesic distance across the date line", () => {
    expect(
      distanceMeters(
        { latitude: 0, longitude: 179.999 },
        { latitude: 0, longitude: -179.999 },
      ),
    ).toBeGreaterThan(200);
    expect(
      distanceMeters(
        { latitude: 0, longitude: 179.999 },
        { latitude: 0, longitude: -179.999 },
      ),
    ).toBeLessThan(230);
  });
  it("calculates a north bearing", () => {
    expect(
      bearingDegrees(
        { latitude: 40, longitude: -75 },
        { latitude: 41, longitude: -75 },
      ),
    ).toBeCloseTo(0);
  });
  it("smooths without allowing NaN to poison the series", () => {
    expect(smoothRSSI([-80, NaN, -60], 0.5)).toEqual([-80, -70]);
  });
  it("rejects a lone strong signal", () => {
    expect(estimateRegion(samples().slice(0, 1))).toBeUndefined();
  });
  it("does not infer a source from repeated stationary fixes", () => {
    const s = samples().map((v) => ({
      ...v,
      location: samples()[0]!.location,
    }));
    expect(estimateRegion(s)).toBeUndefined();
  });
  it("does not estimate from poor GPS accuracy", () => {
    const s = samples().map((v) => ({
      ...v,
      location: { ...v.location!, horizontalAccuracy: 200 },
    }));
    expect(estimateRegion(s)).toBeUndefined();
  });
  it("keeps receiver/target domains separate", () => {
    const s = samples().map((v, i) => ({
      ...v,
      signalIdentifier: i % 2 ? "other" : "owned-beacon",
    }));
    expect(estimateRegion(s)).toBeUndefined();
  });
  it("cannot collide receiver and target identifiers containing delimiters", () => {
    const s = samples().map((v, i) => ({
      ...v,
      receiverID: i % 2 ? "a|b" : "a",
      signalIdentifier: i % 2 ? "c" : "b|c",
    }));
    expect(estimateRegion(s)).toBeUndefined();
  });
  it("does not combine measured and simulated data", () => {
    const s = samples().map((v, i) => ({
      ...v,
      provenance: i % 2 ? ("simulated" as const) : ("measured" as const),
    }));
    expect(estimateRegion(s)).toBeUndefined();
  });
  it("returns a region with visible algorithm and nonzero uncertainty", () => {
    const e = estimateRegion(samples());
    expect(e?.algorithm).toBe("WeightedRegionEstimator/v1");
    expect(e?.radiusMeters).toBeGreaterThanOrEqual(20);
    expect(e?.sampleCount).toBeGreaterThan(3);
    expect(e?.label).toBe("Estimated source region");
  });
  it("strong power with linear geometry cannot earn high confidence", () => {
    const s = samples().map((v, i) => ({
      ...v,
      rssiDbm: -35,
      location: {
        latitude: 40 + i * 0.0001,
        longitude: -75,
        horizontalAccuracy: 5,
      },
    }));
    expect(estimateRegion(s)?.confidence).not.toBe("high");
  });
  it("does not invent a bearing from equal power along a line", () => {
    const s = samples().map((v, i) => ({
      ...v,
      rssiDbm: -50,
      location: {
        latitude: 40 + i * 0.0001,
        longitude: -75,
        horizontalAccuracy: 5,
      },
    }));
    expect(estimateRegion(s)?.bearingDegrees).toBeUndefined();
  });
});
describe("simulation and exports", () => {
  it("produces deterministic, schema-valid and labeled demo recordings", () => {
    const a = createDemoSession();
    expect(a).toEqual(createDemoSession());
    expect(SessionSchema.parse(a).measurements.length).toBeGreaterThan(30);
    expect(a.measurements.every((m) => m.provenance === "simulated")).toBe(
      true,
    );
    expect(a.spectrum.length).toBeGreaterThan(10);
  });
  it("preserves raw timestamps in CSV and escapes spreadsheet formulas", () => {
    const s = createDemoSession();
    s.measurements[0]!.signalIdentifier = '=HYPERLINK("bad")';
    const csv = exportCSV(s);
    expect(csv).toContain(s.measurements[0]!.timestamp);
    expect(csv).toContain("'=HYPERLINK");
  });
  it("exports measurement points and an estimated polygon separately", () => {
    const g = exportGeoJSON(createDemoSession());
    expect(g.type).toBe("FeatureCollection");
    expect(g.features.some((f) => f.properties.kind === "measurement")).toBe(
      true,
    );
    expect(
      g.features.some(
        (f) =>
          f.properties.kind === "estimated-region" &&
          f.geometry.type === "Polygon",
      ),
    ).toBe(true);
  });
  it("does not export a fabricated line across a route gap", () => {
    const s = createDemoSession();
    s.route = s.route.slice(0, 4);
    s.route[2]!.segmentStart = true;
    const routes = exportGeoJSON(s).features.filter(
      (f) => f.properties.kind === "breadcrumb",
    );
    expect(routes).toHaveLength(2);
    expect(
      routes.map((f) => (f.geometry.coordinates as number[][]).length),
    ).toEqual([2, 2]);
  });
  it("validates external frames and never implies relative power is dBm", () => {
    const packet = parseReceiverPacket({
      version: 1,
      kind: "measurement",
      timestamp: "2026-09-29T12:00:00Z",
      receiverId: "sdr-1",
      frequencyHz: 915e6,
      powerDb: -61.4,
      powerUnit: "dbfs",
      bandwidthHz: 200000,
      signalIdentifier: "authorized-test",
    });
    expect(packet.kind).toBe("measurement");
    if (packet.kind === "measurement")
      expect(packet.measurement.powerUnit).toBe("dbfs");
  });
  it("rejects unbounded spectrum arrays", () => {
    expect(() =>
      parseReceiverPacket({
        version: 1,
        kind: "spectrum",
        timestamp: "2026-09-29T12:00:00Z",
        receiverId: "sdr-1",
        centerFrequencyHz: 915e6,
        spanHz: 2e6,
        powerUnit: "dbfs",
        bins: Array(1025).fill(-50),
      }),
    ).toThrow();
  });
});
describe("durable retry queue", () => {
  const storage = (): QueueStorage => {
    let raw = "[]";
    return {
      read: async () => raw,
      write: async (v) => {
        raw = v;
      },
    };
  };
  it("preserves failed uploads across queue reconstruction", async () => {
    const s = storage(),
      q = new SyncQueue(s);
    await q.enqueue("abc");
    await q.flush(async () => {
      throw Error("offline");
    });
    expect(await new SyncQueue(s).pending()).toEqual(["abc"]);
  });
  it("deduplicates idempotent session uploads and removes successes", async () => {
    const q = new SyncQueue(storage());
    await q.enqueue("abc");
    await q.enqueue("abc");
    expect(await q.pending()).toEqual(["abc"]);
    await q.flush(async () => {});
    expect(await q.pending()).toEqual([]);
  });
  it("removes deleted sessions from the outbox", async () => {
    const q = new SyncQueue(storage());
    await q.enqueue("abc");
    await q.remove("abc");
    expect(await q.pending()).toEqual([]);
  });
});
