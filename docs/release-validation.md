# Android implementation validation - 17 November 2026

PLAN.md app streamlining and geographic/historical-weather enrichment are implemented.

## Completed

- All 54 automated tests pass. Coverage includes imports/ZIP bounds/CRC, sync transactions, duplicate preservation, stored corrections/recovery, legacy schema compatibility, entry/exit GPS priority, missing-GPS fallback, OSM ranking/ambiguity/business exclusion/boundaries, geographic midnight/DST, naive versus explicit CSV timestamps, historical UTC-hour matching, manual temperature precedence/omission, weather failure handling, selected destinations, optional Google proxy filtering/quotas and independent QR PNG decoding.
- npm run typecheck passes.
- npm run bundle:android passes, producing a standalone Hermes bundle in dist/android.
- Navigation has one dive review route, combined Trip Settings and a trip-level gallery export. Separate transfer/review-file routes and their unused services are removed. Global defaults and Garmin connection management remain.
- App phone-location dependencies/permissions are removed; online enrichment uses imported Garmin GPS or a selected destination. Existing signing configuration, package identity and source-file storage are preserved.
- Legacy numbering/checklist/type overrides remain loadable but no longer drive QR behavior. New automatic metadata is validated and saved independently of corrections.

## Device/external acceptance remaining

Signed release APK built as version 0.4.0, Android version code 4: `dist/DiveLogTransfer-0.4.0.apk` (63,823,332 bytes). SHA-256: `355be4dee769d1d8f4bb836f9d9bcde2fd5c23019c5606c4aefd6233a946d2b3`. A checksum file is provided alongside the APK.

Release assembly and vital lint pass. APK Signature Scheme v2 verification passes using the existing project signing key. Package identity is `com.divelogtransfer.app`, minimum API 24, target API 34, with arm64-v8a, armeabi-v7a, x86 and x86_64 included. The APK's embedded Hermes bundle matches the generated release bundle, and all 30 application sources found in its source map match this checkout. Installation and physical acceptance have not been performed.

On the target phone, install over the existing app with the same signing key, verify existing trips/source files/corrections, connect/disconnect Garmin and confirm home status, import real watch exports, inspect location candidates/time zones/weather, test airplane-mode review and gallery export, cancel a batch and verify per-dive errors, and import the generated images in MySSI. Synthetic Garmin FIT fixtures and mocked provider responses underpin automated checks; they do not certify real-provider coverage or installed-screen behavior.

Google fallback is disabled unless an HTTPS proxy is configured. A reference proxy and configuration instructions are in enrichment.md. No Google key, billing setup or public proxy has been provisioned. Provider terms, attribution, quotas, geographic coverage and public-service availability require deployment-specific verification.

The user previously confirmed a basic generated QR image can be selected and imported through MySSI's gallery scanner. The newly consolidated screen flow and enriched values still need physical acceptance. MySSI site IDs, profiles, notes, buddies and verification are not emitted as speculative QR fields.
