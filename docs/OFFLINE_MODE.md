# Offline operation

The iPhone records independently of the API. Internet loss never blocks a BLE hunt or breadcrumb route. GPS can work without cellular service when the device can obtain a satellite fix; availability and acquisition time still depend on the environment.

| Capability | Without internet |
| --- | --- |
| BLE advertisements/RSSI | Foreground scanning with Bluetooth permission |
| GPS breadcrumbs/heading | Foreground public location APIs with permission and usable fixes |
| Hunt graphs and estimated regions | Local processing of retained observations |
| Return to Start and waypoints | Local coordinates and breadcrumb route |
| Sessions, notes, beacons, bookmarks and exports | Local file/IndexedDB persistence |
| External RF receiver | Requires a working local trusted HTTPS link; internet is unnecessary for LAN transport |
| Terrain basemap | MapKit may have opportunistic cached content, without an offline download guarantee |
| Coordinate map | Built-in offline renderer needs no terrain tiles |
| Sign-in and cloud transfer | Unavailable; recordings and pending uploads stay local |
| Web dashboard | Production shell works after successful precaching; first load needs internet or a local server |

## Route quality

Native fixes must be fresh (within approximately 15 seconds), valid and no worse than 65 m horizontal accuracy for route capture. The app ignores tiny movements and records timestamps. A gap over 30 seconds or implausible displacement starts a new segment; distances, map lines and GeoJSON exports do not connect across that gap. These are observations, not inferred missing trail sections.

The coordinator checkpoints approximately every three seconds and at stop/background transitions. An interrupted session is recovered through its last persisted observation. Leaving the app stops foreground collection. No background continuation or automatic restart is promised.

`NWPathMonitor` indicates that a network path is available, rather than verifying internet access or cellular coverage. When it becomes unavailable, a recent observed-online fix may be saved as **Last connectivity observed here**. It never promises that service still exists at that point.

## Mapping provider seam

`MapProvider`/`OfflineTileProvider` separates mapping from acquisition. The current production-capable offline layer is a north-up coordinate renderer. A licensed offline terrain provider can supply cached tiles through the provider interface, but no automatic MapKit tile download, third-party tile scraping or terrain pack is implemented. Complete provider integration and license review before distributing terrain downloads.

## Queue and recovery

Explicit sync writes the upload queue before sending recordings. Success removes an ID; failure/cancellation leaves it pending. Retry is manual after connectivity/sign-in returns. Local sessions can still be exported while the cloud is unreachable. Note edits are marked pending and protected from cloud download replacement. Cloud transfer and destructive history operations are serialized.

The browser's production service worker precaches only shell HTML/JS/CSS, uses network when available and falls back to cached files. IndexedDB preserves local records independently. Private browsing, eviction, cleared site data or disabled service workers can remove this capability. Keep exported backups; neither browser cache nor a signal map should be the sole wilderness navigation resource.
