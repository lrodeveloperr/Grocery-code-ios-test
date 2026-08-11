# SNAP-EBT & WIC Benefits Tracker — iOS

This private repository contains the iOS build and release overlay for **SNAP-EBT & WIC Benefits Tracker**.

## Current product model

- Platform: iPhone/iOS
- Core app: free and ad-supported
- Advertising: one fixed, non-personalized banner when Google UMP permits an ad request
- General ad-disable control: none in the free release
- Privacy choices: shown only when required by Google UMP; they change advertising data treatment, not banner visibility
- Remove Ads purchase: not included in this TestFlight release
- Subscription: none
- Account or cloud synchronization: none
- Core SNAP/PAN, WIC, grocery, budget, History, and report records: local to the device

## Canonical legal pages

- [Legal and Support Center](https://lrodeveloperr.github.io/snap-wic-benefits-tracker-legal/)
- [Privacy Policy](https://lrodeveloperr.github.io/snap-wic-benefits-tracker-legal/privacy/)
- [Terms of Use](https://lrodeveloperr.github.io/snap-wic-benefits-tracker-legal/terms/)
- [Support](https://lrodeveloperr.github.io/snap-wic-benefits-tracker-legal/support/)
- [Official Government Sources](https://lrodeveloperr.github.io/snap-wic-benefits-tracker-legal/official-sources/)

The active release overlay uses these canonical URLs. The former `SNAP-EBT-Grocery-Tracker` legal site is retired and must not be used for new code or metadata.

## Build notes

The repository retains a frozen QA source archive as a build baseline. Current release files in `release-overlay/` supersede conflicting runtime files from that archive. Every release or QA artifact must apply the active overlay and pass `release-overlay/scripts/verify-test-release.mjs`; archived optional-ad controls, simulated-purchase copy, embedded policy text, and legal URLs are not current release requirements.

No Apple certificate, private key, provisioning profile, live advertising identifier, payment credential, or production secret should be committed to this repository.
