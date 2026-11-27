# Garmin to MySSI 0.4.2

The app's launcher label and home-screen title are now **Garmin to MySSI**. Android version code increases from 5 to 6. The release artifact is `dist/GarminToMySSI-0.4.2.apk`, with a `.sha256` checksum alongside it.

## Upgrade without clearing data

Install the new APK over the existing release-signed Dive Log Transfer app. Do not uninstall the old app or clear its data first. Android must accept the installation as an update; a signature-conflict error requires checking the installed version and signing certificate, rather than uninstalling to bypass it.

The Android application ID remains `com.divelogtransfer.app`. The URI schemes, private `dive-log/` storage directory, repository schema, saved credential slots, and gallery destination are unchanged. Original imports, trips, corrections, saved settings, and existing QR images therefore use their existing locations. QR export continues to use the **Dive Log Transfer** gallery album.

The release build reuses the existing private signing files. A build from a different signing key cannot update an existing installation signed with this project's release key.

Physical-device upgrade and MySSI import acceptance still need to be checked on the target phone. Automated and APK-level checks do not replace that acceptance step.

## Build verification — 27 November 2026

- Release assembly and vital lint passed. TypeScript and all 64 automated tests passed.
- APK label is `Garmin to MySSI`; version is `0.4.2`, version code `6`, package `com.divelogtransfer.app`. The previous 0.4.1 APK has version code `5` and the same package ID.
- Both APK signatures verify and have the same signing certificate SHA-256: `d1c311e7f5e77b5dcf326c3a34029b6919ef4d4da3bc997ef0bf9ad42c314ed7`. Private signing files were unchanged during the build.
- All 32 bundled application source files checked against the release source map match this checkout. The APK includes its JavaScript and the INTERNET permission for optional online features.
- APK size: 63,828,624 bytes. SHA-256: `d7f59e6fa31e5e3e08087e339853c910928a1c54b7922bb971248bcc08419ebb`. The companion checksum file matches.
- Minimum Android API is 24; target API remains 34. Included architectures: arm64-v8a, armeabi-v7a, x86, and x86_64.
