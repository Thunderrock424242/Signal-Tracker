import { createServer } from "node:https";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { timingSafeEqual } from "node:crypto";
import { parseReceiverPacket } from "../packages/core/src/index";

const token = process.env.BRIDGE_TOKEN,
  certPath = process.env.BRIDGE_CERT,
  keyPath = process.env.BRIDGE_KEY;
if (!token || token.length < 32 || !certPath || !keyPath)
  throw Error(
    "Set BRIDGE_TOKEN (at least 32 characters), BRIDGE_CERT and BRIDGE_KEY. See docs/RECEIVER_PROTOCOL.md.",
  );
const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
const expected = Buffer.from("Bearer " + token),
  latest = new Map<string, { timestamp: string; payload: unknown }>();
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  try {
    if (Buffer.byteLength(line) > 128000) throw Error("Packet too large");
    const packet = parseReceiverPacket(JSON.parse(line));
    const value =
      packet.kind === "measurement" ? packet.measurement : packet.frame;
    if (Math.abs(Date.now() - Date.parse(value.timestamp)) > 30000)
      throw Error("Stale timestamp");
    const payload =
      packet.kind === "measurement"
        ? {
            version: 1,
            kind: "measurement",
            id: packet.measurement.id,
            timestamp: value.timestamp,
            receiverId: value.receiverID,
            receiverType: packet.measurement.receiverType,
            frequencyHz: packet.measurement.frequencyHz,
            bandwidthHz: packet.measurement.bandwidthHz,
            powerDb: packet.measurement.powerDb,
            powerUnit: packet.measurement.powerUnit,
            signalIdentifier: packet.measurement.signalIdentifier,
            location: packet.measurement.location,
            bearingDegrees: packet.measurement.bearingDegrees,
            bearingAccuracyDegrees: packet.measurement.bearingAccuracyDegrees,
          }
        : {
            version: 1,
            kind: "spectrum",
            id: packet.frame.id,
            timestamp: value.timestamp,
            receiverId: value.receiverID,
            centerFrequencyHz: packet.frame.centerFrequencyHz,
            spanHz: packet.frame.spanHz,
            powerUnit: packet.frame.powerUnit,
            bins: packet.frame.bins,
          };
    latest.set(packet.kind, {
      timestamp: value.timestamp,
      payload: { ...payload, batteryPercent: packet.batteryPercent },
    });
  } catch {
    process.stderr.write(
      "Rejected invalid, oversized or stale receiver packet.\n",
    );
  }
});
const server = createServer({ cert, key }, (request, response) => {
  const received = Buffer.from(request.headers.authorization ?? "");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    response.writeHead(401);
    response.end();
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405);
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "https://bridge.local");
  if (url.pathname === "/v1/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        version: 1,
        capabilities: [...latest.keys()],
        liveHardwareConfigured: latest.size > 0,
      }),
    );
    return;
  }
  if (url.pathname !== "/v1/latest") {
    response.writeHead(404);
    response.end();
    return;
  }
  const kind = url.searchParams.get("kind") ?? "measurement",
    packet = latest.get(kind);
  if (!packet || Date.now() - Date.parse(packet.timestamp) > 30000) {
    response.writeHead(204);
    response.end();
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(packet.payload));
});
server.headersTimeout = 10000;
server.requestTimeout = 10000;
server.maxConnections = 20;
server.listen(
  Number(process.env.BRIDGE_PORT ?? 9443),
  process.env.BRIDGE_HOST ?? "127.0.0.1",
  () =>
    process.stderr.write(
      "Authorized HTTPS receiver bridge started. Waiting for real measurement JSON on stdin.\n",
    ),
);
process.on("SIGINT", () => {
  input.close();
  server.close();
});
