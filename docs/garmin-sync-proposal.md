# Garmin dive sync proposal

Date: 27 October 2026
Status: Implemented in source for 0.3.0; real-account feasibility and installed-device acceptance outstanding. See [validation notes](garmin-sync-validation.md).

The app should let the user open a trip and tap **Sync Garmin** to download and import its dives. Downloading individual activities, extracting ZIP files, and importing each file separately would become one operation. The user has confirmed they can create a Garmin Personal API key.

Build this as an optional connection directly from the phone to Garmin. Keep saved trips, local file import, corrections, and SSI QR generation available offline. First verify access to a real dive through the official API; then build the complete batch flow.

## Proposed scope

The first release supports one personal Garmin account, a user initiated sync for the open trip, automatic FIT download and ZIP extraction, duplicate handling, progress, cancellation, and retry. It also adds local import of multiple ZIP files as a fallback.

Scheduled background sync, direct watch communication, Garmin password login inside this app, a backend service, and automatic saving into MySSI are outside this proposal. The existing gallery QR transfer remains the final step into MySSI. Distribution as an integration for other users requires a separate assessment of Garmin's business program.

## Garmin connection

Garmin's Personal API is intended for an individual's own data. The user creates a key while signed into Garmin Connect. The app exchanges that key for an access token; tokens last up to 24 hours, and the app obtains a replacement using the key when needed. Personal keys have a selected expiry and can be revoked. These are supported authentication capabilities, rather than a promise that every dive is downloadable. See the [official Personal API FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/).

Garmin's [official reference client](https://github.com/garmin/connect-personal-api-python) demonstrates activity queries with date filters and activity file downloads. Actual dive visibility, available history, response formats, pagination, regional availability, and request limits must be established during the feasibility milestone.

### First connection

1. Open **Settings → Garmin connection** and choose **Create a Garmin API key** to open Garmin's website.
2. Create a key and paste it into the app's masked key field.
3. Tap **Connect**. The app requests a token and checks that activity access works.
4. Show **Connected** only after validation and secure storage both succeed. On failure, show the reason and allow retry.

Use `expo-secure-store`, which is already a project dependency, for the key. Keep short lived tokens in memory where practical. Never put credentials in trip JSON, exported files, logs, crash messages, repository files, or navigation parameters. The user enters the key on the phone; sharing it in chat is unnecessary.

Settings must support replacing the key and disconnecting. Disconnect removes local credentials and tokens while retaining imported dives. Explain that revoking access at Garmin is a separate action, with a link to the key settings. A key replacement must validate successfully before replacing a working saved key. If a different account is connected, scope remote activity identities to that account without discarding earlier imports.

## Trip sync experience

1. The user opens a saved trip and taps **Sync Garmin**. If unconnected, complete connection first and return to the trip.
2. Show the trip's date range and UTC offset. Use these to find candidate activities, requesting a broader range if necessary and applying the exact trip boundaries locally.
3. Retrieve every required page of activities. Identify dive candidates using verified Garmin activity types; use FIT parsing to determine supported dive records.
4. Download candidate activity files, extract supported FIT entries, and pass them through the existing parser and import rules. Handle every supported dive in a file, including multiple summaries belonging to one activity.
5. Save each successfully processed activity before marking it complete. An activity that yields several dives should commit its accepted records together.
6. Show a summary such as **12 dives added · 3 duplicates skipped · 1 activity failed**. Distinguish activity counts from dive counts throughout the UI.

Display progress by stage: **Finding dives**, **Downloading activity 4 of 12**, **Importing**, then the result. Offer **Cancel** during processing and **Retry failed activities** afterward. Show failures by activity date and identifier, with a readable reason. A successful query with no matching dives gets a clear empty result, distinct from a network or authentication failure.

Use one active sync at a time. Keep the trip settings used for that run fixed until it completes or is cancelled. Serialise persistent writes with existing trip operations so imports cannot overwrite corrections. Returning from a dive trip without internet must still allow all local work.

## Import and duplicate rules

Reuse the existing FIT decoder, normalised measurements, trip date filtering, chronological numbering, and correction model. Downloads must produce the same supported measurements as importing the equivalent original file manually.

Store account identity, Garmin activity ID, download provenance, and per-dive identity separately. One Garmin activity ID must not collapse multiple dives into one record. Keep original source files in private app storage using the existing retention rules.

Repeated sync must add no duplicate dives and must preserve corrections, SSI type selections, and transfer checklist state. Matching across manual imports and API downloads must use the existing identity and fingerprint rules; uncertain matches appear for review. Conflicting source values preserve the existing record and are reported. Do not mark an activity as fully imported when parsing or saving fails.

Each sync should reconcile the requested trip window, rather than relying only on the last successful timestamp. This allows a dive uploaded to Garmin late to appear on the next sync. Remote download metadata may avoid fetching unchanged activities once the API's change signals have been verified. A dive disappearing from Garmin must not delete its saved local copy.

