# Grocery Benefits Tracker — native SwiftUI QA

This private QA candidate is a native SwiftUI iPhone/iPad application. It is local-first, bilingual (English and Puerto Rican Spanish), and has no account, publisher backend, analytics SDK, live ad request, advertising identifier, card-number field, PIN field, or government login.

## Test artifact

The draft pull request runs **Build SwiftUI iPhone QA**. A successful run produces:

- `Grocery-Benefits-Tracker-SwiftUI-QA-v1.0.0-Simulator.app.zip`
- its SHA-256 checksum

The `.app.zip` is an unsigned, universal (`arm64` + `x86_64`) iOS Simulator build intended for browser-based simulator services such as Appetize. It is not a physical-iPhone IPA and cannot be installed by tapping it on an iPhone. A physical-device IPA requires Apple signing assets and a registered test-device route; TestFlight is the cleaner later route.

CI builds the exact pull-request head, runs unit, persistence, export and fresh-onboarding UI tests, verifies the deployment target, extracts and validates the final ZIP, clean-installs that extracted app, sustains a first launch and cold relaunch, and embeds source-commit/run provenance in the packaged `Info.plist`. The checksum records only the package filename so the two downloaded files verify side by side with `shasum -c`.

## Included QA flows

- language, program-wording, privacy and terms onboarding
- multiple named local cards and manually tracked balances
- benefit receipts with single-use reversal
- grocery basket, learned classifications, saved stores and exact integer-cent totals
- immutable completed purchases, copy-to-basket, optional balance refund on deletion, and card/store/date/eligibility history filters
- monthly, overall and custom reports
- native PDF and typed `.xlsx` generation through the iOS share sheet
- local banner, interstitial and rewarded-ad simulations that make no network request
- semantically validated, checksummed atomic persistence with five recovery snapshots, commit reconciliation, local-only backup exclusion, and erasure that purges recovery files and temporary exports

The app is an independent manual planning aid. It does not connect to benefits, show an official balance, determine official eligibility, process payments, or guarantee a retailer decision.
