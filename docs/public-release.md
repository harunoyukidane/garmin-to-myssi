# Public release and Git history

Garmin keys and GeoNames usernames are entered in the app and saved in Expo SecureStore. Google credentials belong only in the optional server's `GOOGLE_MAPS_API_KEY` environment variable. Never put a secret in an `EXPO_PUBLIC_*` variable: Expo bundles those values into the client. The optional Google proxy URL is public configuration.

Private release signing keys, signing properties, local environment files and build outputs are ignored. Keep private signing files and their backups outside Git. Android's tracked debug keystore and its standard `android` password are public development credentials; release builds use a separate private key.

## Remove previously committed credentials

Deleting a file or branch does not erase credentials from earlier commits. Rotate/revoke any exposed secret first. A GeoNames username is a public account identifier, but can also be removed to avoid publishing a personal account. History rewriting changes commit IDs and requires coordinated replacement of remote history. These steps are instructions; the current source changes do not rewrite history.

1. Commit and push the cleaned source. Pause other pushes. Keep any backup private because it contains the old data.
2. Install `git-filter-repo` version 2.47 or newer. Create a fresh clone, separate from your working repository:

   ```powershell
   git clone https://github.com/harunoyukidane/dive-log-transfer.git dive-log-transfer-clean
   Set-Location dive-log-transfer-clean
   ```

3. In a local file outside the clone, create one replacement per line, such as `literal:OLD_VALUE==>REMOVED`. Include every exposed credential and any personal username you want removed. Do not commit or share this file. Replace the example path below with its absolute path. For whole private files, include all historical paths in the same filtering command:

   ```powershell
   git filter-repo --sensitive-data-removal --replace-text C:/private/replacements.txt
   ```

   If private files were committed, use this form instead, replacing the example paths with the actual tracked paths:

   ```powershell
   git filter-repo --sensitive-data-removal --replace-text C:/private/replacements.txt --invert-paths --path .env --path android/signing.properties --path android/release.keystore
   ```

4. Inspect the rewritten branches/tags and run a secret scanner against all history. Check commit messages too; `--replace-text` only rewrites file contents. Preserve the tool's report for affected pull requests and first changed commits. Recheck `git remote -v`; filtering may remove `origin`, in which case add the same repository URL again.
5. After verifying the result, replace remote refs from this dedicated clone:

   ```powershell
   git push --force --mirror origin
   ```

   This replaces/deletes remote refs to match the clone. Temporarily adjust branch protection if required. GitHub may reject read-only pull-request refs; those require the follow-up below.

6. Have collaborators discard old clones and clone again. Old branches or merges can reintroduce removed data. Review forks, release assets, APKs, CI artifacts/logs and caches separately; rewriting Git does not clean those. Contact GitHub Support for sensitive pull-request references/cached views that remain, following its eligibility guidance. Remove the private replacement file when finished.

Follow GitHub's current [sensitive-data removal guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) for prerequisites, clone coordination and support steps.
