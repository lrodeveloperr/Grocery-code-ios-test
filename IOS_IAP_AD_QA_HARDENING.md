# iOS IAP + Ad QA Hardening

Scope: targeted hardening for the physical-iPhone/TestFlight findings reported 2026-08-26.

## Contextual policy decision

This app serves only a U.S. audience and requests non-personalized ads. This patch does **not** add, expand, or otherwise change UMP/GDPR consent behavior.

## What the current App.tsx already does

The existing native wrapper already contains the following controls and they are intentionally not duplicated:

- a ref-backed purchase/restore operation lock;
- StoreKit update/error listeners connected for the component lifetime;
- listener/connection cleanup on unmount;
- entitlement reconciliation on app foreground;
- ATT resolution before AdMob SDK initialization;
- `await mobileAds().initialize()` before banner eligibility;
- banner rendering only while `removeAdsEntitlement === "not-entitled"`;
- immediate ad-state reset after entitlement becomes active;
- restore followed by entitlement reconciliation;
- error-code handling for cancelled, pending/deferred, and already-owned purchases.

Duplicating those paths would create competing state machines and increase release risk.

## Changes in this branch

### Price validation

`removeAdsPurchase.ts` now exposes `fetchRemoveAdsProductWithValidation(expectedPrice)` and retains the existing `fetchRemoveAdsProduct()` API for App.tsx.

Validation is storefront-aware:

- StoreKit remains authoritative for the customer-facing localized price.
- Numeric comparison to the intended `9.99` occurs only when StoreKit reports `currency === "USD"`.
- A non-USD localized display such as `CA$12.99` is not treated as a configuration failure for a US$9.99 base price.
- A real USD mismatch produces a release diagnostic without blocking StoreKit.

The GitHub TestFlight and production workflows separately query App Store Connect and enforce an active U.S. price of US$9.99 before upload.

### Transaction finishing

`finishVerifiedRemoveAdsPurchase()` now retries `finishTransaction()` up to three times with exponential backoff. App.tsx already grants/synchronizes the entitlement before finishing, so a transient finish failure cannot re-enable ads; an unfinished transaction can still be replayed by StoreKit later.

### QA AdMob configuration

`app.config.js` now:

- accepts `EXPO_PUBLIC_QA_IOS_ADMOB_BANNER_ID`;
- falls back to Google's official iOS test banner ID `ca-app-pub-3940256099942544/2934735716` in QA;
- accepts comma-separated `EXPO_PUBLIC_QA_ADMOB_TEST_DEVICE_IDS`;
- places QA test-device IDs into iOS configuration while production receives an empty list.

### Physical iPhone test-device registration

Because this release pipeline assembles the checked-in Xcode project without Expo prebuild, `configure-ios-test.sh` explicitly writes QA test-device IDs into Info.plist. `AppDelegate.swift` reads and applies those identifiers to `MobileAds.shared.requestConfiguration.testDeviceIdentifiers` before React Native initializes AdMob.

`configure-ios-production.sh` explicitly writes a production profile and an empty test-device list, preventing QA IDs from leaking into an App Store release.

Google's official test app/banner IDs should already return test inventory on a physical device; test-device registration is an additional diagnostic/safety path, especially if a publisher-owned ad unit is ever used for QA.

## Manual follow-up

### App Store Connect

- Confirm `remove_ads_lifetime` is **Non-Consumable**.
- Confirm the active **United States customer price is US$9.99**.
- Do not infer the U.S. base price solely from a TestFlight dialog shown under a non-U.S. tester storefront.

### AdMob

- Production app ID: verify the reviewed production iOS app ID.
- Production banner ID: verify the reviewed production iOS banner unit ID.
- QA can leave `EXPO_PUBLIC_QA_IOS_ADMOB_BANNER_ID` unset to use Google's official test banner.
- For a physical QA device, obtain the test-device identifier from the Google Mobile Ads console log after an ad request and set `EXPO_PUBLIC_QA_ADMOB_TEST_DEVICE_IDS` to that identifier (comma-separated for multiple devices).
- Never set QA test-device IDs in the production environment.

### Environment

Recommended QA values:

```text
EXPO_PUBLIC_BUILD_PROFILE=qa
EXPO_PUBLIC_AD_PROFILE=test
EXPO_PUBLIC_QA_IOS_ADMOB_BANNER_ID=
EXPO_PUBLIC_QA_ADMOB_TEST_DEVICE_IDS=<physical-iPhone-test-device-id>
EXPO_PUBLIC_REMOVE_ADS_EXPECTED_USD_PRICE=9.99
```

Recommended production value for price diagnostics:

```text
EXPO_PUBLIC_REMOVE_ADS_EXPECTED_USD_PRICE=9.99
```

Production AdMob identifiers remain mandatory under the existing production validation.
