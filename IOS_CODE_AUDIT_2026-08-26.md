# Grocery Benefits Tracker iOS — adversarial code audit

Date: 2026-08-26
Branch under review: `fix/ios-iap-ad-qa-hardening-20260826`

## Audit constraint

This review is advisory. It must not change the tracker’s business/backend logic or user interface. Release hardening may change native IAP/ad lifecycle, error handling, build configuration, tests, and release tooling only.

## Current findings

| Severity | Finding | Status | Recommendation |
| --- | --- | --- | --- |
| P1 | A banner load failure previously exhausted a short retry sequence and could stay absent for the rest of a supermarket session even after connectivity returned. | Fixed in release hardening | Keep capped long-lived retry (`2s → 5s → 15s → 30s → 60s → 2m → 5m`), reachability probing, captive-portal rejection, jitter, foreground recovery, and one-load-at-a-time locking. |
| P1 | If ATT/AdMob SDK startup fails while the app launches offline, the ad gate could become blocked before the banner retry subsystem exists. | Fixed in release assembly | Distinguish a transient SDK/network startup failure from a real privacy/ad-request block. Retry only the transient state; never retry a genuine privacy block as a network failure. |
| P1 | If StoreKit is unavailable at launch, entitlement can become `unknown`; ads correctly fail closed, but without recovery a free user could remain ad-free for the whole session and a paid user’s state would remain unresolved. | Fixed in release assembly | Keep entitlement `unknown` fail-closed and add capped foreground-only StoreKit recovery. Never infer `not-entitled` from a network failure. |
| P1 | Remove Ads pricing can drift in App Store Connect while StoreKit remains authoritative. | Fixed | Compare numeric StoreKit price only for USD storefronts against intended USD 9.99; warn without blocking purchase. Do not compare localized display strings across currencies. |
| P1 | A physical-iPhone QA path could lack explicit test-device configuration, while production must never inherit QA identifiers. | Fixed | Keep optional QA test-device IDs injected before Mobile Ads initialization and force an empty production list. Google’s official test banner remains the QA fallback. |
| P1 | Ads must disappear as soon as Remove Ads entitlement is verified. | Verified / hardened | Continue gating every banner mount/retry on exact `not-entitled` state; `checking`, `unknown`, and `entitled` must all suppress ads. |
| P2 | `finishTransaction` failure can leave StoreKit transactions replaying on later launches. | Fixed | Keep three bounded exponential-backoff finish attempts after local entitlement is applied; if all fail, keep entitlement and let StoreKit replay rather than revoking the purchase. |
| P2 | Restore can reconcile immediately after `restorePurchases()` and may briefly report `none` before a delayed restored transaction callback arrives. The persistent listener will later correct entitlement, but transient UX/state feedback can be misleading. | Open recommendation | Add a bounded restore waiter tied to the existing `purchaseUpdatedListener`, or extend restore reconciliation until a restored purchase or deterministic timeout is reached. Do not grant entitlement without StoreKit verification. |
| P2 | Local notification reconciliation schedules desired reminders one by one and only removes stale reminders after scheduling. A mid-loop scheduling failure can leave a partial new schedule alongside the old schedule. | Open recommendation | Make notification reconciliation transactional where practical: snapshot owned reminders, stage desired schedule, then reconcile/rollback on failure. Do not alter reminder semantics or UI. |
| P2 | Native + WebView “Clear All” is necessarily multi-store. A failure between native reminder/cache cleanup and web-store clearing can produce a partial clear unless the web layer retries/reconciles. | Open recommendation | Keep a durable request/acknowledgement protocol and make Clear All idempotent so repeating it always converges to an empty state. Audit the canonical web handler before changing anything. |
| P2 | Release assembly currently mutates `App.tsx`/test source during `embed-web-app.mjs` to layer outage hardening over a frozen source archive. This is deterministic but increases review drift risk. | Open release-engineering recommendation | After this release is proven on-device, fold the hardened native code and regression assertions directly into the canonical overlay/source archive, then retire the compatibility mutation and legacy two-retry verifier token. No UI/business-logic change is required. |
| P3 | Several native paths intentionally swallow non-critical cleanup/share errors. Silent failures are safe for app continuity but can make field diagnosis difficult without analytics. | Open recommendation | Keep the app privacy-first; add only local/QA diagnostic counters and console diagnostics, never user identifiers or a new analytics backend. |

## Release invariants the auditor expects to remain true

1. Core grocery/SNAP/WIC tracking continues to work without a network connection.
2. Network, AdMob, ATT, App Store, or StoreKit failures must never block core tracker use.
3. `entitled`, `checking`, and `unknown` entitlement states never show ads.
4. Only a verified `not-entitled` state may enter the ad path.
5. Ads use non-personalized requests only.
6. No new UMP/GDPR flow is introduced by this hardening work.
7. Production contains no Google demo IDs as live production inventory and no QA test-device identifiers.
8. QA can use Google’s official test banner without a physical-device registration; optional test-device IDs remain QA-only.
9. StoreKit remains the customer-price authority; diagnostics never block a valid purchase because of a displayed-price comparison.
10. Audit recommendations do not alter the tracker’s domain/business logic or UI.

## Audit still in progress

The reviewer is continuing through the canonical web application, native bridge, StoreKit lifecycle, notification/export bridges, release scripts, and GitHub Actions release gates. New findings should be appended here with severity and disposition before TestFlight.
