# Install Signal Tracker from Windows

GitHub Actions builds the iPhone app on a hosted Mac. You download the resulting `.ipa` on Windows, then use AltStore Classic and AltServer to sign and install it with your own Apple account. You do not need to own a Mac. A regular Apple account supports AltStore's free developer route; see [AltStore account and refresh information](https://faq.altstore.io/altstore-classic/your-altstore).

The workflow is supplied locally. No real iPhone IPA has been built or installed yet. Native compilation and physical-device checks remain outstanding.

## 1. Build the iPhone download

Commit and push the complete project source, including `.github/workflows/ios-sideload.yml`, `ios/` and `scripts/`, to your repository. The workflow file must be on the repository's default branch before GitHub offers manual runs. See [GitHub's manual-run instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

1. Open your repository's **Actions** tab.
2. Choose **Build iPhone IPA for Windows sideloading**.
3. Click **Run workflow**, choose the branch containing the complete source, and run it.
4. Wait for a successful run. It tests the Swift core, generates the Xcode project, builds for a real iPhone and packages the unsigned app.
5. Open the completed run and download **SignalTracker-unsigned-iphone** under **Artifacts**. You must be signed into GitHub with repository read access. Extract the downloaded ZIP. See [GitHub's artifact instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts?tool=webui).

The extracted folder contains `SignalTracker-unsigned.ipa` and `SignalTracker-unsigned.ipa.sha256`. The workflow retains downloads for 14 days. If the run fails, inspect its failing step; it has not produced a usable download. The simulator build from the separate verification workflow cannot be installed on an iPhone.

The build uses no Apple credentials or signing secrets. AltStore handles signing later. GitHub Actions availability and billing depend on your repository and account; consult [GitHub's usage documentation](https://docs.github.com/en/actions/concepts/billing-and-usage).

Optional integrity check, from the extracted folder in PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\SignalTracker-unsigned.ipa
Get-Content -LiteralPath .\SignalTracker-unsigned.ipa.sha256
```

Compare the hexadecimal hash values. This checks download integrity; it does not verify app behavior.

## 2. Set up AltStore Classic

Follow the [official Windows installation guide](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows), which supplies the correct Apple dependency downloads and AltServer installer.

1. Install the supported iTunes and iCloud versions, then AltServer. The standard guide uses Apple's direct downloads; it also links instructions for Store-version iCloud.
2. Start AltServer, connect your unlocked iPhone by USB, and trust the computer. Enable Wi-Fi sync in iTunes.
3. Use AltServer's tray menu: **Install AltStore → your iPhone**. Enter your Apple credentials locally when requested.
4. On the iPhone, trust your developer profile under **Settings → General → VPN & Device Management**; the name varies with iOS. Enable **Settings → Privacy & Security → Developer Mode** and complete the restart confirmation.

Use AltStore **Classic** for this route. Signal Tracker requires iOS 17 or newer. Never paste your Apple password into chat, project files or GitHub secrets.

## 3. Install the IPA

Put `SignalTracker-unsigned.ipa` in the iPhone's Files app, for example through iCloud Drive. Open AltStore Classic, go to **My Apps**, tap **+**, and select the IPA. Complete any local account prompts and wait for installation.

Keep AltServer running on your Windows PC while installing or refreshing, with the phone connected by USB or on the same Wi-Fi network. This is the [AltServer connection requirement](https://faq.altstore.io/altstore-classic/altserver).

Open Signal Tracker and try **Home → Load demo** first. Bluetooth and location permissions are requested when you start the relevant features. Follow the [device acceptance checks](VERIFICATION.md) before relying on it outdoors.

## 4. Refresh and update

With a free account, sideloaded apps expire after seven days. Use AltStore's **Refresh All** before expiry while AltServer is reachable. Apple's free-account limit is three active sideloaded apps, including AltStore. See [AltStore's refresh and app-limit documentation](https://faq.altstore.io/altstore-classic/your-altstore).

Refreshing renews signing for the installed version. To install code changes, push the new source, run the build again, download its new IPA and install that through AltStore. Export your hunts as JSON before reinstalling, uninstalling or changing signing identity so you have an independent backup.

## What “Import recording” means

An `.ipa` installs the app. A Signal Tracker `.json` file contains a saved hunt for review and transfer.

After recording a hunt on the iPhone, stop and save it, then use **Saved Hunts → select hunt → Export JSON → Share export**. Transfer that file to Windows. In the dashboard, **Import recording** validates the JSON and saves a local copy containing the recorded measurements, route, notes, estimates and any captured spectrum.

Importing does not start Bluetooth, GPS or receiver collection, and does not require cloud sync. The dashboard accepts the Signal Tracker session format up to 2 MB; arbitrary audio/video recordings, CSV and GeoJSON are not session imports. CSV and GeoJSON are export formats. See [dashboard import details](WEB_DASHBOARD.md).
