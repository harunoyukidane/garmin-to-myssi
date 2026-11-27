param([switch]$PrepareOnly, [switch]$UseWindowsTrustStore, [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$androidDirectory = Join-Path $projectDirectory 'android'
$releaseVersion = (Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw | ConvertFrom-Json).version
$releaseCode = (Get-Content -LiteralPath (Join-Path $projectDirectory 'app.json') -Raw | ConvertFrom-Json).expo.android.versionCode
$releaseName = (Get-Content -LiteralPath (Join-Path $projectDirectory 'app.json') -Raw | ConvertFrom-Json).expo.name
$keyPath = Join-Path $androidDirectory 'release.keystore'
$signingPath = Join-Path $androidDirectory 'signing.properties'
if (-not (Test-Path -LiteralPath $signingPath)) {
    if (Test-Path -LiteralPath $keyPath) { throw 'release.keystore already exists without signing.properties. Restore the signing properties from your backup.' }
    $keytoolCommand = (Get-Command keytool -ErrorAction Stop).Source
    $passwordBytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
    $signingPassword = [Convert]::ToBase64String($passwordBytes)
    $env:DIVE_KEY_PASSWORD = $signingPassword
    try {
        & $keytoolCommand -genkeypair -v -keystore $keyPath -storetype PKCS12 -storepass:env DIVE_KEY_PASSWORD -keypass:env DIVE_KEY_PASSWORD -alias divelog -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Dive Log Transfer, OU=Android, O=Personal, C=SG'
        if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
        [System.IO.File]::WriteAllText($signingPath, "storeFile=release.keystore`nstorePassword=$signingPassword`nkeyAlias=divelog`nkeyPassword=$signingPassword`n")
    } finally { Remove-Item Env:DIVE_KEY_PASSWORD -ErrorAction SilentlyContinue }
}
Write-Output 'Release signing is configured. Keep a private backup of android/release.keystore and android/signing.properties for future updates.'
if ($PrepareOnly) { exit 0 }
# Prefer a supported JDK when the system default points at a newer installation.
$jdk17 = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.6.10-hotspot'
if (Test-Path -LiteralPath (Join-Path $jdk17 'bin/java.exe')) { $env:JAVA_HOME = $jdk17 }
$buildTempDirectory = Join-Path $projectDirectory '.android-tmp'
New-Item -ItemType Directory -Force -Path $buildTempDirectory | Out-Null
$env:TEMP = $buildTempDirectory
$env:TMP = $buildTempDirectory
$env:GRADLE_OPTS = (($env:GRADLE_OPTS + ' -Djava.net.preferIPv4Stack=true').Trim())
if ($UseWindowsTrustStore) { $env:GRADLE_OPTS += ' -Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE' }
$env:NODE_ENV = 'production'
if (-not $env:ANDROID_HOME) {
    $sdkCandidates = @((Join-Path $env:LOCALAPPDATA 'Android\Sdk'), 'C:\Android\Sdk', 'C:\AndroidSDK')
    foreach ($candidate in $sdkCandidates) { if (Test-Path -LiteralPath (Join-Path $candidate 'platform-tools')) { $env:ANDROID_HOME = $candidate; break } }
}
if (-not $VerifyOnly) { Push-Location $androidDirectory
try {
    & '.\gradlew.bat' :app:assembleRelease --console=plain --no-daemon --stacktrace
    if ($LASTEXITCODE -ne 0) { throw 'Android release build failed. Check the Gradle output above.' }
} finally { Pop-Location } }
$apkPath = Join-Path $androidDirectory 'app\build\outputs\apk\release\app-release.apk'
Write-Output "APK: $apkPath"





$buildToolsDirectory = Join-Path $env:ANDROID_HOME 'build-tools\35.0.0'
& (Join-Path $buildToolsDirectory 'apksigner.bat') verify --verbose --print-certs $apkPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
$permissions = & (Join-Path $buildToolsDirectory 'aapt.exe') dump permissions $apkPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect APK permissions.' }
if (-not ($permissions -match 'android.permission.INTERNET')) { throw 'Release APK needs INTERNET permission for optional Garmin sync.' }
$badging = & (Join-Path $buildToolsDirectory 'aapt.exe') dump badging $apkPath
if ($LASTEXITCODE -ne 0 -or -not ($badging -match "package: name='com.divelogtransfer.app'")) { throw 'Unexpected APK package.' }
if (-not ($badging -match "versionName='$([regex]::Escape($releaseVersion))'") -or -not ($badging -match "versionCode='$releaseCode'")) { throw 'APK version does not match the release configuration.' }
if (-not ($badging -contains "application-label:'$releaseName'")) { throw 'APK display name does not match the app configuration.' }
$badging | Select-String -Pattern '^package:','^application-label:','^sdkVersion:','^targetSdkVersion:','^native-code:'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
try {
    $bundle = $archive.GetEntry('assets/index.android.bundle')
    if (-not $bundle -or $bundle.Length -lt 100000) { throw 'APK is missing its embedded JavaScript bundle.' }
} finally { $archive.Dispose() }
$outputDirectory = Join-Path $projectDirectory 'dist'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$deliverable = Join-Path $outputDirectory "GarminToMySSI-$releaseVersion.apk"
Copy-Item -LiteralPath $apkPath -Destination $deliverable -Force
$hash = (Get-FileHash -LiteralPath $deliverable -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($deliverable + '.sha256') -Value "$hash  $([System.IO.Path]::GetFileName($deliverable))"
Write-Output "Verified standalone APK: $deliverable"
Write-Output 'Signature valid; JavaScript bundled; INTERNET permission available for optional Garmin sync.'
