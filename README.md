# SNAP & EBT Grocery Tracker — iOS QA builds

This private repository builds the preserved `SNAP & EBT Grocery Tracker` version 1.0.0 iOS QA source without an Expo EAS queue.

## Build outputs

The **Build iPhone QA App** workflow supports:

- `simulator`: an unsigned `.app.zip` compile-check artifact. It is not installable on an iPhone.
- `signed_ipa`: `SNAP-EBT-Grocery-Tracker-QA-v1.0.0.ipa`, signed for registered iPhones using encrypted repository secrets.

The first push automatically starts the Simulator compile check. Read [IOS_SIGNING_SETUP.md](IOS_SIGNING_SETUP.md) before running `signed_ipa`.

## Frozen QA identity

- Bundle ID: `com.goodusestudios.snapebtgrocerytracker.qa`
- Deployment target: iOS 16.4+
- Ads: Google's official iOS test identifiers
- Purchases: visibly labelled simulated QA purchases that cannot charge money
- Source archive SHA-256: `23d938c18df0e185e54946759a3075ef42ce2a6cbc3a0bff99b3a085387e4fcd`

No Apple certificate, private key, provisioning profile, live advertising identifier, or production secret is stored in this repository.
