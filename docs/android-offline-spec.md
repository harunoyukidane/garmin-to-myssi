# Standalone Android APK specification

The app must import Garmin dive files, prepare trip dive records, accept corrections, and generate MySSI import QR codes entirely on an Android phone. The required outcome is transfer without retyping dive measurements. Once installed, it must work with airplane mode enabled and no computer, development server, backend service, login to this app, or subscription. The receiving MySSI app uses its normal user account.

This specification replaces the backend requirement in the README for the Android MVP. It describes required changes; it does not imply that they have been implemented.

## Scope

The complete MVP supports local Garmin FIT and CSV files, trip date filtering, chronological SSI numbering, editable dive fields, persistent local trips, QR import into MySSI, and optional CSV/JSON review export through Android sharing or a user selected save destination.

Garmin account login, Garmin cloud sync, direct watch communication, unverified direct SSI account upload, PDF generation, and iOS delivery are outside this release. QR transfer is required; a manual-entry helper alone is not a complete result. CSV/JSON are optional review copies and must not be described as official SSI import files.

The user obtains Garmin files separately and selects them from the phone. A cloud storage provider may need internet to download a file; files already available locally must work offline. Choosing an online destination in Android sharing is outside the app's offline guarantee.

## Required user flow

1. Open the installed app directly into a trip list, with an option to create a trip. Show an empty state on first launch.
2. Enter trip start date, end date, first SSI dive number, and trip time zone offset. Default the offset from the phone when creating the trip, show it explicitly, and preserve it afterward.
3. Select one or more FIT/CSV files using the Android document picker.
4. Show an import result with accepted dives, duplicates, records outside the trip, unsupported files, and parse failures. Errors must identify the file and, for CSV, the row where possible.
5. Show included dives sorted by start instant, numbered consecutively from the chosen first number.
6. Review and correct depth, duration, temperature, location, and notes. Save changes locally and refresh every affected screen.
7. Open MySSI transfer and export all QR images to the gallery. Select each image through MySSI's QR gallery picker, review the populated entry, and save it. A folder export and individual image sharing are also available. Track saved dives using a local checklist. CSV/JSON remain optional review exports.
8. Reopen the app later and continue from saved trips without reimporting files.

## Changes to the current project

| Current location | Required change |
| --- | --- |
| `App.tsx`, `src/screens/SignInScreen.tsx` | Replace the sign in entry point with trip list/create/open actions. Remove account adapter language from the MVP flow. |
| `src/screens/TripSetupScreen.tsx` | Remove sample defaults; support creation and editing of saved trips, strict date validation, and an explicit time zone offset. |
| `src/services/tripDraft.ts` | Remove production sample data. Retain examples only as development/test fixtures. |
| `src/services/api.ts` | Replace HTTP operations with local application services. Remove the API base URL requirement and unused network helper. |
| `src/screens/DiveListScreen.tsx` | Load saved trip dives, import files, show import results, filter, deduplicate, and number actual records. |
| `src/screens/DiveDetailScreen.tsx` | Read the latest saved dive by ID and expose all supported correction fields. Treat zero as a value rather than missing. |
| `src/screens/FieldCorrectionScreen.tsx` | Validate and persist the correction before navigating back. Show save failures and retain unsaved input. |
| `src/screens/ExportScreen.tsx` | Generate real files from the latest saved records and invoke save/share actions. |
| `src/navigation/types.ts` | Pass `tripId` and `diveId` instead of record snapshots so navigation cannot preserve stale edits. |
| `backend/parsers`, `backend/modules` | Move reusable processing into `shared` modules with no HTTP, server runtime, or storage dependencies. Implement FIT parsing. |
| `backend/routes`, `backend/index.ts`, `backend/types.ts` | Remove from the Android execution path. Delete obsolete scaffold code after local replacements are complete. |
| `shared/types.ts`, `shared/validation.ts`, `shared/ssi-mapper.ts` | Add persistent identities, import provenance, time zone handling, strict validation, and explicit export units. |
| `README.md`, `eas.json`, Android configuration | Document and build a standalone release APK. Replace instructions requiring a backend URL. |

## Local architecture

Use three layers: screens, local application services, and pure parsing/mapping functions. Screens call services directly. No internal HTTP server or embedded Node server is required.

Suggested modules:

- `src/services/tripService.ts`: create/open/update trips, reconcile imports, apply corrections, and prepare exports.
- `src/services/fileImport.ts`: document selection, file reads, parser dispatch, and import result reporting.
- `src/services/localStore.ts`: versioned persistent storage and recovery.
- `src/services/fileExport.ts`: local export files and Android save/share integration.
- `src/state/TripProvider.tsx`: current saved state, loading/error state, and refresh after mutations.
- `shared/parsers/`: CSV and FIT adapters.
- `shared/modules/`: normalization, filtering, deduplication, numbering, and export formatting.

Reuse the installed document picker, file system, and sharing packages where suitable. Choose a FIT decoder only after verifying compatibility with the project's React Native runtime and representative Garmin dive files. Replace server `crypto.randomUUID()` assumptions with an ID generator supported on the phone.

