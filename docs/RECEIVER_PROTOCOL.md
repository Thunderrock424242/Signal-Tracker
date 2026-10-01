# External receiver protocol

The transport is versioned JSON over trusted HTTPS on an explicitly configured local bridge. It consumes measurements from real receiver software. No SDR driver, hardware tuning, demodulation or firmware is supplied by this reference bridge.

## Endpoints

All requests require `Authorization: Bearer <bridge token>`; the token must contain at least 32 characters. Native credentials are stored in Keychain. Certificate validation uses normal system trust and hostname checks.

| Endpoint | Behavior |
| --- | --- |
| `GET /v1/health` | Version and currently observed capabilities |
| `GET /v1/latest?kind=measurement` | Latest normalized power packet |
| `GET /v1/latest?kind=spectrum` | Latest spectrum packet |

Missing/stale packets return 204; bad credentials 401; other methods 405. The iPhone polls both packet kinds approximately once per second. This is a latest-value transport; faster intermediate frames may be skipped. Stable packet UUIDs prevent duplicate capture. Use one reference bridge per receiver; a future multiplexing transport should route by receiver ID.

## Measurement packet

```json
{
  "version": 1,
  "kind": "measurement",
  "id": "52480cf8-8b9b-4b43-8a86-a641bd85e2fa",
  "timestamp": "2026-09-30T12:00:00.000Z",
  "receiverId": "field-sdr-01",
  "receiverType": "sdr",
  "signalIdentifier": "owned-test-carrier",
  "frequencyHz": 915000000,
  "bandwidthHz": 200000,
  "powerDb": -61.4,
  "powerUnit": "dbfs",
  "batteryPercent": 82
}
```

Examples describe format only. A real producer must insert the current UTC acquisition time and a new stable UUID per new observation. The bridge rejects timestamps more than 30 seconds from its clock. This value is an illustrative relative reading, not a calibrated measurement.

Required: version, kind, timestamp, receiverId, signalIdentifier, powerDb and powerUnit. `receiverType` defaults to `sdr`; alternatives are `esp32`, `lora`, `directional`. Optional fields: id, frequencyHz, bandwidthHz, `location` (latitude, longitude, horizontalAccuracy, optional altitude), bearingDegrees, bearingAccuracyDegrees and batteryPercent. If location is omitted, the iPhone attaches its fresh local fix; this is appropriate only when phone and receiver are colocated. A remote sensor must supply its own position and accuracy.

## Spectrum packet

```json
{
  "version": 1,
  "kind": "spectrum",
  "id": "8ce57016-05e8-4e88-9d75-a0cb6be18811",
  "timestamp": "2026-09-30T12:00:00.000Z",
  "receiverId": "field-sdr-01",
  "centerFrequencyHz": 915000000,
  "spanHz": 2000000,
  "powerUnit": "dbfs",
  "bins": [-99, -83, -45, -81, -98]
}
```

Bins are evenly spaced, ascending frequency, inclusive of the span endpoints. Include 2–1,024 finite bins in −300…200. Power units are `dbm`, `dbfs`, `db`; never label uncalibrated values dBm. Frequencies must be positive and ≤10 THz, span/bandwidth ≤1 THz; the lower spectrum endpoint cannot be negative. batteryPercent, when supplied, is 0–100. Packet bodies are limited to 128 KB. The configured native receiver ID must match packet receiverId. Unknown required fields or unsupported versions fail validation; producers should use only documented fields.

## Run the reference bridge

From the repository root, install dependencies with `npm ci`. Set these environment variables in your shell:

```powershell
$env:BRIDGE_TOKEN = '<a randomly generated token of at least 32 characters>'
$env:BRIDGE_CERT = 'C:\receiver\bridge-cert.pem'
$env:BRIDGE_KEY = 'C:\receiver\bridge-key.pem'
$env:BRIDGE_HOST = '0.0.0.0'
$env:BRIDGE_PORT = '9443'
```

Pipe your authorized receiver producer's newline-delimited JSON output to `npm run bridge`. The default host is loopback; opt into the LAN bind only for your trusted network. The certificate must include the hostname you enter on the phone and chain to a trusted certificate authority. Install a private CA through the device's supported trust configuration if necessary. Never disable certificate checks.

The bridge validates each line, adds an ID if omitted, preserves units and receiver positions, retains one latest packet per kind, checks token equality in constant time and logs only generic rejection/status messages. Use a producer with bounded output lines; the reference stdin reader is intended for local trusted software, not an exposed untrusted input stream. Keep certificate keys and tokens outside Git. Physical receiver integration and trusted LAN TLS remain manual tests.
