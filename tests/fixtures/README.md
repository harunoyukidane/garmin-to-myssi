# Import fixtures

`synthetic-dive.fit` is generated with Garmin's SDK by `scripts/create-fixtures.cjs`. It is a synthetic diving activity, not an export from an actual watch. Expected values: start 2026-05-23 00:00 UTC, depth 24.3 m, bottom time 1740 seconds, submerged sample temperature 28 C.

`dive-review.csv` includes that same activity and one additional dive with quoted Unicode/location text, a multiline note, and zero water temperature. For a trip covering 2026-05-23 through 2026-05-24 at UTC+08:00, starting at SSI 42, both are included. Importing the FIT and CSV should produce two total dives, not three. The FIT record has no location; importing CSV after FIT reports its equivalent measurement record as a duplicate and retains the existing record. Location can be corrected manually.