## Persistent data and recovery

For this single user MVP, use a versioned JSON store in the app's private documents directory. Store trips, original normalized dive values, corrections, import metadata, and bounded audit metadata. Copy imported source files into app storage so temporary picker permissions and external file deletion do not invalidate saved trips.

Every trip and dive needs an internal stable ID. Garmin activity identity is separate from this internal ID. Record source filename, source identity where present, original units/time information, and the import timestamp. Keep references to source files rather than duplicating large FIT payloads inside navigation state or JSON records.

Serialize writes. Write and validate a temporary store before promoting it, retaining a last known good backup. On startup, recover from the backup after an interrupted or corrupt write and tell the user what was restored. Never silently replace unreadable saved data with an empty store. Use a schema version and explicit migration behavior; an unsupported version must produce a recovery message.

Only report an edit or import as saved after its persistent write succeeds. A failed write must preserve the previous saved state and allow retry. Store no credentials. Deleting a trip must remove its associated records and unreferenced source files after confirmation. Tell users that uninstalling or clearing app data removes local records; export files already saved outside the app remain separate.

## Import requirements

### CSV

Implement quoted fields, escaped quotes, embedded newlines, UTF-8 BOM handling, and CRLF/LF line endings. Validate header mappings and each row before accepting a record. Missing optional measurements may remain empty; an invalid or absent start time must be reported and excluded.

Support documented Garmin CSV layouts backed by representative fixtures. Provide a column and unit mapping step when a layout is not recognized. Never assume that the existing generic header aliases cover every Garmin export. Explicitly interpret duration formats and metric/imperial measurements; convert internal duration to seconds, depth to metres, and temperature to Celsius. Reject ambiguous units or timestamps until the user supplies the necessary mapping.

### FIT

Replace the throwing placeholder with binary decoding for supported Garmin dive activities. Identify dive activity/session boundaries, extract start time and available duration, depth, temperature, and location information, and normalize units. Treat unavailable fields as missing. Do not fabricate values or create dives from ordinary non-dive activities.

Handle corrupt/truncated files, valid files without dive activities, and unsupported FIT messages with clear results. Retain recognized dives when other selected files fail. Full release acceptance requires actual Garmin dive FIT fixtures; CSV-only completion is an intermediate milestone.

### Duplicates and failures

Prefer a stable Garmin activity identity for deduplication within a trip. When unavailable, use a documented fingerprint of the normalized start instant and distinguishing measurements, and report suspected collisions instead of silently discarding uncertain matches. Reimporting an identical file must not duplicate dives or overwrite corrections. Match FIT/CSV versions of the same activity where identity permits; surface uncertain cross-format matches for user resolution.

Import success and failure counts must agree with persisted changes. Allow cancellation without changing saved data. Process files sequentially or in bounded batches and define a size limit with a clear rejection message so a large selection cannot exhaust phone memory.

## Dates and SSI numbering

Validate real calendar dates in `YYYY-MM-DD` format, an end date on or after the start date, and a positive integer starting number. Do not accept dates that JavaScript silently rolls into another month.

Store start instants in UTC. For this MVP, use one explicit fixed UTC offset per trip for filtering, display, and export. Explain the offset in trip setup; trips crossing offset/daylight saving changes require separate trips in this version. A source timestamp without an offset must use a user confirmed source offset before conversion.

Compare the dive's calendar date in the trip offset against the inclusive start/end dates. Sort by start instant with a stable identity tie break, then assign consecutive numbers. Preserve excluded records so changing trip dates can include them later. Reconcile after changing trip dates, offset, starting number, or imported records, and show that numbering may change before saving those trip changes. Corrections to measurements must not affect ordering or numbering.

## Corrections and export

Use one effective record per dive, combining preserved imported values with saved corrections. Lists, detail screens, missing-field checks, and exports must use that same record.

Depth must be finite and nonnegative; duration must be finite and positive. Temperature may be zero or negative but must be finite. Provide duration input in minutes and seconds while storing seconds. Allow optional temperature, location, and notes to be cleared; distinguish clearing from an unchanged field. Record corrected field, old/new value, and timestamp locally.

Generate exports on the phone from the latest committed trip state. Include only dives inside the trip date range. Show missing required review fields: depth, duration, location, or assigned number. Permit an incomplete export after an explicit warning; never claim all dives are ready when fields are missing.

CSV columns: `diveNumber`, `diveDate`, `diveTime`, `utcOffset`, `maxDepthM`, `bottomTimeMinutes`, `waterTempC`, `location`, `notes`. Export date/time in the trip offset, duration as decimal minutes to two places, and blank cells for missing optional values. Quote CSV correctly, support Unicode, and neutralize spreadsheet formula prefixes in user text without changing saved source values.

JSON must include an export schema version, trip configuration/offset, export timestamp, effective normalized dives with duration in seconds, and missing-field information. JSON is a review export, not a full backup/restore feature. Omit raw source payloads and internal audit history.

