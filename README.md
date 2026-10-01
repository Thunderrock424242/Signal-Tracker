# Signal Tracker

Local-first radio exploration and wilderness navigation for owned beacons and authorized receivers. Native SwiftUI iPhone app, a static GitHub Pages dashboard, and an optional authenticated Cloudflare Workers API.

## Workspace

- `ios/`: native app and portable Swift core package (iOS 17+).
- `packages/core/`: validated interchange models, conservative estimator, simulator, exports, and retry queue.
- `web/`: responsive dashboard; imports real recordings and explicitly labeled demo data.
- `backend/`: owner-scoped, JWT-authenticated session API backed by D1.
- `bridge/`: external receiver reference bridge; never synthesizes live RF readings.
- `docs/`: architecture, operating limits, hardware protocol, setup, and verification evidence.

The placeholder Java/Gradle starter has been replaced with this modular native/web/backend structure.

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
npm run preview
```

## Build the iPhone app

On Windows, use the manual GitHub Actions iPhone build, download its unsigned IPA, then sign and install it with AltStore Classic/AltServer. Follow the [Windows sideloading guide](docs/WINDOWS_SIDELOADING.md). GitHub supplies the build Mac; you do not need to own one.

If you have a Mac, Xcode and XcodeGen can build and install directly; see [iOS setup](docs/IOS.md). The supplied workflows prepare Swift tests, simulator compilation and an unsigned device build. They have not been executed here. No real IPA has been produced; native compilation and physical hardware validation remain outstanding.

## Optional cloud sync

Local operation requires no account. The API is disabled until you configure an HTTPS OIDC issuer, audience, JWKS endpoint, allowed dashboard origin, and D1 database. See [backend setup](docs/WEB_DASHBOARD.md). No account credentials belong in Pages JavaScript. Cloud operations are explicit and foreground-only.

## Documentation

- [Architecture and data ownership](docs/ARCHITECTURE.md)
- [Signal estimation and uncertainty](docs/SIGNAL_ESTIMATION.md)
- [External receiver protocol](docs/RECEIVER_PROTOCOL.md)
- [iPhone build and device setup](docs/IOS.md)
- [Windows iPhone installation with AltStore](docs/WINDOWS_SIDELOADING.md)
- [Dashboard, Pages, authentication and backend setup](docs/WEB_DASHBOARD.md)
- [Privacy and deletion](docs/PRIVACY.md)
- [Offline behavior and mapping boundaries](docs/OFFLINE_MODE.md)
- [Hardware capabilities and acceptance](docs/HARDWARE.md)
- [Verified results and remaining device checks](docs/VERIFICATION.md)

## Accuracy and privacy

RSSI is a measured power indication, not a distance sensor. Regions and bearings derived from movement are always estimates. The heuristic is uncalibrated and deliberately conservative. BLE identifiers are CoreBluetooth identifiers, not MAC addresses. Spectrum requires a connected external receiver. Demo/simulator data is never presented as live. Offline route navigation remains available without map imagery.

See [architecture](docs/ARCHITECTURE.md), [estimation](docs/SIGNAL_ESTIMATION.md), [privacy](docs/PRIVACY.md), and [verification](docs/VERIFICATION.md) before field use.
