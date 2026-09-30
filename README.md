# Signal Tracker

Local-first radio exploration and wilderness navigation for owned beacons and authorized receivers. Native SwiftUI iPhone app, a static GitHub Pages dashboard, and an optional authenticated Cloudflare Workers API.

## Workspace

- `ios/`: native app and portable Swift core package (iOS 17+).
- `packages/core/`: validated interchange models, conservative estimator, simulator, exports, and retry queue.
- `web/`: responsive dashboard; imports real recordings and explicitly labeled demo data.
- `backend/`: owner-scoped, JWT-authenticated session API backed by D1.
- `bridge/`: external receiver reference bridge; never synthesizes live RF readings.
- `docs/`: architecture, operating limits, hardware protocol, setup, and verification evidence.

The pre-existing Gradle/Java starter is preserved. It is independent of Signal Tracker's iOS/web builds.

## Run the dashboard

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Choose **Load demo hunt** to explore clearly labeled simulated data, or import a Signal Tracker JSON recording. The web app does not scan Bluetooth or arbitrary RF.

```sh
npm test
npm run check
npm run build
npm run test:e2e
```

## Build the iPhone app

On macOS with Xcode and XcodeGen, run `cd ios && xcodegen generate`, then open `SignalTracker.xcodeproj`. Select a signing team and a real iPhone. See [iOS setup](docs/IOS.md). Windows cannot compile or sign an iOS app. The macOS CI job runs Swift core tests and the simulator build.

## Optional cloud sync

Local operation requires no account. The API is disabled until you configure an HTTPS OIDC issuer, audience, JWKS endpoint, allowed dashboard origin, and D1 database. See [backend setup](docs/WEB_DASHBOARD.md). No account credentials belong in Pages JavaScript. Cloud operations are explicit and foreground-only.

## Accuracy and privacy

RSSI is a measured power indication, not a distance sensor. Regions and bearings derived from movement are always estimates. The heuristic is uncalibrated and deliberately conservative. BLE identifiers are CoreBluetooth identifiers, not MAC addresses. Spectrum requires a connected external receiver. Demo/simulator data is never presented as live. Offline route navigation remains available without map imagery.

See [architecture](docs/ARCHITECTURE.md), [estimation](docs/SIGNAL_ESTIMATION.md), [privacy](docs/PRIVACY.md), and [verification](docs/VERIFICATION.md) before field use.
