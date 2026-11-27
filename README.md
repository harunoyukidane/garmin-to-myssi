# Garmin to MySSI

An Android app that turns Garmin dive logs into QR images you can import into MySSI. The installed app is currently named **Dive Log Transfer**.

Import and review dives, correct measurements, and export QR images offline. Optional Garmin sync, nearby place names, time zones, and historical air temperatures use the internet.

This is an independent community project, unaffiliated with Garmin or SSI.

## Get started

1. Install an APK from this repository's [Releases](../../releases), if available, or build it using the instructions below. Android 7.0 or newer is required.
2. Create a trip and choose its dates.
3. Import Garmin FIT, CSV, or ZIP exports. Confirm CSV columns and units when prompted. Alternatively, connect Garmin in **Garmin & GeoNames settings** and sync from the trip.
4. Review your dives and correct missing or inaccurate details. Automatic place and weather lookups are optional.
5. Choose **Export all QR codes to gallery**. In MySSI, open the QR scanner, select each saved image, review the imported dive, and save it.

Use **Global SSI QR Settings** for defaults on new trips. You can adjust conditions for a trip or individual dive.

## Optional accounts

- **Garmin:** enter your own Personal API key in the app. The settings screen links to Garmin's key page. Keys are validated and saved in the phone's secure storage. Disconnect removes local credentials; revoke the key separately in Garmin Connect.
- **GeoNames:** enter your own username on the same settings screen and enable free web services in your GeoNames account. Leave it blank to use OpenStreetMap.

No account credentials are included in the source. Never paste keys into GitHub issues, source files, or screenshots.

## Data and limitations

- Trips, original imports, and corrections stay on your phone. Uninstalling the app or clearing its data removes them.
- Online lookups send dive coordinates, dates, and optional destination text to the relevant services. The app does not request your phone's location.
- Review dates, time zones, measurements, and lookup results before importing into MySSI. Missing lookup results do not block QR export.
- QR transfer supports core dive fields and configured conditions. GPS, profiles, notes, buddies, and SSI site IDs are not transferred.
- Editing a dive does not update an exported image or an entry already saved in MySSI.
- Android is the supported build path. Device compatibility and Garmin account access may vary; see [release validation](docs/release-validation.md).

## Build from source

Install Node.js 22.15 or newer, then run:

```powershell
npm ci
npm run typecheck
npm test
```

For an Android APK on Windows, install PowerShell 7, JDK 17, and the Android SDK with platform/build tools 35 and NDK 26.1.10909125. Set `ANDROID_HOME` if the SDK is outside its usual location, then run:

```powershell
npm run build:android
```

The APK and SHA-256 checksum are written to `dist/`. The release APK includes its JavaScript and does not need Metro. Keep private backups of `android/release.keystore` and `android/signing.properties`: updates require the same signing key. These files are ignored by Git.

For development, use `npm start`. Check Android bundling with `npm run bundle:android`. If your network uses Windows-managed certificate authorities, build with `npm run build:android -- -UseWindowsTrustStore`.

## Credits and licensing

Geographic data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL), [GeoNames](https://www.geonames.org/) (CC BY 4.0). Weather and time-zone services: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).

This repository does not yet grant an open-source license for its original code. Dependencies retain their own licenses; Garmin's FIT SDK has separate terms. See [licensing guidance](docs/licensing.md) before distributing a build.

More detail: [lookup configuration](docs/enrichment.md), [Garmin sync validation](docs/garmin-sync-validation.md), and [credentials and history cleanup](docs/public-release.md).
