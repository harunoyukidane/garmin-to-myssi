# Enrichment configuration and operation

## GeoNames automatic location lookup (0.4.1)

GeoNames is an optional first geographic-name lookup. Enter your own username in Garmin & GeoNames settings and enable free web services in your GeoNames account. The username is stored in Expo SecureStore on this phone; no account is embedded in source or the app bundle. Leaving the field blank disables GeoNames and uses OSM. Requests use HTTPS, filter to coastal geographic features, and cache successful responses per account for one day in memory. Existing resolved names persist with trip data for offline use; changing the account applies to new lookups. GeoNames attribution (CC BY 4.0) appears on the trip screen.

Entry GPS remains preferred over exit GPS. Candidates are checked against the actual coordinates, with a 2 km limit for specific features and 15 km for broader areas. Hotels and businesses are excluded. Missing-GPS dives use only broad areas from nearby dives. Ambiguous/failed GeoNames lookups fall back to OSM and retain editable candidates. A clear GeoNames result skips Overpass, avoiding its delays. Manual corrections always take precedence.

The enrichment version changes on upgrade so existing trips refresh automatically. Unavailable lookups use the existing automatic backoff. Live validation on 2026-11-24 with the supplied FIT returned **Pulau Rengis**, 230 m from exit GPS, **Asia/Kuala_Lumpur**, and **28 °C** historical air temperature with no lookup errors. Automated tests also cover malformed responses, invalid/distant features, OSM fallback, caching and preserved manual corrections.

OSM and Open-Meteo work without Google or embedded credentials. No provider call blocks import or launch. Results are applied through serialized persistence against the latest trip; measurement, location, condition, time-zone and air-temperature corrections remain separate from lookup metadata. A changed lookup configuration discards stale in-flight results. Imported original timestamps and source files are retained.

Unresolved lookups retry automatically while the app is active, with backoff from one minute to thirty minutes. Overpass requests identify the app, are serialized and spaced apart, and use the Private.coffee public instance after server/network failures on the main instance. Throttling responses defer to the next automatic retry. Public instances are documented in the [OSM Overpass directory](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).

Previously imported FIT files without GPS are reread from their stored source when enrichment runs. A single-lap dive can inherit session entry/exit coordinates; multi-lap activities do not copy one session position to all dives. Selected destinations retain their geographic time zone; dive GPS lookup takes priority over that fallback. Trip creation has no manual offset or air-temperature input.

Validation on 2026-11-17: the supplied `24512102360.zip` has session-only exit GPS (2.8104303, 104.1349947). Parsing now retains it. Live Open-Meteo returned Asia/Kuala_Lumpur and 28 °C for the dive hour. Live Overpass returned HTTP errors/timeouts in the development environment; geographic-name resolution was therefore not verified for this sample. Automated provider tests cover fallback and location ranking.

## Optional Google fallback

The mobile app only requests Google when OSM has neither a useful name nor plausible candidates. It calls an optional HTTPS proxy specified by `EXPO_PUBLIC_GOOGLE_LOCATION_PROXY` at build time. This variable contains the proxy URL, never a Google API key. With no URL configured, Google is disabled.

A deployable Node handler is provided in `scripts/google-location-proxy.mjs`. Set server-only `GOOGLE_MAPS_API_KEY`, `GOOGLE_DAILY_REQUEST_LIMIT` (default 100 upstream requests) and optional `PORT`, then run `node scripts/google-location-proxy.mjs`. Put its loopback listener behind an HTTPS gateway with access controls/rate limits appropriate to the deployment. Enable Places API (New) and Geocoding API. Restrict the key to these APIs and the server IP, and configure API quotas and budget alerts in Google Cloud. The handler's per-process/day counter counts each Places/Geocoding request; restarts or multiple instances reset/split this counter, so Google Cloud quotas are required for a deployment-wide limit.

The proxy combines Places text search for named natural features with reverse geocoding for broader names. Search bias is followed by a strict distance/type check. Businesses and results requiring unhandled third-party attribution are discarded. No provider result is cached at the proxy; responses set Cache-Control: no-store. Names remain transient in the mounted review screen and display with Google Maps attribution. They are not written to trip data or automatic location fields. Manual editing and OSM work when Google fails or is disabled. The proxy returns no credential-bearing diagnostics.

Before enabling a production deployment, publish the required application Terms of Use and Privacy Policy and satisfy current Google attribution/usage terms. The proxy does not assume permanent offline storage rights for Google-returned names. Google Cloud billing credentials and a public proxy are not provisioned by this repository.

## Provider references

- [OSM scuba diving](https://wiki.openstreetmap.org/wiki/Tag:sport%3Dscuba_diving)
- [Overpass usage limits](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [Open-Meteo Archive](https://open-meteo.com/en/docs/historical-weather-api)
- [Open-Meteo Forecast](https://open-meteo.com/en/docs)
- [Google Places search](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Google Geocoding policy](https://developers.google.com/maps/documentation/geocoding/policies)
- [Google Places policy](https://developers.google.com/maps/documentation/places/web-service/policies)

## Known boundaries

Public-service availability and geographic coverage vary, especially offshore. Missing data stays editable/retryable. Date filtering can change after a geographic time zone is resolved. CSV wall-clock records at ambiguous DST boundaries need source-offset verification. Overpass relation geometries use available outer boundaries; complicated multipolygons can still need manual location correction. Google remains an online reference and adds no offline dependency.
