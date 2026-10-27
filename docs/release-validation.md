# Android 0.2.0 validation — 16 October 2026

Deliverable: `dist/DiveLogTransfer-0.2.0.apk` (63,759,676 bytes).

SHA-256: `478750f02295ae55c20d4b7f27eea5a197ab2f115ee290218715923a874fd379`.

Package `com.divelogtransfer.app`, version code 2. Minimum Android 7.0/API 24; target API 34. Includes arm64-v8a, armeabi-v7a, x86 and x86_64.

## Completed checks

- TypeScript checking passed.
- All 25 automated behavioral tests passed, including FIT decoding, optional Garmin statistics/GPS, persistence/recovery, QR payload/PNG decoding, saved SSI type overrides, partial batch failures, cancellation and numbering validation.
- Signed release assembly and Android release lint passed.
- APK Signature Scheme v2 verification passed with the durable project release key.
- Release manifest has no INTERNET permission.
- The APK's embedded JavaScript bytes match the generated release bundle. All 18 application source files found in its Metro source map match the current workspace.
- Compatible navigation dependencies resolve without invalid peer dependencies.
- The user confirmed MySSI gallery selection and successful import of the basic generated sample QR. No repeat sample test was requested.

## Physical acceptance remaining

No Android device was connected. APK installation, first launch in airplane mode, actual Garmin watch exports, gallery permission/indexing on the user's phone, and complete APK-to-MySSI transfer remain for sideload acceptance. Synthetic FIT binaries were used for automated parser checks. The extra maximum-temperature and water-type QR fields use published helper mappings; the user's successful sample contained only the basic fields.

## Transfer limits

QR export fills the known supported date/time, type, depth, duration, available minimum/maximum submerged temperature, and explicit fresh/salt water setting. SSI site selection requires an SSI site database ID; Garmin GPS or a name cannot be converted automatically with the offline data available. GPS and additional supported Garmin measurements are retained in details and CSV/JSON. No unconfirmed keys are emitted for profile curves, heart rate, surface interval, CNS, oxygen toxicity, notes, buddies or verification.

Gallery batch export generates one image per included dive. Importing and saving each image remains an action inside MySSI. The app's saved checkmarks are a local checklist only.