Use descriptive filenames containing trip dates and a generation timestamp. Sharing cancellation is a neutral result. Handle unavailable sharing, permission denial, and storage failure with retryable messages. Remove `pdf` from the supported format type and remove the misleading text-file PDF branch.


## Required MySSI transfer behavior

Use the observed compact SSI dive-sharing payload: `dive;noid`, `dive_type`, `divetime`, `datetime`, `depth_m`, empty creator name fields, and optional `watertemp_c`. Confirm mapping against public helper source and decode generated QR images independently in tests. Use SSI type values 0 for scuba, 2 for extended range, 4 for SCR, 6 for freediving, and 8 for CCR. Never manufacture site IDs, user IDs, verification, or dive numbers.

QR duration is rounded to whole minutes and depth to one decimal metre. Require valid depth and duration before QR generation. Allow selecting SSI dive type before scanning. FIT apnea and CCR activities must preserve their classification. The QR covers basic measurements; full profiles, free-text site names, notes, and verification are not part of the verified payload mapping. MySSI assigns its own dive number; show the expected number for comparison.

The user confirmed gallery selection and a successful generated QR import on 16 October 2026. Support same-phone use by exporting every included dive as a separate PNG to the gallery or a chosen folder. Include per-file failures, progress and cancellation while preserving completed images. Persist selected SSI dive types and apply them to batch exports. Gallery export uses MediaStore on Android 10+ without read permission and storage-write permission on Android 7–9. The APK generates all QR data locally; MySSI handles the import and any account synchronization. The local saved checklist must be clearly user-confirmed and must not imply receipt from SSI.

Add optional `watertemp_max_c` from maximum observed submerged temperature and `var_watertype_id` 4/5 only for explicit fresh/salt FIT settings. Preserve available GPS coordinates, average depth, surface interval, heart rate, end CNS and oxygen toxicity in details and CSV/JSON. Do not manufacture QR keys for these. Location requires an SSI site ID; Garmin names/coordinates cannot fill it automatically without a site mapping. Basic QR import was confirmed; physical acceptance of the completed APK remains a sideload test.

Reference implementations: https://takken.io/tools/garmin-to-ssi-dive-log-helper/ and https://github.com/webbertakken/takken.io/blob/main/src/domain/diving/ssi/SsiDive.ts.

## APK delivery

Produce a signed release APK containing its JavaScript and assets. Keep an APK preview profile for direct installation, with no development client or development server requirement. Configure a durable release signing key rather than shipping the repository's debug key. Preserve package identity and signing credentials for future upgrades.

No API URL, authentication setup, network call, remote asset, or update check may block launch or core operations. Building the APK may use downloaded build dependencies or an optional cloud build service; running the installed app must not depend on either. Record the actual supported Android minimum version from the final build configuration and test it on the target phone.

## Implementation sequence

1. Extract pure modules, define persistent data/schema, implement local store and service/state layers, and remove production sample data.
2. Implement the trip flow and real CSV import with filtering, deduplication, numbering, and visible import results.
3. Implement saved corrections, MySSI QR payloads and PNG generation, scan/save instructions, a saved-dive checklist, and optional CSV/JSON review export.
4. Implement and verify Garmin dive FIT decoding. This completes the originally specified input formats.
5. Remove obsolete backend/API/PDF paths, update documentation, configure release signing, build the APK, and perform device acceptance.

## Acceptance criteria

| Check | Required result |
| --- | --- |
| First launch offline | Install the release APK, enable airplane mode before first launch, and create a trip without a computer/server. |
| Real imports | Import representative local Garmin CSV and dive FIT files; values match the fixtures and expected units. |
| Time boundaries | Dives near midnight and on the first/last trip dates are included consistently in the configured trip offset; invalid dates are rejected. |
| Repeat imports | Import an identical file twice; counts and numbering remain unchanged and corrections survive. Test cross-format matches and collisions separately. |
| Corrections | Edit each supported field, navigate away, force stop, and reopen; the same values appear in review and export. |
| Persistence recovery | Simulate an interrupted write and corrupt primary store; recover the backup with a visible message and no silent reset. |
| Error handling | Malformed CSV/FIT, non-dive FIT, unsupported files, canceled selection, and denied/failed storage operations leave existing saved trips intact. |
| Export | Create and save/share CSV and JSON offline; read them independently and verify values, numbering, units, Unicode, quotes, newlines, missing values, and formula handling. |
| MySSI transfer | Scan a generated code into a current recreational MySSI account and verify populated date/time, type, depth, duration, and temperature without retyping. Saving the entry remains an explicit MySSI user action. |
| QR image validity | Save/share a PNG and independently decode its payload; quiet zone and contrast remain intact. |
| Release independence | Stop Metro and any backend, disconnect the development computer, restart the phone, and repeat the complete import/edit/export workflow. |
| Upgrade | Install a newer APK with the same package/signing identity; existing trip data remains readable. |

Automate parser, validation, time boundary, deduplication, correction, persistence recovery, and export checks with meaningful fixtures. Run TypeScript checking and the release build, then complete the physical Android checks above. Deliver the APK, installation instructions, supported input layouts, and acceptance results together.
