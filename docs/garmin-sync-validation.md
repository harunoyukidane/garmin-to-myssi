# Garmin sync validation — 2 November 2026

## Account identity correction — 17 November 2026

The reported connection error occurred after token exchange and profile retrieval: validation required a numeric account identity, but Garmin's [Personal API schema](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/) defines `UserSettingsDTO` with `displayName` and no numeric account ID. Validation now accepts this account handle as `displayName:<handle>`, while retaining numeric identities for responses already supported. Missing or malformed identities still fail before saving credentials, and activity access is still validated. No credentials or profile responses are logged.

All 39 automated tests and TypeScript checking pass. Regression coverage includes the documented profile shape, empty activity lists, distinct accounts, numeric identity compatibility, malformed handles, unsupported activity responses, secure credential replacement and sync provenance. Real-account reconnection on the phone remains to be confirmed.

The corrected `dist/DiveLogTransfer-0.3.0.apk` was rebuilt successfully on 17 November with the existing signing certificate, package and version. Signature, bundled JavaScript and INTERNET permission checks pass. Install it over the existing app and retry connection. The APK details below describe the original 2 November build.

Implementation target: Android 0.3.0, versionCode 3, existing package and signing identity.

Implemented: optional secure personal connection, full-window activity pagination, original archive downloads, bounded ZIP extraction shared with local multiple-ZIP selection, FIT batch import, account/activity/per-dive provenance, serialized activity commits, migration from schema 1 to 2, progress, cancellation, failure retry and persisted sync results. Offline import, corrections and QR transfer remain independent of the connection.

The automated suite exercises generated ZIPs and synthetic FIT files, transport responses, token renewal, pagination, throttling, migration, duplicate/edit preservation, cancellation and storage failures. It does not establish real Garmin access.

Verified on 2 November 2026: all 38 automated tests pass, TypeScript checking passes, and `git diff --check` reports no whitespace errors. Integration checks exercise secure key replacement/disconnection, native download size guards, manual-versus-sync duplicate matching, multiple dives in one activity, source-value conflicts, and rollback when one FIT in an activity is corrupt. Long server retry guidance stops subsequent activity requests and leaves them retryable.

Signed APK: `dist/DiveLogTransfer-0.3.0.apk` (63,811,220 bytes), package `com.divelogtransfer.app`, versionCode 3. SHA-256: `cbfe49ea20ec2cdb8228370b6f52b1cb1938e32410196c2d0eec5aaee5d66caf`. The build verifies the signature, embedded JavaScript, package identity and INTERNET permission. All 26 bundled application source modules match the final workspace. The existing signing certificate SHA-256 is `d1c311e7f5e77b5dcf326c3a34029b6919ef4d4da3bc997ef0bf9ad42c314ed7`; signing files were reused. Build output is retained in `dist/build-garmin.log`. No Android device was connected during validation.

## Outstanding acceptance

Milestone 1 is **not complete**: no personal key has been entered through the phone and no real-account dive has been downloaded. Test a known dive against its manual export; record available profile identity fields, actual activity types, paging behavior, history, ZIP layout and regional access without recording secrets. The implementation fails closed if account identity or list format is unsupported. All activity files are currently checked through FIT parsing to avoid relying on unverified type names.

Validate on the phone: install over 0.2.0 with the same signature, retain trips/source references/corrections, connect and replace/disconnect keys, sync a multi-dive trip across UTC midnight, repeat after manual import, retry failed downloads, cancel during network and import stages, interrupt/relaunch, test revoked/expired keys and storage exhaustion, then perform local ZIP/CSV/FIT import, edits and QR export in airplane mode with no key configured.

ZIP limits: 32 MB compressed, 128 entries, 80 MB declared total extracted, 20 MB actual per source, ratio 200:1. Validate directory and local headers, paths, encryption flags, symlinks, sizes and output CRC. No ZIP64, multi-disk or recursive archives. Unsupported entries are reported for local imports. Interrupted temporary extraction directories are removed at next app load. Retained sources are separate in private document storage.

Android downloads use Expo's native disk download, pause on cancellation or when advertised/actual progress exceeds 32 MB, and check actual file size before bounded reading. At least 32 MB free temporary storage is required before starting. Temporary downloads are deleted on all exit paths and stale directories are removed on next load. Real-phone memory behavior still needs checking with representative exports.
