# Documentation

Keep public project documentation in this folder so instructions and licensing notes stay versioned with the code they describe.

## Using, building, and distributing

- [Main README](../README.md): setup, importing dives, exporting QR images, and building Android.
- [Lookup configuration](enrichment.md): geographic names, historical weather, and optional Google proxy configuration.
- [Licensing](licensing.md): PolyForm Noncommercial and separate dependency obligations.
- [Credentials and Git history](public-release.md): credential handling and history-cleanup procedure.
- [Version 0.4.2](release-0.4.2.md): app rename and instructions for preserving data during an upgrade.

## Contributor references

The following documents record design decisions and dated validation evidence. Their dates, versions, and test counts describe the recorded work; they are not a statement of the current release's acceptance status.

- [Android specification](android-offline-spec.md)
- [Garmin sync proposal](garmin-sync-proposal.md)
- [Garmin sync validation](garmin-sync-validation.md)
- [Android release validation](release-validation.md)
- [Implementation plan](../PLAN.md)

## What belongs elsewhere

Keep credentials, signing keys, personal dive exports, account screenshots, and private operational notes outside the repository. Use a private, access-controlled folder or private documentation repository for private notes, a password manager for secrets, and secure backups for signing files.

Use GitHub Issues for actionable tasks, Discussions or a wiki for informal collaboration, and Releases for approved APKs and checksums. A future public documentation website can be generated from this folder; a separate copy of the maintained instructions is unnecessary.
