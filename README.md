# Dive Log Transfer

Standalone Android app that reads Garmin dive exports and creates MySSI dive QR codes, so recorded date/time and measurements can be imported without retyping. CSV/JSON remain optional review exports. All import, trip storage, corrections, numbering, and export processing run on the phone. This app needs no backend, login, API URL, Expo Go, computer, or internet connection after installation. Importing into MySSI uses your normal MySSI account.

## Use the app

1. Create a trip with its dates, first SSI dive number, and fixed UTC offset (Singapore is `480` minutes).
2. Import local Garmin `.fit` or `.csv` files, up to 20 MB each. Each file is saved separately when you tap **Import this file**.
3. For CSV, confirm the exact column names and units. Time values without an offset use the displayed trip offset.
4. Review included dives and edit depth, duration, temperature, location, or notes. Changes save before leaving the editor.
5. Choose **Transfer dives to MySSI → Export all QR codes to gallery**. Open MySSI's QR scanner, select a saved image from the gallery, review the populated dive, and save it. Repeat for each dive. You can also export to a folder or share individual PNGs. Use the local saved checklist to track progress.
6. Save CSV/JSON as optional review copies. Missing review fields produce a warning before those exports.

Trips survive normal app restarts. Uninstalling or clearing app data removes saved trips and imported source files. Exports saved outside the app are independent. JSON exports contain effective dive records, not a restorable backup of source files and correction history.

A file stored only in a cloud provider must be downloaded before importing offline. Sharing through another app may require that app's network connection. This app does not log in to Garmin, communicate with a watch, upload directly to an SSI account, or generate PDF files. QR import happens inside MySSI when you scan and save.

## MySSI QR transfer

QR generation works offline and requires no professional account. The app uses the compact dive-sharing field format found in the public Garmin helper. It encodes date/time in the trip offset, dive type, duration rounded to whole minutes, depth rounded to one decimal metre, available minimum/maximum submerged temperature, and explicit fresh/salt water type from FIT settings. Scuba, extended range, SCR, freediving, and CCR types can be selected and saved on the transfer screen. Batch export uses those saved choices. FIT apnea and CCR activities select the corresponding type automatically. CSV rows with a recognized Activity Type also select a type; otherwise check the default Scuba selection.

The user confirmed on 16 October 2026 that MySSI can select a QR image from the phone gallery and successfully imported our sample QR. Batch export creates one numbered PNG per included dive in **Pictures/Dive Log Transfer**. On Android 10 or newer, saving our images does not request access to existing photos. Android 7–9 needs storage-write permission; the folder export remains an alternative. Batch failures identify affected dives and preserve successfully saved images. Cancellation stops before the next image. Exporting does not save dives in MySSI automatically; select and save each image there.

The known QR format requires a numeric SSI site ID for location. Garmin GPS and free-text names cannot be converted into that ID offline without an SSI site dataset. GPS, average depth, surface interval, heart rate, CNS and oxygen-toxicity values are retained when available, shown in dive details, and included in CSV/JSON exports; they have no confirmed QR mappings. The QR does not contain a full depth profile, notes, buddies, or verification. MySSI assigns the final dive number. The app shows your expected number for comparison. The saved checklist is your own record, not an acknowledgment from MySSI, and cannot detect duplicates in SSI.

