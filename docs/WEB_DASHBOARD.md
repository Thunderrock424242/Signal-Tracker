# Dashboard and optional API

The Vite/TypeScript dashboard reviews recordings on desktop and mobile. It starts empty; **Load demo hunt** explicitly adds simulated data. JSON imports, map/heatmap/replay, spectrum/waterfall/cursor/peaks, beacons, bookmarks, receiver history, notes and exports work locally in IndexedDB. No browser RF scanning is performed.

## Import recording

**Import recording** opens a saved Signal Tracker JSON hunt, validates its contents, and copies it into this browser's local history. It restores the recorded measurements, route, notes, estimates and any captured spectrum for review and replay. It does not start a live scan or require an account.

Use **Export JSON → Share export** in the iPhone's Saved Hunts, transfer the file to your PC, then select it in the dashboard. Imports are limited to 2 MB and the Signal Tracker session schema. The recording keeps its session ID; importing that same ID replaces the existing local copy, so export any local edits you want to preserve first. Simulated recordings remain labeled simulated. CSV and GeoJSON are exports, not session import formats; audio and video are unsupported.

## Local development

Use Node 22.12 or newer and the checked-in lockfile:

```sh
npm ci
npm run dev
npm run check
npm test
npm run test:e2e
npm run build
npm run preview
```

Development is served at `http://127.0.0.1:5173`; production preview at `http://127.0.0.1:4173`. With preview running, `npm run test:preview` checks production rendering, persisted sessions and cached offline reload, and writes desktop/mobile screenshots to `.artifacts/`.

Routes use hashes (`#/dashboard`, `#/map`, `#/sessions`, `#/signals`, `#/spectrum`, `#/receivers`, `#/settings`) so static hosting needs no rewrite server. A production service worker caches only the static application shell. It does not cache API responses or tokens. A first successful online load is required; IndexedDB and cache retention depend on the browser.

## GitHub Pages

The repository includes `.github/workflows/pages.yml`, which builds on `main` or manual dispatch and publishes `web/dist`. Set repository **Settings → Pages → Source → GitHub Actions**, following [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). The workflow obtains Pages' base path and passes `PAGES_BASE_PATH` to Vite. Nothing has been pushed or published during this implementation.

To preview a project-path build locally:

```powershell
$env:PAGES_BASE_PATH = '/Signal-Tracker/'
npm run build
npm run preview
# Stop preview with Ctrl+C before clearing the environment variable.
Remove-Item Env:PAGES_BASE_PATH
```

Keep configuration/public client IDs separate from secrets. Never embed private keys, bridge tokens, OAuth client secrets or account tokens in frontend build variables.

## Cloudflare API setup

The Worker is disabled by default and the checked-in D1 ID and OIDC endpoints are placeholders. `/health` reports configuration without requiring an account. To configure your own environment:

1. Authenticate Wrangler to your Cloudflare account and create a D1 database with `npx wrangler d1 create signal-tracker`.
2. Put its actual ID in `backend/wrangler.jsonc`. Set OIDC_ISSUER to the exact issuer, OIDC_AUDIENCE to your API audience and OIDC_JWKS_URL to its HTTPS signing-key endpoint.
3. Set ALLOWED_ORIGINS to exact comma-separated dashboard origins, including any local origin you intend to use. Origins exclude path segments; a Pages project URL uses `https://username.github.io`.
4. Apply the migration locally with the command below. Apply it remotely only when deliberately provisioning the cloud database.
5. Enable SYNC_ENABLED as the string `"true"`, regenerate binding types, verify packaging and deliberately deploy to your account.

```sh
npx wrangler d1 migrations apply signal-tracker --local --config backend/wrangler.jsonc
npm run backend:types
npm run backend:dev
npm run backend:package
```

Remote provisioning/deployment commands, when you intend to publish:

```sh
npx wrangler d1 migrations apply signal-tracker --remote --config backend/wrangler.jsonc
npx wrangler deploy --config backend/wrangler.jsonc
```

These follow the [D1 migration workflow](https://developers.cloudflare.com/d1/reference/migrations/). They were not executed against a cloud account here. Native/browser clients require HTTPS; the default local development API is useful for command-line testing. Use a trusted HTTPS development endpoint for full client integration.

## Authentication and API contract

Use an OIDC provider that supports public authorization-code clients, PKCE S256, browser token-endpoint CORS and RS256/ES256 JWT access tokens. Register the exact dashboard origin/path as its redirect URL and the native callback listed in [iOS setup](IOS.md). Opaque tokens are unsupported. Cloudflare Access can guard deployments, but it is not automatically interchangeable with this OIDC flow; the provider's JWT issuer, audience and key endpoint must match the API.

Browser access tokens remain in memory and expire; reload requires sign-in again. Only temporary PKCE state/verifier is held in sessionStorage during the redirect. Native tokens use device-only Keychain storage. Both clients verify callback state. Server authentication verifies signature, issuer, audience, expiry and required claims.

| API | Operation |
| --- | --- |
| `GET /v1/sessions` | Owner-scoped list, up to 50 summaries, optional opaque `before` cursor and `nextBefore` |
| `GET /v1/sessions/:uuid` | Retrieve one complete recording |
| `PUT /v1/sessions/:uuid` | Idempotently replace the owner's recording after schema validation |
| `DELETE /v1/sessions/:uuid` | Delete one owner-scoped recording |
| `DELETE /v1/sessions` | Delete all recordings for the authenticated owner |

Requests use Bearer access tokens. Upload requires application/json and ≤2 MB. Foreign origins get 403; missing/invalid auth 401; invalid recording 400; oversized body 413; disabled sync 503. The per-owner configured rate is 60 requests/minute. A 429 supplies Retry-After; clients wait up to 60 seconds and retry at most twice per request. Larger histories may take several minutes. Failed uploads remain queued for manual retry. Downloads preserve locally pending edits; other equal-ID sessions are replaced. Export backups before intentionally replacing local copies.

## Public infrastructure overlays

On Signal Map, import a JSON array of up to 500 records (≤500 KB). Each record requires `label: "PUBLIC DATABASE"`, name, latitude, longitude, HTTPS sourceURL and ISO updatedAt. Attribution appears separately from measurements and estimates. No infrastructure is scraped, guessed or silently fetched. Use a dataset whose license allows your intended use.
