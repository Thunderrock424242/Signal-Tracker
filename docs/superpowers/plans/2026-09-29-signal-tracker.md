# Signal Tracker Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks inline. The user explicitly requested continuing through implementation, so do not stop at design artifacts.

**Goal:** Build the usable local-first native/web/backend foundation described in the user's full request.

**Architecture:** SwiftUI mobile acquisition and local storage; versioned JSON models; TypeScript domain library and static Vite dashboard; optional authenticated Workers/D1 sync.

**Tech Stack:** Swift 5.9+, iOS 17+, TypeScript, Vite, Vitest, Playwright, Cloudflare Workers/D1, jose, zod.

**Spec:** `docs/superpowers/specs/2026-09-29-signal-tracker-design.md`

## Global constraints
- Preserve the independent Java starter and any existing files.
- Native iOS must use public APIs and keep signal collection independent of connectivity.
- Label estimated and simulated information; never infer exact distance from RSSI.
- No deployment, Git initialization, receiver discovery, or cloud provisioning is implicit.
- No cloud credentials in static output; optional uploads are explicit and foreground-only.

## Review focus
- Malformed/oversized imports must fail before persistence.
- Sparse, stale, inaccurate, mixed-target or mixed-receiver measurements must not produce confident bearings.
- Failed writes must preserve the previous session; queued sync must survive restart and delete.
- A token for another owner must never access a session even when its UUID is known.
- Empty/offline/permission-denied states must remain useful and disclose missing capabilities.

## Task 1: Interchange and processing
Files: `packages/core/src/{models,geo,estimator,simulation,export,queue,receiver}.ts`, `packages/core/test/core.test.ts`, root npm configuration.
Interfaces: `SessionSchema`, `estimateRegion(samples)`, `smoothRSSI(values)`, `createDemoSession()`, `exportCSV(session)`, `exportGeoJSON(session)`, `SyncQueue`.
- [ ] Write and run failing tests for invalid inputs, geometry, simulation labels, receiver bounds, exports, and durable retries.
- [ ] Implement bounded schemas and replaceable strength-weighted region heuristic.
- [ ] Run domain tests and TypeScript checks.

## Task 2: Native iPhone field app
Files: `ios/SignalTrackerCore/`, `ios/SignalTracker/`, `ios/project.yml`, Swift package tests.
Interfaces: `SignalReceiver`, `RegionEstimating`, `LocalStore`, `FieldModel`, mapping provider and sync client protocols.
- [ ] Add Swift tests for confidence, route, Codable interchange, receiver parsing and storage queue.
- [ ] Implement CoreBluetooth, CoreLocation/heading, network-path status, session coordinator, protected atomic persistence, beacons/bookmarks, receiver manager, estimator and simulator.
- [ ] Build SwiftUI field UI with hunt/map/compass/graphs, wilderness/return/start/waypoints, spectrum/waterfall, sessions/replay/import/export, diagnostics/settings/privacy.
- [ ] Add macOS Swift test and iOS simulator build CI; report local platform limitations.

## Task 3: Optional secure backend and bridge
Files: `backend/src/`, `backend/migrations/`, `backend/wrangler.jsonc`, `bridge/`.
Interfaces: `/v1/sessions`, `/v1/sessions/:id`; version-1 bridge measurements and spectrum.
- [ ] Write failing tests for missing/invalid tokens, per-owner isolation, bounds, CORS and deletes.
- [ ] Implement JWT verification, bounded request reads, D1 owner scope, rate limiting, structured errors.
- [ ] Implement public-client PKCE helpers and reference HTTPS bridge accepting actual stdin measurements.
- [ ] Generate Worker binding types and validate local API behavior.

## Task 4: Static web dashboard
Files: `web/src/`, `web/index.html`, `web/vite.config.ts`, `web/tests/`.
Interfaces: core domain API, IndexedDB session repository, optional OAuth/sync client.
- [ ] Write browser tests for empty state, labeled demo, page navigation, import/export, settings and deletion.
- [ ] Implement responsive instrument UI and all routes, local recordings, map/heatmap/replay, spectrum/waterfall/cursor/peaks, beacons/receiver history and optional public layer.
- [ ] Build, test and visually inspect desktop/mobile layouts.
- [ ] Configure GitHub Pages workflow with configurable base path.

## Task 5: Documentation and final verification
Files: requested `docs/*.md`, `.github/workflows/`, `docs/VERIFICATION.md`, this ledger.
- [ ] Document protocol, setup, permissions, offline boundaries, auth, privacy and hardware restrictions with primary references.
- [ ] Run full available tests, typechecks, production web build, local Worker packaging and browser checks.
- [ ] Review interfaces, fix significant findings, and report exact verified versus unverified scope.

## Execution ledger
- Inspection complete: no Git metadata or nontrivial application source exists.
- Authorization: user's request explicitly says continue through project implementation; design-stage approval pauses are superseded for this request.
- Isolation: edit the user-specified empty project workspace; worktree creation is unavailable without Git.
- Environment: Windows has Node/npm, no Swift/Xcode. Sandbox helper fails with Windows ACL error; approved shell escalation is used for necessary work.
