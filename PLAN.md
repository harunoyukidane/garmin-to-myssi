# Dive Log Transfer implementation plan

Status: Implemented on 17 November 2026. Automated verification: 54 passing tests, TypeScript checking and Android JavaScript bundle export. Physical phone acceptance and optional Google deployment remain environment-specific checks. See docs/release-validation.md and docs/enrichment.md.

## Plan 1 — Streamline the app

### 1. Simplify the home screen

- Show **Garmin Connection: Connected/Disconnected**, opening connection management when tapped.
- Refresh the status after connecting or disconnecting.
- Rename the global settings entry to **Global SSI QR Settings**.
- Keep Create Trip and the existing trip list.

### 2. Consolidate trip settings

- Combine trip dates, time zone, QR defaults, and air-temperature controls into one **Trip Settings** screen.
- Remove the separate Trip SSI QR Settings entry.
- Keep global QR settings as defaults copied into new trips.
- Provide **Apply global settings** for an existing trip without overwriting individual dive corrections.
- In Plan 2, replace routine manual time-zone entry with GPS-derived values.

### 3. Remove SSI numbering

- Remove the First SSI Dive Number input and expected SSI-number labels.
- Identify dives by date/time and trip sequence: **Dive 1, Dive 2…**
- Use trip sequence and timestamps for QR filenames and export progress.
- MySSI numbering remains outside this app; the current QR payload does not contain a dive number.

### 4. Keep one dive review screen

- Open it from the trip's dive list.
- Combine measurements, Garmin details, editable location, QR conditions, air temperature, and QR preview.
- Keep corrections available here.
- Display the Garmin-derived dive type without a selector.
- Remove the separate Transfer to MySSI screen and its duplicate review/navigation flow.
- Make review warnings focus on fields required to generate the QR; missing location must not block export.

### 5. Keep one export action

- Place **Export all QR codes to gallery** on the trip screen.
- Keep progress, cancellation, and a clear report of failed dives.
- Keep brief instructions for importing the saved images into MySSI.
- Remove Export review files, including CSV/JSON export screens.
- Remove Export all QR codes to a folder.
- Remove individual QR save, gallery-save, and share buttons.
- Remove “I saved this dive in MySSI,” checkmarks, and saved-count tracking.
- Remove manual SSI dive-type selection.

### 6. Clean up existing data and code

- Preserve saved trips, imported files, and measurement corrections.
- Stop using old SSI type overrides when generating QR codes; derive type from imported Garmin data.
- Keep older saved data loadable while retiring numbering and checklist fields.
- Remove unused routes, services, and outdated instructions.

## Plan 2 — GPS location, time zone, and historical air temperature

### 1. Preserve Garmin entry and exit coordinates

- Inspect both file-import and sync paths.
- Store entry and exit coordinates separately where available.
- Use valid **entry coordinates first**, then **exit coordinates**.
- Preserve existing single-coordinate records as a compatibility fallback where their origin cannot be recovered.

### 2. Resolve a readable dive location

- Query OpenStreetMap through Overpass for nearby named dive sites.
- Exclude dive shops and centres from dive-site matching.
- Rank candidates by proximity and feature type, using feature boundaries where available.
- If there is no convincing dive-site match, look for named reefs, beaches, bays/coves, islands, or broader areas.
- Automatically populate a clear match; offer a short candidate list when several sites are plausible.
- Avoid selecting a distant dive site merely because it is the closest result.
- Keep the name editable and preserve manual corrections.
- Show the name without an “Estimated” label. This is a local reference, not an SSI site-ID mapping.

### 3. Add an optional Google fallback

- Use Google only when OSM cannot provide a useful result and Google access is configured.
- Combine Places search for named features with reverse geocoding for broader geographic names.
- Keep API credentials out of committed source code and configure usage limits.
- Follow provider attribution and storage requirements; permanent offline storage of Google-returned names is not assumed.
- Ensure OSM lookup and manual correction still work without Google.

### 4. Derive the time zone from coordinates

- Resolve a geographic time-zone identifier for each dive.
- Apply its offset on the actual dive date, including daylight-saving rules where applicable.
- Use the resulting local time consistently in dive review, trip-date filtering, and QR generation.
- Preserve the original recorded timestamp.
- Allow a manual time-zone correction.
- Preserve existing trip offsets until a valid replacement is available.
- Handle imports without explicit time zones carefully so timestamps are not converted twice.

### 5. Fetch historical air temperature

- Use the selected Garmin coordinates and the dive timestamp to request historical hourly air temperature.
- Fetch temperatures for the trip in batches where practical.
- Match each dive to the appropriate hour; do not substitute today's weather for past dives.
- Save retrieved values for offline QR generation.
- Keep Garmin-recorded **water temperature** unchanged.
- Allow manual air-temperature corrections and preserve them during subsequent lookups.
- Leave unavailable results blank and allow retry.
- Replace **Get current air temperature** with **Fetch historical air temperatures**.
- Omit an “Estimated” label.

### 6. Handle missing GPS

- If an individual dive has no coordinates, use the nearest-in-time GPS-bearing dive in the trip for the weather/time-zone fallback.
- Use only a broad location fallback for that dive; do not automatically copy another dive's exact site name.
- Show a manual **Destination** field only when the entire trip lacks usable coordinates.
- Use that destination for geographic, time-zone, and weather lookup.

### 7. Keep lookups unobtrusive

- Start enrichment after import or Garmin sync.
- Batch nearby OSM queries, cache permitted results, and respect service limits.
- Keep imported dives usable if the network or a provider fails.
- Provide a retry action for unresolved lookups.
- Preserve manual corrections over automatic results.
- Keep provider attribution in an appropriate location without cluttering each field.

## Verification before delivery

- Existing trips still load with their corrections intact.
- Entry/exit priority, invalid coordinates, and missing-GPS fallbacks behave correctly.
- Location matching handles ambiguous and absent dive sites.
- Time-zone conversion handles midnight boundaries and daylight-saving changes.
- Historical temperatures match the correct dive timestamp and never overwrite manual corrections.
- QR payloads retain correct dates, times, measurements, conditions, and Garmin-derived dive types.
- Batch gallery export retains cancellation and failure reporting.
- Run relevant automated tests, typecheck, and check the streamlined screen flow.

## Implementation order

Complete app streamlining first, then add GPS and historical-weather lookup to the consolidated screens.

## Reference documentation

- [OSM scuba-diving tagging](https://wiki.openstreetmap.org/wiki/Tag%3Asport%3Dscuba_diving)
- [Overpass public-instance usage](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [Google reverse geocoding](https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding)
- [Google Places Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Google Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
- [Open-Meteo historical weather](https://open-meteo.com/en/docs/historical-weather-api)