Format references: [Garmin helper](https://takken.io/tools/garmin-to-ssi-dive-log-helper/) and its [SSI field mapping](https://github.com/webbertakken/takken.io/blob/main/src/domain/diving/ssi/SsiDive.ts). Basic QR acceptance has been confirmed by the user. The installed APK's import/gallery flow still requires sideload testing; no Android device was connected during development.

## Input formats

FIT files are decoded locally using Garmin's official `@garmin/fitsdk`. The adapter supports diving session summaries and individual dive lap summaries, checks CRC integrity, ignores non-dive activities, and reports unsupported summaries. Missing measurements remain empty. Apnea activities without identifiable dive summaries are rejected rather than merged into a fabricated dive.

CSV supports UTF-8/BOM, quoted cells, embedded newlines, CRLF/LF, and escaped quotes. The mapping form accepts any header names. Suggested mappings recognize `startTime`, `startedAt`, or `Date`, and explicitly named measurements such as `durationSec`, `maxDepthM`, and `waterTempC`. Generic Garmin headings must be confirmed manually. Available units are seconds/minutes/clock duration, metres/feet, and Celsius/Fahrenheit.

Start times must use `YYYY-MM-DD HH:mm[:ss]` or the equivalent ISO form with `T`, with an optional `Z` or numeric offset. Clock duration accepts `mm:ss` or `hh:mm:ss`. Invalid rows are reported while valid rows can be imported. For example:

```csv
startTime,durationSec,maxDepthM,waterTempC,locationName,notes
2026-05-23T08:00:00+08:00,1800,24.3,28,House Reef,First dive
```

Dives are filtered using inclusive dates in the trip offset and numbered chronologically. Records outside the dates stay saved so adjusting the dates can include them. Identical activities are skipped; differing records with the same start time are reported as uncertain matches. Choose **Import uncertain matches as separate dives** only when they are different dives. Conflicts on the same explicit source activity ID preserve the existing dive and corrections.

CSV export headers explicitly identify metres, Celsius, and decimal minutes. Date/time uses the trip offset. User text that could be interpreted as a spreadsheet formula is escaped in CSV; JSON preserves the text unchanged.

## Development and checks

Use Node.js 22.15 or newer, install dependencies, then run:

```powershell
npm ci
npm run typecheck
npm test
npm run bundle:android
```

`npm start` starts Metro for development. The installed release APK does not need Metro. `npm run native:generate:android` explicitly regenerates the native project and may overwrite native configuration; it is intentionally separate from the APK build.

The automated suite covers parsing/units, FIT binary messages, corrupted files, time boundaries, deduplication, corrections, export escaping, serialized storage, backup recovery, future schema protection, SSI payload mapping, and independent decoding of the generated PNG QR images. FIT fixtures in the suite are generated with the Garmin SDK. Actual watch exports and physical device checks remain separate release acceptance work.

## Build and install the APK

On Windows, install an Android SDK with platform 35/build tools 35.0.0, NDK 26.1.10909125, a JDK compatible with Gradle (17 is used when installed), and PowerShell 7. Set `ANDROID_HOME` to the SDK path if it is not under `%LOCALAPPDATA%\Android\Sdk`. Then run:

```powershell
npm run build:android
```

The script generates a private release signing key on first use and reuses it for subsequent builds. Keep secure backups of **both** `android/release.keystore` and `android/signing.properties`; neither is tracked by Git. Future APK updates require the same key. An existing debug-signed installation must be removed before installing this release-signed app, which clears its local data.

The verified deliverable is `dist/DiveLogTransfer-0.2.0.apk`, with a SHA-256 file alongside it. The script verifies signing, package identity, bundled JavaScript, and absence of the INTERNET permission before copying it there. Copy it to the phone, open it, and allow installation from the app used to open the APK when Android prompts. The configured minimum is Android 7.0 (API 24).

Build dependencies may require internet on the build computer. Android app updates are disabled; the release contains the JavaScript and assets it needs. The EAS preview profile is retained for an optional cloud build, but local signing instructions above are the supported build path for this checkout; cloud signing requires its own configuration.

## Project structure

- `src/screens/OfflineScreens.tsx`: saved trip, import, review, correction, and export screens.
- `src/state/TripProvider.tsx`: local application state and serialized user operations.
- `src/services`: document selection, source copies, persistent store, file export, and Android sharing.
- `shared/model.ts`, `shared/domain.ts`: data model and pure trip/correction/export rules.
- `shared/parsers`: CSV and Garmin FIT decoding.
- `shared/ssiQr.ts`: compact SSI dive payload and offline PNG QR encoding.
- `src/services/ssiTransfer.ts`: QR image saving and sharing.
- `shared/repository.ts`: versioned storage, serialized writes, validation, and recovery.
- `tests`: automated behavioral tests, including synthetic FIT binaries.
- `docs/android-offline-spec.md`: implementation and acceptance requirements.

Saved data uses schema version 1 in the app's private documents directory. A validated temporary write and last saved backup protect against interrupted promotion. Unsupported schemas or unreadable primary and backup data block writes and preserve the files for recovery.

The Windows build script uses a project-local temporary directory because Java local sockets can fail with redirected Windows temporary paths. If Gradle reports `PKIX path building failed` on a network that uses Windows-managed trust roots, retry with `npm run build:android -- -UseWindowsTrustStore`. This uses Windows trusted certificate authorities and keeps TLS certificate verification enabled.