## ZIP import

Accept local FIT, CSV, and ZIP selections, including several ZIPs in one selection. Extract Garmin activity archives automatically and offer a single **Import all** action for supported FIT files. CSV entries retain the required column and unit confirmation when their mapping is ambiguous.

The first release targets ordinary Garmin activity ZIP exports. Full account archives and recursively nested archives are outside scope. Report unsupported contents and preserve successful imports when another file fails.

Use the same extraction service for downloaded archives and local ZIPs. Reject paths that escape the temporary extraction directory, encrypted archives, and malformed entries. Before release, define and enforce limits for compressed bytes, entry count, total extracted bytes, and decompression ratio. Retain the existing 20 MB limit per extracted source file unless representative dive exports justify a change. Check actual extracted sizes as well as archive metadata, and clean temporary files after completion, failure, or cancellation.

## Failures and recovery

| Condition | Required behaviour |
| --- | --- |
| Offline or connection interrupted | Keep saved dives; show retry for unfinished activities. |
| Token expires | Obtain a new token from the saved key and retry once. |
| Key rejected, expired, or revoked | Stop authentication retries and direct the user to replace the key. |
| Request limit reached | Respect server retry guidance with bounded retries and visible status. |
| Garmin temporarily unavailable | Use bounded retries, then leave a retryable result. |
| File corrupt or unsupported | Identify the activity and continue with other valid downloads. |
| Storage write fails or storage is full | Preserve existing data, stop further imports, and identify unsaved work. |
| Cancellation or app termination | Keep committed imports; repeating sync safely reconciles unfinished work. |

Cancellation stops new work and aborts active network requests where supported. Let an in-progress local commit finish safely. Never describe a cancelled or incomplete run as fully successful. Show both the last attempt and last fully successful sync time where available.

## Implementation impact

Add small services for Garmin authentication and API access, bounded archive extraction, and sync coordination. Reuse `src/services/fileImport.ts`, the FIT parser, the domain merge rules, and the repository's serialised persistence. Keep API transport separate from parsing so local ZIP import works without a connection.

Extend saved metadata only as needed for account provenance, activity identities, and resumable results. Any persisted schema change needs a migration that preserves current trips and their source references. Store no credential material in that migration.

The release currently rejects Android's `INTERNET` permission in `scripts/build-android.ps1`. Implementing sync requires adding that permission and updating the build verification and documentation together. The revised guarantee is that network access is optional for local operations. Preserve HTTPS verification, bundled app assets, disabled remote updates, the existing signing identity, and an upgrade path that retains saved trips.

This proposal supplements `docs/android-offline-spec.md`. Its current exclusions for Garmin login/cloud sync and its prohibition on credential storage must be revised when implementation lands, while retaining offline acceptance checks. The installed app is unchanged by this proposal.

## Delivery milestones

1. **Verify one real dive.** Using a key entered through a secure local mechanism, query the user's trip dates, locate a known dive, download its original file, and compare the parsed result with the manual export. Record pagination, history coverage, archive layout, and available identity fields without recording secrets. If dive files are unavailable, document the limitation and retain batch ZIP import as the useful fallback.
2. **Build shared ZIP import.** Add bounded extraction and batch FIT import with progress, partial results, and cancellation. Check representative Garmin exports.
3. **Build Garmin connection and trip sync.** Add secure key storage, API access, date queries, download orchestration, safe reconciliation, and retry.
4. **Verify and package.** Run relevant automated checks, test the signed APK on the user's phone, and verify update installation and offline operation. Update the README, existing spec, and release notes to describe the delivered behaviour.

## Acceptance criteria

- A real trip containing several Garmin dives imports through one sync operation without individual downloads or manual extraction.
- Imported values match manual FIT import, including available dive summaries and measurements; non-dive activities create no dives.
- Trip boundaries work across UTC midnight and the trip's configured offset. Pagination and late uploads do not silently omit dives.
- Repeating sync adds no duplicates or lost edits. Importing the same dive manually and through sync produces a duplicate or an explicit uncertain match.
- Multiple dives from one Garmin activity remain distinct. Conflicts and ambiguous records remain reviewable.
- A failed download, cancelled run, or interrupted app leaves committed dives intact; retry completes remaining work safely.
- Invalid keys, token renewal, rate limits, and storage failures produce actionable results without secret values in diagnostics.
- Multiple local Garmin ZIPs import without manual extraction. Unsafe, oversized, encrypted, and corrupt archives fail within enforced limits.
- Disconnecting clears local credentials and retains imported dives. Key replacement works without clearing trips.
- The release APK updates the existing app without data loss. Local import, review, editing, and QR export work in airplane mode with no Garmin key configured.

The first milestone is complete only after a real account download succeeds. The full feature is complete only after the batch flow and recovery cases pass on the installed Android app.
