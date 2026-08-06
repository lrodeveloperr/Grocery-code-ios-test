# iPhone IPA signing setup

The workflow keeps all Apple credentials out of the repository. A physical-iPhone IPA cannot be created with a disposable key like an Android QA APK; Apple requires signing assets tied to the developer account and the test device.

## Required Apple assets

Create or obtain all three items for the QA bundle ID `com.goodusestudios.snapebtgrocerytracker.qa`:

1. An explicit App ID using that exact bundle ID.
2. An Apple Distribution certificate with its private key, exported together as a password-protected `.p12` file.
3. An iOS Ad Hoc provisioning profile for the same App ID and certificate, containing the iPhone's registered UDID.

## Add encrypted GitHub secrets

Open this repository's **Settings → Secrets and variables → Actions → New repository secret** and add:

- `IOS_P12_BASE64`: base64 text of the `.p12` file.
- `IOS_P12_PASSWORD`: the password used when exporting the `.p12` file.
- `IOS_MOBILEPROVISION_BASE64`: base64 text of the Ad Hoc `.mobileprovision` file.

On Windows PowerShell, copy a file's base64 value with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\file")) | Set-Clipboard
```

Run that once for the `.p12` file and once for the `.mobileprovision` file.

## Build the IPA

1. Open **Actions → Build iPhone QA App → Run workflow**.
2. Choose `signed_ipa`.
3. Run the workflow.
4. Download `SNAP-EBT-Grocery-Tracker-QA-v1.0.0.ipa` from the run's **Artifacts** section.

The workflow validates that the profile is Ad Hoc, matches the exact QA bundle ID, contains registered devices, and matches an Apple Distribution certificate before exporting the IPA.

## Installation limitation

The signed IPA runs only on iPhones whose UDIDs are included in the profile. iOS does not install an IPA merely by tapping it in Files. Install it using Xcode or Apple Configurator on a Mac, or use a properly configured secure over-the-air distribution service. Developer Mode must be enabled on the test iPhone.

