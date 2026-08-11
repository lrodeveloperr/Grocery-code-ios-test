# SNAP-EBT & WIC Benefits Tracker — iOS

This private repository contains the iOS build and release overlay for **SNAP-EBT & WIC Benefits Tracker**.

## Current product model

- Platform: iPhone/iOS
- Core app: free and ad-supported
- Advertising: one fixed, non-personalized banner when Google UMP permits an ad request
- Remove Ads Forever: one non-consumable App Store purchase, configured at **US$9.99** in the United States storefront
- Product ID: `remove_ads_lifetime`
- Purchase UI: **Remove Ads** is a standalone sidebar destination and displays StoreKit's localized price
- Restore UI: **Restore Purchase** is always present in Settings
- Privacy choices: shown only when required by Google UMP; they change advertising data treatment, not banner visibility
- Subscription: none
- Benefits & Resources directory: not included
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

The repository retains a frozen QA source archive as a build baseline. Current release files in `release-overlay/` supersede conflicting runtime files from that archive. Every release or QA artifact must apply the active overlay and pass `release-overlay/scripts/verify-test-release.mjs`; archived optional-ad controls, simulated-purchase code, old prices, embedded policy text, and legal URLs are not current release requirements.

The internal test-ads workflow uses Google's sample app ID and fixed demo banner, which are not associated with this publisher's AdMob account. That explicit `test` profile initializes only the demo banner after legal acceptance and a verified non-entitled StoreKit state; it does not exercise the publisher's UMP message. It must remain internal TestFlight only. The `production` profile requires the approved 16-digit AdMob publisher ID, app ID, and banner ID to match; Google's demo publisher is rejected. Production retains the fail-closed UMP `canRequestAds` gate.

The app never hard-codes US$9.99 in its purchase screen. App Store Connect owns the storefront price and StoreKit supplies the localized `displayPrice`. Before upload, App Store app `6799562282` must contain exactly one `NON_CONSUMABLE` product with ID `remove_ads_lifetime`, the United States price must be set to US$9.99, and the Paid Apps Agreement, tax, banking, localization, and review screenshot must be complete. TestFlight uses Apple's sandbox and does not charge testers.

StoreKit's verified current entitlement is authoritative. A verified purchase or restore removes the banner immediately; cancellation, pending approval, an unverified transaction, or a failed restore never grants the entitlement. Refund or revocation returns the app to the normal UMP-gated banner path. Clear All Data removes tracker data but does not delete an App Store purchase.

Both release workflows regenerate the npm third-party inventory after installing the reviewed lockfile, then append the final CocoaPods acknowledgements before compilation. The gates require the `expo-iap@5.2.4` npm notice plus the installed `ExpoIap (5.2.4)` and `openiap (3.1.1)` pods, including the native `openiap` acknowledgement, so the StoreKit implementation cannot ship against stale notices.

No Apple certificate, private key, provisioning profile, live advertising identifier, payment credential, or production secret should be committed to this repository.

## Revenue protection gate

Any change affecting advertising, ad identifiers, pricing, in-app purchases, subscriptions, paid entitlements, restore behavior, or another monetization path must receive explicit approval from two independent adversarial reviewers before merge or upload. Either reviewer can block the release. Reviews must test revenue-loss and unintended-free-access paths, while release validation should be batched to avoid unnecessary paid CI or service usage.
