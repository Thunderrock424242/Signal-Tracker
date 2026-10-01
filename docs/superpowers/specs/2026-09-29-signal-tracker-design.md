# Signal Tracker design

## Intent
Build a real foundation for an iPhone field instrument for owned BLE beacons, authorized external RF receivers, and offline wilderness navigation. A static web dashboard reviews recordings; an account is necessary only for optional sync. Estimates, measurements, simulations, and public information remain distinct.

## Repository inspection
The workspace is not currently a Git repository. Its only source is an IntelliJ Java Hello World with Gradle. No existing web, mobile, Cloudflare, authentication, Actions, or application architecture exists. The user subsequently authorized replacing the entire placeholder structure. Remove Java/Gradle scaffolding; preserve unrelated changes. Git metadata and an origin were later added externally and are preserved. Do not publish or provision paid resources implicitly.

## Chosen architecture
Use a monorepo with a native SwiftUI iOS 17 application, a dependency-free Swift core package, a TypeScript interchange/domain package, a Vite static dashboard, and an optional Workers/D1 API. A shared version-1 JSON contract connects Swift and TypeScript. Swift owns mobile acquisition and persistence. TypeScript owns browser validation and API input validation. Estimators use equivalent documented heuristics with deterministic tests; neither reports verified source locations.

Alternatives considered: a web-only scanner fails iOS hardware requirements; a single server-driven app fails offline field use. The chosen separation keeps acquisition independent of the API and allows replacement of estimator, map, and receiver adapters.

## Units and flows
Receiver adapters emit normalized power measurements or spectrum frames. Mobile acquisition attaches only fresh GPS/heading fixes, selects a target, and records raw values into locally persisted sessions. An estimator filters poor or duplicate fixes, separates target/receiver/power domains, and computes a conservative strength-weighted observed region. No single-RSSI range model is used. Minimum sample geometry is required for a derived bearing.

SwiftUI tabs: Home, Hunt, Map, Spectrum, More. More owns beacons, receivers, wilderness, saved hunts, history, settings, diagnostics, and safety. Local storage uses atomic protected files, serialized writes, persistent settings and retry outbox. GPS routes and waypoints work offline. MapKit provides online imagery; a coordinate-only route canvas is guaranteed offline and an offline-tile provider protocol is documented.

The dashboard uses hash routes so every page works under a GitHub Pages repository base path. Local imports are schema-validated and persisted in IndexedDB. No remote tiles are requested by default; a route/heatmap canvas works offline. Spectrum and waterfall consume stored frames, with zoom, pan, cursor, and peaks. Public infrastructure is an explicitly labeled optional imported layer.

## Optional sync and security
Use public-client OIDC authorization-code flow with PKCE. Access tokens remain in browser memory or iOS Keychain. Workers verify JWT signature, issuer, audience, expiry and subject using a configured JWKS endpoint. Store sessions only under a hashed issuer/subject owner key. All SQL uses bindings. Bound input sizes and arrays, rate-limit per owner, restrict CORS origins, and return generic errors. Foreground upload is explicit, retryable, idempotent per session ID, and queued on failure. Delete supports local history and separate explicit cloud deletion.

## Hardware and operating limits
BLE scanning uses CoreBluetooth and user permission. GPS and heading use CoreLocation. This foundation records foreground sessions; it explicitly stops hardware scans on background and saves route state. Background modes, arbitrary RF scanning, private cellular APIs, and hidden upload are not enabled. SDR/ESP32/Pi adapters use authenticated HTTPS polling against a user-configured bridge with normalized versioned payloads. No device integration is claimed without actual hardware testing.

## Verification
TypeScript tests cover schema limits, filtering, smoothing, geometry/confidence, receiver normalization, simulation labeling, exports, persistence retry behavior, and auth/ownership API rules. Swift tests cover estimator, route geometry, serialization, receiver decoding, and local storage/outbox. Browser tests exercise demo/import/export, responsive navigation, spectrum, and local deletion. CI builds Pages and tests/builds the native app on macOS. Record local checks separately from unrun iPhone, macOS, field, RF-hardware, OIDC-provider, and deployed Cloudflare validation.
