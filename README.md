# Dive Log Transfer

Android app for importing Garmin dives and generating MySSI QR images. Local import, corrections, saved data and QR generation work offline. Garmin sync and geographic/weather lookups need internet. No phone-location permission is used.

## Use the app

1. Create a trip with inclusive start/end dates. **Global SSI QR Settings** are copied into new trips.
2. Import Garmin FIT/CSV files or ZIP exports, or connect Garmin using **Garmin Connection** on the home screen and sync from the trip. CSV requires column/unit confirmation. Offset-free CSV timestamps initially use the displayed fallback offset; geographic lookup subsequently interprets the original wall clock once in the resolved zone.
3. GPS enrichment starts after import or sync. Review each dive from its trip list. Depth, duration, water temperature, location and notes remain editable. The same screen includes Garmin details, QR conditions, manual air-temperature/time-zone corrections, location candidates and a QR preview.
4. **Trip Settings** combines dates, optional destination, time-zone correction, QR defaults and manual trip air temperature. **Apply global settings** loads the current global defaults; save to apply them without replacing dive corrections.
5. Use **Fetch historical air temperatures** or **Retry unresolved lookups** on the trip screen. Failed lookups leave imported dives usable. Retrieved values persist for offline generation. Manual dive temperatures, including an explicit blank, take priority; a manual trip temperature takes priority over historical values. Clear the trip temperature to return to historical values.
6. Select **Export all QR codes to gallery** on the trip screen. Progress, cancellation and individual failure reports remain available. In MySSI, open its QR scanner, select each saved image from the Dive Log Transfer album, review and save it.

Dives are labeled Dive 1, Dive 2, etc., in chronological trip order. PNG filenames include this sequence and the original UTC timestamp. MySSI assigns its own numbers. Existing numbering, saved-checklist and type-override fields remain loadable but no longer drive the app. Types come from imported Garmin classification: scuba, freediving or CCR. CSV/JSON review export, folder export and individual QR save/share have been removed.

Trips and source files survive restarts. Uninstalling or clearing app data removes them. Keep the same Android signing key for upgrades. Generated images are independent copies; editing a dive cannot update an existing image or MySSI entry.

## GPS, time zones and historical weather

FIT and mapped CSV retain complete entry/exit coordinate pairs. Selection uses valid entry, then exit, then legacy latitude/longitude. A missing-GPS dive uses the nearest-in-time GPS-bearing dive in the same trip for weather/time zone, and only broad geographic names. If no dive has GPS, Trip Settings exposes **Destination** with a search-and-select flow.

OpenStreetMap/Overpass returns named dive sites, reefs, beaches, bays and islands/areas. Shops and centres are excluded. Ranking uses proximity and available boundaries; dive-site matches beyond 500 metres are rejected. Close competing names require selection; names stay editable. The app batches nearby OSM lookups, serializes requests at least five seconds apart and caches query responses in memory for a day. Chosen OSM names and enrichment persist locally. Missing results can be retried. A readable name is a local reference and cannot populate an SSI site ID.

Open-Meteo resolves geographic IANA time zones. JavaScript Intl applies the zone on the actual dive date, including DST, for review, trip filtering and QR generation. The original imported timestamp is preserved. Missing/invalid replacements retain the trip offset. CSV wall times that do not exist during a DST transition retain their original import instant and need manual review. Repeated DST wall hours use the deterministic zone interpretation; verify the source offset for such CSV records.

Historical hourly air temperature uses the selected dive coordinates and UTC dive hour. Dives at the same point/date share a full-day response. Older dates use Open-Meteo Archive; recent dates use explicitly requested historical dates from Forecast. A missing historical hour stays blank, with retry available. Current phone weather is never substituted. Garmin water temperatures stay unchanged. Fully resolved lookups are reused across restarts; failed lookups are eligible for retry.

