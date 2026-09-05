# Grocery Benefits Tracker — iOS

This public repository contains the iOS build and release overlay for **Grocery Benefits Tracker**.

## Current product model

- Platform: iPhone/iOS
- Core app: free and ad-supported
- Advertising: one fixed, non-personalized banner when Google UMP permits an ad request
- Remove Ads Forever: one non-consumable App Store purchase, configured at **US$9.99** in the United States storefront
- Product ID: `remove_ads_lifetime`
- Purchase UI: **Remove Ads** is a standalone sidebar destination and displays StoreKit's localized price
- Restore UI: **Restore Purchase** is always present in Settings
- Privacy choices: shown only when required by Google UMP; they change advertising data treatment, not banner visibility
- App Tracking Transparency: on iOS, requested only after legal acceptance, Google's applicable UMP process, and a verified non-entitled StoreKit state; denial or restriction keeps IDFA unavailable without limiting core features or IDFA-less non-personalized ads
- Privacy-manifest ownership: the app-owned manifest does not duplicate SDK collection or tracking; CI pins and inventories the exact installed and packaged Google Mobile Ads and UMP manifests and verifies Google Mobile Ads' linked Device ID tracking row. Google Mobile Ads 13.5.0 does not declare top-level tracking domains, so none are invented; App Store privacy labels must be reconciled to the packaged manifest report
- Manual pre-upload hold: in Xcode Organizer, generate the privacy report from the exact signed archive and reconcile every collected-data, linking, tracking, and purpose row to App Store Connect before any upload or submission; CI's unsigned archive inventory does not replace that Apple UI review
- App Review note recommendation: tell the reviewer that ad reporting is available at **Settings → Report an Ad**, which opens the canonical support page and its dedicated inappropriate-ad email action in English or Spanish
- Subscription: none
- Benefits & Resources directory: not included
- Account or cloud synchronization: none
- Core SNAP/PAN, WIC, grocery, budget, History, and report records: local to the device

## Canonical legal pages

- [Legal and Support Center](https://lrodeveloperr.github.io/grocery-benefits-tracker/)
- [Privacy Policy](https://lrodeveloperr.github.io/grocery-benefits-tracker/privacy/)
- [Terms of Use](https://lrodeveloperr.github.io/grocery-benefits-tracker/terms/)
- [Support](https://lrodeveloperr.github.io/grocery-benefits-tracker/support/)
- [Official Government Sources](https://lrodeveloperr.github.io/grocery-benefits-tracker/official-sources/)

The active release overlay uses these canonical clean URLs. Legacy legal-site paths are supported only as redirects for existing bookmarks and must not be used in new code or store metadata.

## Build notes

The repository retains a frozen QA source archive as a build baseline. Current release files in `release-overlay/` supersede conflicting runtime files from that archive. Every release or QA artifact must apply the active overlay and pass `release-overlay/scripts/verify-test-release.mjs`; archived optional-ad controls, simulated-purchase code, old prices, embedded policy text, and legal URLs are not current release requirements.

The internal test-ads workflow uses Google's sample app ID and fixed demo banner, which are not associated with this publisher's AdMob account. That explicit `test` profile initializes only the demo banner after legal acceptance, a verified non-entitled StoreKit state, and a resolved Apple ATT status; it does not exercise the publisher's UMP message. It must remain internal TestFlight only. The `production` profile requires the approved 16-digit AdMob publisher ID, app ID, and banner ID to match; Google's demo publisher is rejected. Production retains the fail-closed UMP `canRequestAds` gate and resolves Apple ATT before Google Mobile Ads configuration, initialization, or an ad request.

The app never hard-codes US$9.99 in its purchase screen. App Store Connect owns the storefront price and StoreKit supplies the localized `displayPrice`. Before upload, App Store app `6799562282` must contain exactly one `NON_CONSUMABLE` product with ID `remove_ads_lifetime`, the United States price must be set to US$9.99, and the Paid Apps Agreement, tax, banking, localization, and review screenshot must be complete. TestFlight uses Apple's sandbox and does not charge testers.

StoreKit's verified current entitlement is authoritative. A verified purchase or restore removes the banner immediately; cancellation, pending approval, an unverified transaction, or a failed restore never grants the entitlement. Refund or revocation returns the app to the normal UMP-gated banner path. Clear All Data removes tracker data but does not delete an App Store purchase.

Both release workflows regenerate the npm third-party inventory after installing the reviewed lockfile, then append the available CocoaPods acknowledgements before compilation. The gates require the `expo-iap@5.2.4` and `expo-tracking-transparency@57.0.1` npm notices, the installed `ExpoIap (5.2.4)`, `openiap (3.1.1)`, and `ExpoTrackingTransparency (57.0.1)` pods, and the native `openiap` acknowledgement. CocoaPods does not emit a separate ExpoTrackingTransparency acknowledgement, so its pinned npm notice and pod lock entry are the authoritative license/version gates.

No Apple certificate, private key, provisioning profile, live advertising identifier, payment credential, or production secret should be committed to this repository.

## Revenue protection gate

Any change affecting advertising, ad identifiers, pricing, in-app purchases, subscriptions, paid entitlements, restore behavior, or another monetization path must receive explicit approval from two independent adversarial reviewers before merge or upload. Either reviewer can block the release. Reviews must test revenue-loss and unintended-free-access paths, while release validation should be batched to avoid unnecessary paid CI or service usage.

Every workflow run that can consume billable runner time or paid external services requires the owner's explicit approval for that exact run. A retry or rerun requires fresh approval. TestFlight uploads must also compare the owner-authorized build number with App Store Connect's calculated next build and stop before compilation if they differ.

## Production App Store lane

`.github/workflows/upload-app-store-production.yml` is the only workflow permitted to package the live AdMob identifiers. It runs from `main` in the protected `app-store-production` environment and requires the exact `UPLOAD PRODUCTION BUILD` confirmation plus an owner-approved build number.

Required environment secrets:

- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_PRIVATE_KEY`

The lane validates the App Store app and bundle records, the non-consumable `remove_ads_lifetime` configuration and US$9.99 price, the live AdMob publisher/app/banner ownership match, the packaged privacy manifests, the archive identity and the absence of Google demo inventory. It uploads a production candidate to App Store Connect but does not submit version 1.0 for review.

Canonical listing copy and review notes are in `app-store/APP_STORE_METADATA.md`.

Before the production upload, publish the AdMob European regulations message for the iOS app with English and Spanish enabled, a direct Do not consent option, and the canonical Privacy Policy URL.
