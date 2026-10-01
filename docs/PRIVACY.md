# Privacy

Signal Tracker records only the data needed for an explicit field session: advertised BLE identity/name/services and RSSI, receiver power and optional frequency, timestamp, GPS accuracy/position, heading, route, waypoints and user notes. External metadata is bounded to simple strings. It does not obtain BLE MAC addresses, phone contacts, Wi-Fi passwords, cellular traffic or covert person identifiers.

## Local data

Native session data, settings, beacons, bookmarks, receiver configurations and pending uploads live in the app's Application Support directory. Writes are atomic and use iOS file protection. Bridge and OIDC tokens use device-only Keychain access when unlocked, outside exports. Protected app files can participate in the user's ordinary device backup policy; they are not a secure-erasure system.

The website stores recordings and settings in IndexedDB on its own origin. Browser storage is not encrypted by this application and can be cleared/evicted by the browser or read by someone with access to the browser profile. OAuth access tokens remain in memory; PKCE state is temporarily stored in sessionStorage and removed after callback/sign-out. Static shell files are cached for offline use.

There are no analytics, advertising scripts, remote fonts, hidden uploads or automatic emergency messages. Online MapKit terrain requests are an optional network surface; choose the coordinate-only map to avoid basemap requests. OIDC sign-in and explicitly configured receivers contact their configured services.

## Optional cloud data

Only an explicit authenticated upload sends recordings. The Worker stores the complete exported session, a pseudonymous issuer/subject-derived owner key and summary timestamps. It does not store account credentials or raw subject identifiers. Cloudflare and your identity provider have their own infrastructure logs and retention policies; the application cannot control those. The application logs only generic request failures, not tokens, GPS coordinates, RF packets or notes.

Disable synchronization to prevent new requests. Delete one local session to remove it and its pending upload. Delete all local history to remove sessions, beacons, bookmarks, imported public layers (web) and the pending queue. Native receiver configuration is removed separately from Receiver Devices; sign-out clears its OIDC credential. Device exports and previously shared files remain wherever you saved them.

Local deletion does not delete cloud copies. **Delete my cloud history** is a separate authenticated action. It removes the owner's D1 records; backup/infrastructure retention follows the deployment operator's policies. Downloading a cloud copy later can recreate a locally deleted session. Export files contain precise locations and identifiers; review them before sharing.

The project is for owned beacons, authorized equipment and permitted public information. It contains no private API bypasses, interception/decryption workflow or covert tracking mode. Permission prompts and denied/approximate states remain visible.