Lookup requests send coordinates, dive dates and optional destination text to the relevant providers. Attribution: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Open-Meteo](https://open-meteo.com/) (CC BY 4.0), [GeoNames](https://www.geonames.org/). Optional Google fallback setup and limits are in [enrichment configuration](docs/enrichment.md).

## Garmin connection and input files

The optional Personal API key is validated before being saved in Expo SecureStore. Replacing a key preserves the working key on failure. Disconnect clears local credentials and in-memory tokens; imported dives stay. Revoke the key separately in Garmin Connect. Never put credentials in chat or source code.

Sync queries the trip window plus a one-day margin and parses original FIT archives. All supported dives in returned activities are retained so GPS-derived date filtering can include boundary dives later. Repeat sync preserves corrections and reports conflicts. Cancellation retains committed activities. Failed activities can be retried. Real-account feasibility and installed-phone acceptance remain separate checks; see [Garmin sync validation](docs/garmin-sync-validation.md).

FIT decoding uses Garmin's official SDK, checks CRC integrity, handles session/lap summaries and retains supported measurements. CSV supports UTF-8/BOM, quoting, multiline text, explicit unit mapping and optional coordinate columns in degrees. Timestamp format is `YYYY-MM-DD HH:mm[:ss]` or ISO with optional Z/numeric offset. Duration units are seconds/minutes/clock, depth metres/feet, temperature Celsius/Fahrenheit.

Source files are limited to 20 MB each. ZIP limits: 32 MB compressed, 128 entries, 80 MB extracted, 200:1 compression ratio. Encrypted, unsafe paths, symlinks, ZIP64 and nested archives are unsupported. Imported files are copied into private app storage.

QR payloads include verified date/time, Garmin-derived type, rounded duration/depth, recorded water-temperature range/fresh-salt setting and configured conditions/air temperature. Location names, GPS, profiles, notes, heart rate, oxygen exposure, buddies and verification have no confirmed QR mappings. Missing location never blocks QR export. The user previously confirmed basic generated QR import through MySSI's gallery picker; the updated installed-app flow still requires phone acceptance.

## Development and checks

Use Node.js 22.15 or newer, install dependencies, then run:

```powershell
npm ci
npm run typecheck
npm test
npm run bundle:android
```

`npm start` starts Metro for development. The installed release APK does not need Metro. `npm run native:generate:android` explicitly regenerates the native project and may overwrite native configuration; it is intentionally separate from the APK build.

The automated suite covers parsing/units, FIT binary messages, corrupted files, time boundaries, deduplication, corrections, geographic time zones, historical weather, serialized storage, backup recovery, future schema protection, SSI payload mapping, and independent decoding of the generated PNG QR images. FIT fixtures in the suite are generated with the Garmin SDK. Actual watch exports and physical device checks remain separate release acceptance work.

## Build and install the APK

On Windows, install an Android SDK with platform 35/build tools 35.0.0, NDK 26.1.10909125, a JDK compatible with Gradle (17 is used when installed), and PowerShell 7. Set `ANDROID_HOME` to the SDK path if it is not under `%LOCALAPPDATA%\Android\Sdk`. Then run:

```powershell
npm run build:android
```

The script generates a private release signing key on first use and reuses it for subsequent builds. Keep secure backups of **both** `android/release.keystore` and `android/signing.properties`; neither is tracked by Git. Future APK updates require the same key. An existing debug-signed installation must be removed before installing this release-signed app, which clears its local data.

The 0.4.0 build target is `dist/DiveLogTransfer-0.4.0.apk`, with a SHA-256 file alongside it. The script verifies signing, package identity, bundled JavaScript, and the INTERNET permission needed for optional Garmin sync. Remote updates remain disabled. Copy a successfully built APK to the phone, open it, and allow installation from the app used to open the APK when Android prompts. The configured minimum is Android 7.0 (API 24). See `docs/release-validation.md` for validation status.

Build dependencies may require internet on the build computer. Android app updates are disabled; the release contains the JavaScript and assets it needs. The EAS preview profile is retained for an optional cloud build, but local signing instructions above are the supported build path for this checkout; cloud signing requires its own configuration.

## Project structure

- `src/screens/OfflineScreens.tsx`: saved trip, import, review, correction, and gallery export.
- `src/state/TripProvider.tsx`: local application state and serialized user operations.
- `src/services`: document selection, source copies, persistent store, Garmin sync, enrichment and gallery export.
- `shared/model.ts`, `shared/domain.ts`: data model and pure trip/correction rules.
- `shared/parsers`: CSV and Garmin FIT decoding.
- `shared/ssiQr.ts`: compact SSI dive payload and offline PNG QR encoding.
- `src/services/ssiTransfer.ts`: batch QR gallery export.
- `shared/repository.ts`: versioned storage, serialized writes, validation, and recovery.
- `tests`: automated behavioral tests, including synthetic FIT binaries.
- `docs/android-offline-spec.md`: implementation and acceptance requirements.

Saved data uses schema version 2 in the app's private documents directory. A validated temporary write and last saved backup protect against interrupted promotion. Unsupported schemas or unreadable primary and backup data block writes and preserve the files for recovery.

The Windows build script uses a project-local temporary directory because Java local sockets can fail with redirected Windows temporary paths. If Gradle reports `PKIX path building failed` on a network that uses Windows-managed trust roots, retry with `npm run build:android -- -UseWindowsTrustStore`. This uses Windows trusted certificate authorities and keeps TLS certificate verification enabled.
