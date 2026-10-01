# iPhone setup

The native app targets iOS 17+ and uses SwiftUI, Charts, MapKit, CoreBluetooth, CoreLocation, Network, AuthenticationServices and Keychain. Swift source is supplied; no signed IPA or compiled iOS binary has been produced on Windows.

## Build and install from Windows

Use the [Windows sideloading guide](WINDOWS_SIDELOADING.md). The manual `.github/workflows/ios-sideload.yml` builds on GitHub's hosted Mac, tests the Swift core and packages an unsigned iPhone IPA. AltStore Classic/AltServer on Windows signs and installs it with your own Apple account. No Apple account secret is needed in GitHub. The workflow is prepared but has not run yet.

The packaging utility `scripts/package-ios.py` accepts an already compiled iPhoneOS `.app`; it cannot compile Swift on Windows. Its local tests check archive layout, contents, executable permissions and rejection of simulator or incomplete bundles using fixtures. They do not prove native compilation or installation.

## Build on a Mac

Install Xcode and XcodeGen, select the installed Xcode command-line tools, then run from this repository:

```sh
swift test --package-path ios/SignalTrackerCore
cd ios
xcodegen generate
open SignalTracker.xcodeproj
```

Select your signing team in Xcode, choose a unique bundle identifier if needed, connect your iPhone, and run. XcodeGen reads `ios/project.yml`; the `.xcodeproj` and Info.plist are generated. Change project settings in the YAML source. A signing team and Apple provisioning are required for device installation.

Simulator compilation:

```sh
xcodebuild -project SignalTracker.xcodeproj -scheme SignalTracker \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

`.github/workflows/verify.yml` contains a macOS job for Swift tests and simulator compilation. It has not been run in this session. Simulators do not prove BLE/GPS hardware behavior. The shared demo fixture can be regenerated on any Node machine with `npm run fixtures`.

## First field session

1. Run the app and use **Home → Load demo** to inspect the labeled simulation, or choose Signal Hunter.
2. Request Bluetooth access with **Scan Bluetooth**. Select an advertised device you own. The identifier shown is CoreBluetooth's app-visible UUID, not a MAC address or guaranteed globally stable identity.
3. Start a hunt. Allow location access to attach fresh GPS fixes and record breadcrumbs; power readings can still work when location is denied.
4. Move through several separated positions. The map displays power observations and a dashed estimated region when sufficient geometry exists. The compass reports heading; an estimated bearing appears only when eligible.
5. Stop and save. Open Saved Hunts to replay, add notes or share JSON, CSV and GeoJSON.

In **More → Wilderness**, enable foreground GPS and mark your starting point after a fresh fix. Add waypoints and use Return to Start for straight-line bearing, distance and the breadcrumb route. A straight line may cross impassable terrain. Last connectivity is based on Network path availability, not a confirmed cellular tower or coverage guarantee.

## Permissions and lifecycle

Bluetooth is requested only when scanning starts. Location uses When In Use permission, not Always permission. Denied, restricted, disabled and approximate-location states are shown. Approximate fixes may be too inaccurate for estimation; no permission bypass or forced precision is used. The app requests local-network access when connecting to a configured receiver. Heading availability and accuracy depend on the device.

BLE advertisements and RSSI use Apple's [CoreBluetooth advertisement interface](https://developer.apple.com/documentation/corebluetooth/advertising-data). Location authorization uses [requestWhenInUseAuthorization](https://developer.apple.com/documentation/corelocation/cllocationmanager/requestwheninuseauthorization()).

Collection is foreground-only. Entering the background saves and stops the active session, scans and receiver polling; transfers are cancelled and queued uploads remain durable. Returning to the app does not silently restart collection. The initial implementation deliberately avoids background capability declarations. Battery modes adjust GPS distance filtering and BLE sample throttling; physical battery impact is unmeasured.

## External hardware and account setup

Use **More → Receiver Devices** to enter the receiver ID, name, trusted HTTPS bridge URL and token. Configuration persists locally; tokens persist in Keychain. Reconnect explicitly after a restart. Select the receiver and enter its target signalIdentifier to hunt. See [protocol](RECEIVER_PROTOCOL.md).

Cloud configuration belongs in Settings. Register `signaltracker://oauth/callback` with your OIDC public native client, enable authorization code + PKCE S256, and issue JWT access tokens for the API audience. Enter matching issuer, public client ID, audience and HTTPS API URL. Sign in, then explicitly upload/download completed sessions. No client secret, refresh-token loop or automatic background sync is included. Provider-specific configuration must be tested before use.

Before a real outing, complete the [device acceptance checklist](VERIFICATION.md). Keep an independent map, compass and emergency plan.
