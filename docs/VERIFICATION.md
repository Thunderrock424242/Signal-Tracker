# Verification evidence

Recorded on September 30, 2026, on Windows. This is implementation/build evidence, not a claim that an iPhone field trial, real RF hardware integration or deployed cloud sign-in has succeeded.

## Completed locally

| Check | Result and scope |
| --- | --- |
| `python -m unittest discover -s scripts/tests -p 'test_*.py' -v` | 3 passing fixture-based IPA packaging tests: Payload layout/content/executable mode, simulator rejection and preservation of an earlier archive when the executable is missing; no real device binary involved |
| `npm test` | 44 passing tests across interchange/geometry/estimation/exports/receiver parsing, durable retry queues, IndexedDB through fake-indexeddb (including atomic note/outbox rollback), API authorization/isolation, JWT signature validation, serialized cloud actions, hidden-tab cancellation and rate-limit retry |
| Real D1 repository test | Miniflare applies the migration and exercises SQL with 55 same-time sessions, stable two-page pagination, owner-scoped reads and deletion |
| `npm run check` | Strict TypeScript checks pass for domain, dashboard, bridge and Worker |
| `npm run build` | Static production dashboard and offline shell worker build successfully |
| `npm run test:e2e` | 8 passing Chromium tests: desktop and emulated iPhone viewport; empty/demo/navigation, persistence, JSON export/import/rejection, deletion/settings, no overflow or browser errors |
| `npm run test:preview` | Production dashboard and coordinate map render at desktop/mobile sizes; offline reload preserves the cached shell and IndexedDB demo session in Chromium, both at `/` and the Pages-style `/Signal-Tracker/` base path |
| Visual inspection | Desktop and mobile production screenshots inspected; saved in ignored `.artifacts/` |
| `npm run backend:package` | Wrangler dry-run successfully packages the Worker and recognizes D1/rate-limit bindings; no deployment |
| `npm audit --omit=dev` | No production dependency vulnerabilities reported at verification time |
| `npm run fixtures` | Generates deterministic labeled JSON consumed by Swift and TypeScript |
| Independent source review | UUID casing, transfer/deletion race, route-gap recovery, map domain selection, degenerate bearings, durable checkpoints, note-edit protection, rate-limit retry and tied pagination reviewed/fixed |
| Sideload workflow review | Device destination, archive layout, mode preservation and manual artifact delivery reviewed; checksum filename corrected to match extracted downloads. Workflow YAML parses through Prettier; no remote build performed |

The test sequence exposed and corrected a production service-worker cache mismatch caused by response Vary headers. Development-browser tests alone did not prove offline shell behavior. The production test now checks actual offline reloads.

## Native checks prepared, not run

The portable Swift package contains 13 XCTest cases covering interchange, sparse/stationary/poor-GPS/mixed-domain estimates, uncertainty, smoothing/dateline geometry, invalid imports, relative receiver power, protected-store/outbox recovery, formula-safe CSV, GPS gap segments, flat-power bearing rejection, interrupted-session recovery and mixed-session simulation disclosure.

No Swift compiler or Xcode is available on this Windows host. These tests have not been compiled or executed. `ios/project.yml` and the macOS CI job prepare project generation and simulator compilation; neither constitutes a successful native build. The separate manual `ios-sideload.yml` workflow prepares an unsigned iPhoneOS IPA for Windows/AltStore installation; it has not run, and no real IPA is supplied. See [Windows sideloading](WINDOWS_SIDELOADING.md) or [Mac commands](IOS.md).

## Required device and integration acceptance

1. Run Swift tests and the Xcode build using the supplied GitHub macOS workflows or a local Mac. Resolve toolchain/SDK diagnostics before installation. For the Windows route, run the device workflow and install its successful IPA through AltStore.
2. On a real iPhone, verify Bluetooth/location/local-network prompt timing, denied/restricted/approximate states, foreground pause, restart recovery and absence of unintended background acquisition.
3. With an owned BLE beacon, verify advertisement cadence, target selection, raw RSSI, fresh GPS association, heading accuracy, stationary suppression, movement-based estimate eligibility and exported readings.
4. Walk a known route offline; verify waypoints, route gaps, distance excluding missing segments, return bearing, altitude when available, foreground interruption and last-connectivity labeling.
5. Connect actual receiver hardware through trusted LAN HTTPS. Exercise authorization errors, stable IDs, both measurement/spectrum packets, stale data, malformed data, disconnect/reconnect, units, remote sensor coordinates and optional battery status.
6. Compare spectrum bins/cursors/peaks/waterfall against the receiver's producer output. Physical power calibration and estimator error are unmeasured.
7. Configure a real OIDC public client and Worker/D1 deployment. Test sign-in, expiry/sign-out, owner isolation with two accounts, uploads/downloads/deletes, retry after connectivity loss and rate limiting with over 60 requests.
8. Run the supplied CI workflows in the actual repository and test deployed Pages assets/base path, Safari/WebKit, offline cache behavior and provider redirect configuration.

Cloud endpoints remain disabled/placeholders until deliberately configured. No Git push, Pages publication, Worker deployment, remote D1 migration or paid-resource provisioning was performed.
