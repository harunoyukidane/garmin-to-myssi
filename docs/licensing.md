# Licensing

## Recommendation

MIT is a simple choice for the original application code if the owner wants to permit use, modification, redistribution, and commercial reuse while requiring preservation of the copyright and license notice. Apache-2.0 is another permissive option with an explicit contributor patent grant and additional notice/change requirements.

No license has been selected or applied yet. Making a repository public does not itself grant a general right to reuse its code.

## How to add the chosen license

1. Confirm ownership of the original code and permission from any other copyright holders.
2. Add the complete standard license text in a root `LICENSE` file. For MIT, fill in the copyright year and the copyright holder's chosen name.
3. Set the SPDX identifier, such as `"license": "MIT"`, in `package.json` and the root package entry of `package-lock.json`.
4. Update the README to state the license and link to `LICENSE`.
5. Preserve third-party notices and attribution. Review a dependency notice inventory for the actual release, including native libraries, fonts and assets. The project license covers only code the owner can license.

## Garmin FIT SDK

The installed `@garmin/fitsdk` version 21.218.0 declares `SEE LICENSE IN LICENSE.txt`. Its FIT Protocol License Agreement grants a limited, non-sublicensable license and includes restrictions on redistribution and on making Garmin technology subject to source-disclosure or modification-right requirements (sections 1 and 2(c)–(d)). It is not an MIT-licensed dependency.

The app includes Garmin's license text in `shared/fitLicense.ts`; preserve it. MIT or Apache for the original app code does not relicense the SDK or establish permission to distribute it inside an APK. Confirm applicable terms and obtain Garmin clarification/permission if needed before public binary distribution. GPL would require particular compatibility review given these restrictions and is not the default recommendation here.

Data services also have separate attribution and usage terms. Keep OpenStreetMap, GeoNames, Open-Meteo and optional Google attribution and terms.

## References

- [MIT terms and instructions](https://choosealicense.com/licenses/mit/)
- [Apache-2.0 terms](https://choosealicense.com/licenses/apache-2.0/)
- [Garmin SDK license](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt) — also inspect the license shipped with the pinned installed version.
- [GitHub licensing instructions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
