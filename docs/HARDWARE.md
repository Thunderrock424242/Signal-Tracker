# Hardware capabilities

| Source | Implemented integration | Boundary |
| --- | --- | --- |
| iPhone BLE | CoreBluetooth foreground advertisements, RSSI, app-visible UUID, advertised name/services, recent observation history | Not MAC addresses, all nearby radios or calibrated direction finding |
| iPhone GPS/compass | CoreLocation fixes, accuracy, available altitude, heading, walking course | Permissions and device/environment availability apply |
| ESP32 | Version-1 HTTPS normalized measurement adapter | Firmware/producer is supplied by the hardware owner |
| Raspberry Pi + SDR | Reference authenticated HTTPS bridge consuming real JSON from a producer | SDR driver, tuning and calibration are separate software |
| LoRa sensor | Receiver type/protocol seam | No generic LoRa radio exists inside this app/iPhone |
| Directional antenna receiver | Optional bearing/accuracy fields retained with power | Directional hardware and calibration must provide the measurements |
| Multiple receivers | Independent streams/configuration, explicit source selection and separate measurement domains | Calibrated multi-sensor fusion is an extension, not currently inferred |
| Spectrum/waterfall | Native and web render actual supplied spectrum frames, units, peaks and cursors | Arbitrary RF spectrum requires external receiver hardware |
| Simulation | Seeded marked demo observations and spectrum | Always marked SIMULATED; never presented as successful hardware integration |

The native receiver manager shows connection state, latest packet time, sample rate, round-trip latency, capabilities and battery percent when supplied. Missing battery data remains unavailable. A BLE device being visible does not establish ownership; select equipment you own or are authorized to inspect.

## Supported receiver deployment

Connect an authorized SDR to a compatible host and use its own acquisition software to produce normalized version-1 JSON. Record power in its real unit. Report dBm only after suitable calibration; many SDRs expose dBFS instead. If the receiver is remote, include its actual GPS position and accuracy. Do not attach the phone's location to an unrelated remote sensor.

Run the [reference bridge](RECEIVER_PROTOCOL.md) on the host with a trusted HTTPS certificate and token. Configure the phone on a reachable local network. Its receiver ID must match the packets. One reference bridge retains one measurement and one spectrum packet at a time, so use separate endpoints for multiple hardware sources.

The iPhone cannot use the app as a general-purpose SDR or reveal arbitrary Wi-Fi/cellular internals. There are no private radio APIs, direct SDR USB drivers, encrypted-traffic interception or forced background scan capabilities. Hardware selection should follow your receiver software's documented platform, antenna and calibration requirements; this project makes no untested device-compatibility claim.

## Bring-up acceptance

Check trusted TLS, authentication failures, receiver ID, clock synchronization, calibrated units, actual sample cadence, disconnect/reconnect, 204 waiting states, both spectrum and measurement streams, bounded frames, duplicate IDs, invalid packets and optional battery data. Walk a known route with an owned beacon and compare exported raw readings against the producer's logs. Physical bring-up has not been performed here.
