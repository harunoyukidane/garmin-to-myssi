# Android application specification

Current implementation follows PLAN.md. This replaces the earlier numbering/checklist/review-export specification.

## Screens

Home: Garmin Connection status/management, Global SSI QR Settings, Create trip and saved trips.

Trip Settings: inclusive dates, QR defaults, Apply global settings, optional manual air temperature, GPS-derived time-zone behavior with manual correction/fallback offset, and Destination search when no trip dive has GPS.

Trip: import/sync, settings, chronological Dive 1/2 sequence, review links, historical-temperature fetch, lookup retry and one Export all QR codes to gallery action with progress/cancellation/per-dive failures and MySSI import instructions.

Dive review: corrected measurements/location/notes, recorded Garmin type and statistics, location candidates, manual time-zone/air-temperature controls, QR conditions and preview. Location is optional for export. Field correction is an editor reached from this review, not a second review flow.

Global settings are copied into new trips. Applying them to an existing trip updates defaults without changing individual corrections. MySSI assigns its numbers. No numbering input, saved-dive checklist, type selector, review CSV/JSON export, folder export or individual image save/share flow remains.

## Data and lookups

Preserve schema 1/2 trips, source references, imported measurements, corrections and audit history. Legacy numbering/checklist/type overrides may remain stored but are not active behavior. Serialized temporary-write/backup recovery must preserve unreadable data and block unsafe writes.

Use valid complete entry GPS, then exit GPS, then the legacy coordinate pair. Missing-GPS dives use the nearest-in-time GPS-bearing trip dive for weather/time zone but only broad geographic names. Entirely GPS-free trips use the selected Destination.

OSM queries exclude shops/centres, rank nearby named sites and natural features using geometry where available, reject distant sites and require selection for ambiguity. Preserve user location corrections. Batch/cache and limit public-service requests. Google fallback is optional, server configured and transient, with attribution and no assumed offline-name storage rights.

Resolve IANA zones from coordinates and apply date-specific DST offsets consistently to review, filtering and QR generation. Preserve original source timestamps; interpret naive CSV wall clocks once. Until resolution, retain the trip offset. Manual corrections take priority.

Request historical hourly air temperature for the selected coordinates and dive UTC hour. Batch shared coordinate/date requests. Persist retrieved values. Missing hours stay blank/retryable. Do not use today's weather for earlier dives or modify Garmin water temperatures. Manual dive temperature (including explicit omission), then manual trip temperature, takes priority over retrieved data.

Enrichment begins after committed imports/sync and never blocks use of imported records. Reject stale configuration results and merge against current corrections. Attribution and provider configuration are documented in enrichment.md.

## Validation

Automate calendar boundaries/DST, naive/explicit CSV timestamps, entry/exit GPS priority and invalid pairs, nearest GPS fallback, location ambiguity/business exclusion/distance/boundaries, historical-hour matching/provider failures/manual preservation, existing-data migration, original-file retention, duplicate handling, storage recovery and independently decoded QR images. Batch export must continue after per-dive errors and support cancellation.

Run npm test, npm run typecheck and npm run bundle:android. Physical Android upgrade, navigation, gallery export/cancellation/permissions and MySSI import remain device acceptance. A native release must retain package/signing identity, include JavaScript/assets and require no Metro server. Build commands and release status are in README.md and release-validation.md.
