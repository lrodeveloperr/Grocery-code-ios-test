import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const EXPECTED_HTML_SOURCE_SHA256 =
  "4396656534aa5d171838c4d71d5f8f0c9e8e5d30cb8889d50fa50c0ce428e0cc";
const EXPECTED_HTML_SHA256 =
  "22ec05f8b51934d975fb1187cfa51e64fa18161d0d9b231dcd50bb9684a362e9";
const EXPECTED_ICON_SHA256 =
  "f1290c34477ea540105bc74c14b0c2c1c0330bd6355c375c87d86c897df2b628";
const EXPECTED_BRAND_LOGO_SHA256 =
  "add926c3169f8f7badecb0239ae6a6ae5dce457129ff609d04b323ffce93364e";
const EXPECTED_BRAND_SOURCE_SHA256 =
  "321df5298d96acbbf542dc74241b0c1592b1b1c7a4e8083c935a95e66af84dc3";
const EXPECTED_SPLASH_SHA256 = Object.freeze([
  "bc03268f8abb73de2d51ce85310d7b1a0f990fd3bf8a37ee16418cd4cfee8fa1",
  "1fb439ed990f02073b677b8fed237b1b709ca8e19ff678d2c286a0b065ad2b8c",
  "d95f8bb0941cbf93048fdf27df6eaab28a68476da59340c231f519a8a17ef191",
]);
const EXPECTED_ANDROID_FOREGROUND_SHA256 =
  "188cf8deaa47857bc1fe1d329c05f1a7f0f9bd1a30ecf5d639ff58216ff26849";
const EXPECTED_ANDROID_MONOCHROME_SHA256 =
  "09256eb0001160ddca8d7c70c5dc106ce841de6c7798af01a839e80274e6cb05";
const EXPECTED_PLAY_STORE_ICON_SHA256 =
  "eba627fe3dd6cc8903a4751abbf0d65c7412a63acf041603a7fab2c045e456aa";
const TEST_APP_ID = "ca-app-pub-3940256099942544~1458002511";
const TEST_BANNER_ID = "ca-app-pub-3940256099942544/2934735716";

const read = (path) => readFile(path, "utf8");
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function requireText(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: missing ${JSON.stringify(needle)}`);
  }
}

function forbidText(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: forbidden ${JSON.stringify(needle)}`);
  }
}

const [htmlSource, app, appJson, appConfig, delegate, plist, embedded, packageJson, packageLock, skadText, iconBase64, brandBase64, iconFile, brandFile, brandSourceFile, splashAsset1x, splashAsset2x, splashAsset3x, androidForeground, androidMonochrome, androidSplash, playStoreIcon, genericSplash, splashColors, nativeIcon, splash1x, splash2x, splash3x] =
  await Promise.all([
    read("app.html"),
    read("App.tsx"),
    read("app.json"),
    read("app.config.js"),
    read("ios/SNAPEBTGroceryTrackerQA/AppDelegate.swift"),
    read("ios/SNAPEBTGroceryTrackerQA/Info.plist"),
    read("src/appHtml.ts"),
    read("package.json"),
    read("package-lock.json"),
    read("ios/skadnetwork-ids.txt"),
    read("assets/app-icon.png.base64"),
    read("assets/app-logo-256.png.base64"),
    readFile("assets/app-icon.png"),
    readFile("assets/app-logo-256.png"),
    readFile("assets/brand-logo-source-1254.png"),
    readFile("assets/splash-logo-176.png"),
    readFile("assets/splash-logo-352.png"),
    readFile("assets/splash-logo-528.png"),
    readFile("assets/android-icon-foreground.png"),
    readFile("assets/android-icon-monochrome.png"),
    readFile("assets/android-splash-icon.png"),
    readFile("assets/play-store-icon-512.png"),
    readFile("assets/splash-icon.png"),
    read("ios/SNAPEBTGroceryTrackerQA/Images.xcassets/SplashScreenBackground.colorset/Contents.json"),
    readFile("ios/SNAPEBTGroceryTrackerQA/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"),
    readFile("ios/SNAPEBTGroceryTrackerQA/Images.xcassets/SplashScreenLogo.imageset/image.png"),
    readFile("ios/SNAPEBTGroceryTrackerQA/Images.xcassets/SplashScreenLogo.imageset/image@2x.png"),
    readFile("ios/SNAPEBTGroceryTrackerQA/Images.xcassets/SplashScreenLogo.imageset/image@3x.png"),
  ]);

if (sha256(htmlSource) !== EXPECTED_HTML_SOURCE_SHA256) {
  throw new Error(`Canonical HTML source digest changed: ${sha256(htmlSource)}`);
}
const logoMarker = "__GBT_APP_LOGO_PNG_BASE64__";
if (htmlSource.split(logoMarker).length !== 2) throw new Error("Expected one brand-logo marker.");
const cleanBrandBase64 = brandBase64.replace(/\s/g, "");
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBrandBase64)) throw new Error("Brand logo base64 is invalid.");
const html = htmlSource.replace(logoMarker, cleanBrandBase64);
if (sha256(html) !== EXPECTED_HTML_SHA256) throw new Error(`Materialized HTML digest changed: ${sha256(html)}`);
requireText(
  embedded,
  `export const APP_HTML_SHA256 = "${EXPECTED_HTML_SHA256}";`,
  "embedded source",
);
requireText(
  embedded,
  `export const APP_HTML_SOURCE_SHA256 = "${EXPECTED_HTML_SOURCE_SHA256}";`,
  "embedded source",
);

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if (scripts.length < 2) throw new Error("Expected multiple inline application scripts.");
for (const [index, match] of scripts.entries()) {
  try {
    new Function(match[1]);
  } catch (error) {
    throw new Error(`Inline script ${index + 1} failed syntax validation: ${error}`);
  }
}

const sandbox = {
  console,
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Uint32Array,
  ArrayBuffer,
  DataView,
  Intl,
  Date,
  Math,
  JSON,
  Map,
  Set,
  Promise,
  structuredClone,
  Blob,
  atob,
  btoa,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(scripts[0][1], sandbox, { filename: "GBTCore.inline.js" });
vm.runInContext(scripts[3][1], sandbox, { filename: "GBTRemediation.inline.js" });
const Core = sandbox.GBTCore;
const Reports = sandbox.GBTRemediation;
if (!Core || !Reports) throw new Error("Could not load pure application/report logic.");

const unconfiguredBudgetState = Core.canonicalState();
unconfiguredBudgetState.basket.items = [
  {
    id: "cash-item",
    name: "Water",
    quantity: 1,
    quantityRaw: "1",
    quantityUnit: "each",
    priceKnown: true,
    unitPriceCents: 99,
    priceEntryMode: "UNIT_PRICE",
    lineTotalCents: null,
    funding: { mode: "CASH" },
  },
];
if (Core.validateBasketForCheckout(unconfiguredBudgetState).warnings.length !== 0) {
  throw new Error("An unconfigured zero-dollar shopping budget produced an over-budget warning.");
}
unconfiguredBudgetState.cash = Core.makeCashPeriod({
  baseBudget: 50,
  start: "2026-08-01",
});
if (
  !Core.validateBasketForCheckout(unconfiguredBudgetState).warnings.some(
    (warning) => warning.code === "CASH_OVER_BUDGET",
  )
) {
  throw new Error("A configured shopping budget no longer warns when checkout exceeds it.");
}

const exactPriceItem = {
  id: "exact-price-item",
  name: "Weighted produce",
  quantity: 0.29,
  quantityRaw: "0.29",
  quantityUnit: "lb",
  priceKnown: true,
  unitPriceCents: 750,
  priceEntryMode: "UNIT_PRICE",
  lineTotalCents: null,
  category: "produce",
  snapEligibility: "ELIGIBLE",
  funding: { mode: "CASH" },
};
if (
  Core.itemTotalCents(exactPriceItem) !== 218 ||
  Reports.itemTotalCents(750, 0.29, null, "0.29") !== 218
) {
  throw new Error("Exact quantity pricing regressed for 0.29 × $7.50.");
}
const exactCheckoutState = Core.canonicalState();
exactCheckoutState.settings.language = "en-US";
exactCheckoutState.settings.programJurisdiction = Reports.PROGRAM_JURISDICTION.US_SNAP;
exactCheckoutState.basket.items = [structuredClone(exactPriceItem)];
const exactCheckoutValidation = Core.validateBasketForCheckout(
  exactCheckoutState,
  exactCheckoutState.basket,
  Core.isoDate(),
);
if (
  exactCheckoutValidation.blockers.length ||
  exactCheckoutValidation.plan?.cashDeltaCents !== 218
) {
  throw new Error("Exact quantity checkout did not allocate 218 cents.");
}
const exactCheckout = Core.applyCheckoutTransaction(exactCheckoutState, exactCheckoutValidation, {
  transactionDate: Core.isoDate(),
});
if (exactCheckout.record.totalKnownCents !== 218) {
  throw new Error("Exact quantity checkout stored a different transaction total.");
}
await Reports.validateHistoryTransaction(exactCheckout.record, {
  path: "verify.exactCheckout",
  sourceMeta: {
    sourceLocale: "en-US",
    sourceProgramJurisdiction: Reports.PROGRAM_JURISDICTION.US_SNAP,
  },
});

const aggregateWicState = Core.canonicalState();
aggregateWicState.wicCards = [{
  id: "aggregate-wic-card",
  active: true,
  allowances: [{
    id: "aggregate-wic-benefit",
    active: true,
    unit: "oz",
    starting: 100000,
    remaining: 100000,
    transactions: [],
  }],
}];
aggregateWicState.basket.items = ["one", "two"].map((suffix) => ({
  ...structuredClone(exactPriceItem),
  id: `aggregate-wic-${suffix}`,
  quantity: 1,
  quantityRaw: "1",
  unitPriceCents: 100,
  funding: {
    mode: "WIC",
    wicCardId: "aggregate-wic-card",
    allowanceId: "aggregate-wic-benefit",
    wicUnit: "oz",
    wicQuantity: 60000,
  },
}));
const aggregateWicValidation = Core.validateBasketForCheckout(aggregateWicState);
const aggregateWicBlocker = aggregateWicValidation.blockers.find(
  (blocker) => blocker.code === "WIC_INSUFFICIENT",
);
if (
  !aggregateWicBlocker ||
  aggregateWicBlocker.required !== 120000 ||
  aggregateWicBlocker.available !== 100000
) {
  throw new Error("An oversized WIC basket did not return a normal insufficient-benefit blocker.");
}

const aggregateCashState = Core.canonicalState();
aggregateCashState.cash = Core.makeCashPeriod({
  baseBudget: Reports.LIMITS.maxMoneyCents,
  start: Core.isoDate(),
});
aggregateCashState.basket.items = ["one", "two"].map((suffix) => ({
  ...structuredClone(exactPriceItem),
  id: `aggregate-cash-${suffix}`,
  quantity: 1,
  quantityRaw: "1",
  unitPriceCents: 60000000000,
  funding: { mode: "CASH" },
}));
if (
  !Core.validateBasketForCheckout(aggregateCashState).blockers.some(
    (blocker) => blocker.code === "FUNDING_TOTAL_LIMIT",
  )
) {
  throw new Error("An unsupported aggregate Cash ledger total was allowed through validation.");
}
let oversizedCashBudgetCode = "";
try {
  Core.makeCashPeriod({
    baseBudget: Reports.LIMITS.maxMoneyCents,
    carryover: Reports.LIMITS.maxMoneyCents,
    start: Core.isoDate(),
  });
} catch (error) {
  oversizedCashBudgetCode = error?.code || "";
}
if (oversizedCashBudgetCode !== "CASH_BUDGET_LIMIT") {
  throw new Error("An unsupported aggregate Cash budget did not fail closed.");
}
const maximumBudgetRolloverState = Core.canonicalState();
maximumBudgetRolloverState.cash = Core.makeCashPeriod({
  baseBudget: Reports.LIMITS.maxMoneyCents,
  spent: Reports.LIMITS.maxMoneyCents - 1,
  start: "2026-01-01",
});
const maximumBudgetPending = Core.processExpiredCashPeriod(
  maximumBudgetRolloverState,
  "2026-02-01",
).state;
const maximumBudgetCarried = Core.applyRolloverChoice(maximumBudgetPending, "carry");
if (
  maximumBudgetCarried.cash.baseBudget !== Reports.LIMITS.maxMoneyCents ||
  maximumBudgetCarried.cash.carryover !== 0 ||
  maximumBudgetCarried.cash.periodBudget !== Reports.LIMITS.maxMoneyCents
) {
  throw new Error("A maximum supported planning budget did not handle rollover safely.");
}

const ineligibleSnapState = Core.canonicalState();
ineligibleSnapState.snapCards = [
  { id: "snap-card", active: true, balance: 1000, startingBalance: 1000, transactions: [] },
];
ineligibleSnapState.basket.items = [
  {
    ...structuredClone(exactPriceItem),
    id: "ineligible-snap-item",
    quantity: 1,
    quantityRaw: "1",
    unitPriceCents: 100,
    snapEligibility: "NOT_ELIGIBLE",
    funding: { mode: "SNAP", snapCardId: "snap-card" },
  },
];
if (
  !Core.validateBasketForCheckout(ineligibleSnapState).blockers.some(
    (blocker) => blocker.code === "SNAP_NOT_ELIGIBLE",
  )
) {
  throw new Error("A SNAP-ineligible grocery item passed direct SNAP checkout.");
}

const wicUnitState = Core.canonicalState();
wicUnitState.wicCards = [
  {
    id: "wic-card",
    active: true,
    allowances: [
      {
        id: "eggs-dozen",
        active: true,
        unit: "dozen",
        starting: 2,
        remaining: 2,
        startDate: "",
        expiryDate: "",
        transactions: [],
      },
    ],
  },
];
wicUnitState.basket.items = [
  {
    ...structuredClone(exactPriceItem),
    id: "eggs-item",
    name: "Eggs",
    quantity: 1,
    quantityRaw: "1",
    quantityUnit: "each",
    unitPriceCents: 300,
    funding: {
      mode: "WIC",
      wicCardId: "wic-card",
      allowanceId: "eggs-dozen",
      wicQuantity: 1,
      wicUnit: "dozen",
    },
  },
];
const mismatchedUnitValidation = Core.validateBasketForCheckout(wicUnitState);
if (
  mismatchedUnitValidation.blockers.length ||
  mismatchedUnitValidation.plan?.wicDeltas?.["wic-card::eggs-dozen"] !== 1
) {
  throw new Error("A one-line eggs purchase could not redeem a dozen-based WIC benefit.");
}
wicUnitState.wicCards[0].allowances[0].unit = "oz";
wicUnitState.wicCards[0].allowances[0].starting = 24;
wicUnitState.wicCards[0].allowances[0].remaining = 24;
wicUnitState.basket.items[0].name = "Cereal box";
wicUnitState.basket.items[0].quantity = 1;
wicUnitState.basket.items[0].quantityRaw = "1";
wicUnitState.basket.items[0].quantityUnit = "each";
wicUnitState.basket.items[0].funding.wicUnit = "oz";
wicUnitState.basket.items[0].funding.wicQuantity = 12;
const packageMeasureValidation = Core.validateBasketForCheckout(wicUnitState);
if (
  packageMeasureValidation.blockers.length ||
  packageMeasureValidation.plan?.wicDeltas?.["wic-card::eggs-dozen"] !== 12 ||
  packageMeasureValidation.plan?.itemAllocations?.[0]?.allocations?.[0]?.amountCents !== 300
) {
  throw new Error("A package grocery line could not record its separate WIC benefit measure.");
}

const sanitizedState = Core.normalizeState({
  schemaVersion: Core.SCHEMA_VERSION,
  settings: {},
  history: [null],
  snapCards: [null],
  wicCards: [null],
});
if (sanitizedState.history.length || sanitizedState.snapCards.length || sanitizedState.wicCards.length) {
  throw new Error("Malformed null records survived state normalization.");
}

let invalidTransactionDateCode = "";
try {
  Reports.validTransactionDate("1999-12-31", "verify.transactionDate");
} catch (error) {
  invalidTransactionDateCode = error?.code || "";
}
if (invalidTransactionDateCode !== Reports.ERROR.INVALID_TRANSACTION) {
  throw new Error("Pre-2000 transaction dates were not rejected consistently.");
}

let privacyFieldCode = "";
try {
  Reports.assertNoIdentityFields({ address: "prohibited" }, "verify.privacy");
} catch (error) {
  privacyFieldCode = error?.code || "";
}
if (privacyFieldCode !== Reports.ERROR.PRIVACY_FIELD_PROHIBITED) {
  throw new Error("Prohibited identity fields no longer report a stable privacy error.");
}

const oldBudgetState = Core.canonicalState();
oldBudgetState.cash = Core.makeCashPeriod({
  baseBudget: 10000,
  spent: 2500,
  start: "2026-07-01",
  periodId: "old-budget-period",
});
const resetBudgetState = Core.resetCashTiming(oldBudgetState, {
  cycle: "monthly",
  start: "2026-08-01",
});
resetBudgetState.cash.baseBudget = 20000;
resetBudgetState.cash.periodBudget = 20000;
if (
  resetBudgetState.cash.periodHistory[0]?.baseBudget !== 10000 ||
  resetBudgetState.cash.periodHistory[0]?.spent !== 2500 ||
  resetBudgetState.cash.periodHistory[0]?.end !== "2026-07-31" ||
  resetBudgetState.cash.start !== "2026-08-01" ||
  resetBudgetState.cash.baseBudget !== 20000
) {
  throw new Error("Starting a new budget period rewrote the archived period.");
}

const pendingRolloverState = Core.canonicalState();
pendingRolloverState.basket.items = [structuredClone(exactPriceItem)];
pendingRolloverState.cash.pendingRollover = {
  sourcePeriodId: "expired-period",
  amountCents: 500,
  nextStart: Core.isoDate(),
  nextEnd: Core.periodEnd(Core.isoDate(), "monthly"),
};
if (
  !Core.validateBasketForCheckout(pendingRolloverState).blockers.some(
    (blocker) => blocker.code === "CASH_ROLLOVER_PENDING",
  )
) {
  throw new Error("Checkout remained available while a cash rollover decision was pending.");
}

const historicalCashCheckoutState = Core.canonicalState();
historicalCashCheckoutState.cash = Core.makeCashPeriod({
  baseBudget: 10000,
  spent: 0,
  start: "2026-08-01",
  periodId: "current-august-period",
});
historicalCashCheckoutState.cash.periodHistory = [
  {
    id: "historical-july-period",
    start: "2026-07-01",
    end: "2026-07-31",
    baseBudget: 10000,
    carryover: 0,
    periodBudget: 10000,
    spent: 500,
  },
];
historicalCashCheckoutState.basket = {
  store: "Store",
  transactionDate: "2026-07-10",
  items: [structuredClone(exactPriceItem)],
};
const historicalCashValidation = Core.validateBasketForCheckout(
  historicalCashCheckoutState,
  historicalCashCheckoutState.basket,
  "2026-07-10",
);
if (
  historicalCashValidation.blockers.length ||
  historicalCashValidation.plan?.cashPeriodId !== "historical-july-period"
) {
  throw new Error("A historical cash receipt did not resolve to its dated budget period.");
}
const historicalCashCheckout = Core.applyCheckoutTransaction(
  historicalCashCheckoutState,
  historicalCashValidation,
  { transactionDate: "2026-07-10" },
);
if (
  historicalCashCheckout.state.cash.spent !== 0 ||
  historicalCashCheckout.state.cash.periodHistory[0]?.spent !== 718 ||
  historicalCashCheckout.record.cashPeriodId !== "historical-july-period"
) {
  throw new Error("Historical checkout charged the current cash period.");
}

const overlappingCashState = Core.clone(historicalCashCheckoutState);
overlappingCashState.cash.periodHistory.push({
  id: "overlapping-period",
  start: "2026-08-01",
  end: "2026-08-31",
  periodBudget: 10000,
  spent: 0,
});
if (Core.cashPeriodForDate(overlappingCashState, "2026-08-10") !== null) {
  throw new Error("Overlapping cash periods did not fail closed.");
}
const missingDatePeriodState = Core.clone(historicalCashCheckoutState);
missingDatePeriodState.cash.periodHistory.push({
  id: "legacy-undated-period",
  start: "",
  end: "",
  periodBudget: 0,
  spent: 0,
});
if (Core.cashPeriodForDate(missingDatePeriodState, "2026-08-10")?.periodId !== "current-august-period") {
  throw new Error("An undated legacy period behaved as an unbounded Cash-period wildcard.");
}

const firstDayCadenceState = Core.canonicalState();
firstDayCadenceState.cash = Core.makeCashPeriod({
  baseBudget: 1000,
  start: Core.isoDate(),
  cycle: "monthly",
});
const firstDayCadence = Core.resetCashTiming(firstDayCadenceState, {
  cycle: "weekly",
  start: Core.isoDate(),
});
if (
  firstDayCadence.cash.cycle !== "weekly" ||
  firstDayCadence.cash.periodHistory.length !== 0 ||
  firstDayCadence.cash.end !== Core.addDays(Core.isoDate(), 6)
) {
  throw new Error("A first-day cadence change did not update the current period safely.");
}

const sameDayCashState = Core.canonicalState();
sameDayCashState.cash = Core.makeCashPeriod({
  baseBudget: 1000,
  spent: 100,
  start: "2026-08-01",
  periodId: "same-day-period",
});
sameDayCashState.history = [{
  id: "same-day-cash-transaction",
  transactionDate: "2026-08-10",
  cashPeriodId: "same-day-period",
  items: [{ allocations: [{ type: "CASH", amountCents: 100 }] }],
}];
let sameDayTimingCode = "";
try {
  Core.resetCashTiming(sameDayCashState, { cycle: "weekly", start: "2026-08-10" });
} catch (error) {
  sameDayTimingCode = error?.code || "";
}
if (sameDayTimingCode !== "CASH_TIMING_HAS_ACTIVITY") {
  throw new Error("A same-day period reset could orphan recorded Cash activity.");
}

const longInactiveCashState = Core.canonicalState();
longInactiveCashState.cash = Core.makeCashPeriod({
  baseBudget: 0,
  spent: 0,
  start: "2020-01-01",
  cycle: "weekly",
});
const caughtUpCash = Core.processExpiredCashPeriod(longInactiveCashState, "2026-08-10");
if (!caughtUpCash.changed || caughtUpCash.state.cash.end < "2026-08-10") {
  throw new Error("A long-inactive zero-budget period did not catch up in one launch.");
}

const monthEndReminder = Core.normalizeReminder({
  enabled: true,
  nextDate: "2026-01-31",
});
const februaryReminder = Core.processMonthlyReminder(monthEndReminder, "2026-01-31");
const marchReminder = Core.processMonthlyReminder(februaryReminder.reminder, "2026-02-28");
if (
  !februaryReminder.notify ||
  februaryReminder.reminder.nextDate !== "2026-02-28" ||
  marchReminder.reminder.nextDate !== "2026-03-31"
) {
  throw new Error("End-of-month reminder drifted after February.");
}

let unsafeTotalCode = "";
try {
  Reports.safeIntegerSum([Number.MAX_SAFE_INTEGER, 1], "verify.unsafeTotal");
} catch (error) {
  unsafeTotalCode = error?.code || "";
}
if (unsafeTotalCode !== Reports.ERROR.INVALID_NUMBER) {
  throw new Error("An unsafe aggregate total did not fail closed.");
}

const historyItem = ({
  id = "history-item",
  name = "Milk",
  price = 500,
  allocations = [{ type: "CASH", amountCents: 500 }],
} = {}) => ({
  id,
  name,
  quantity: 1,
  quantityRaw: "1",
  quantityUnit: "each",
  unitPriceCents: price,
  priceKnown: true,
  priceEntryMode: "UNIT_PRICE",
  lineTotalCents: null,
  category: "dairy",
  reportCategoryAtTransaction: "dairy",
  reportCategorySource: "RECORDED",
  allocations,
});
const correctedBasketItem = (item, funding) => ({
  id: item.id,
  name: item.name,
  quantity: item.quantity,
  quantityRaw: item.quantityRaw,
  quantityUnit: item.quantityUnit,
  unitPriceCents: item.unitPriceCents,
  priceKnown: item.priceKnown,
  priceEntryMode: item.priceEntryMode,
  lineTotalCents: item.lineTotalCents,
  category: item.category,
  snapEligibility: "ELIGIBLE",
  funding,
});

const unresolvedHistoryItem = historyItem({
  id: "legacy-unresolved-item",
  price: 0,
  allocations: [{ type: "UNRESOLVED", amountCents: null }],
});
unresolvedHistoryItem.priceKnown = false;
unresolvedHistoryItem.unitPriceCents = null;
const unresolvedCorrectionState = Core.canonicalState();
unresolvedCorrectionState.snapCards = [
  { id: "resolution-snap", active: true, balance: 1000, startingBalance: 1000, transactions: [] },
];
unresolvedCorrectionState.wicCards = [{
  id: "resolution-wic-card",
  active: true,
  allowances: [{
    id: "resolution-wic-benefit",
    active: true,
    unit: "oz",
    starting: 24,
    remaining: 24,
    startDate: "",
    expiryDate: "",
    transactions: [],
  }],
}];
unresolvedCorrectionState.history = [{
  id: "legacy-unresolved-transaction",
  transactionDate: Core.isoDate(),
  store: "Store",
  storeDisplayName: "Store",
  storeNormalizedKey: "store",
  cashPeriodId: null,
  items: [structuredClone(unresolvedHistoryItem)],
  totalKnownCents: 0,
  unknownPriceCount: 1,
}];
const resolvedBase = {
  ...correctedBasketItem(unresolvedHistoryItem, { mode: "CASH" }),
  priceKnown: true,
  unitPriceCents: 500,
};
const resolvedCash = Core.correctHistoryTransactionDetails(
  unresolvedCorrectionState,
  "legacy-unresolved-transaction",
  { store: "Store", transactionDate: Core.isoDate(), items: [resolvedBase] },
);
if (
  resolvedCash.validation.blockers.length ||
  resolvedCash.state.cash.spent !== 500 ||
  resolvedCash.state.history[0].cashPeriodId !== unresolvedCorrectionState.cash.periodId
) {
  throw new Error("An unresolved legacy item could not be resolved atomically to Cash.");
}
const resolvedSnap = Core.correctHistoryTransactionDetails(
  unresolvedCorrectionState,
  "legacy-unresolved-transaction",
  {
    store: "Store",
    transactionDate: Core.isoDate(),
    items: [{ ...resolvedBase, funding: { mode: "SNAP", snapCardId: "resolution-snap" } }],
  },
);
if (
  resolvedSnap.validation.blockers.length ||
  resolvedSnap.state.snapCards[0].balance !== 500 ||
  resolvedSnap.state.history[0].cashPeriodId !== null
) {
  throw new Error("A SNAP-only legacy correction still depended on a Cash period.");
}
const resolvedWic = Core.correctHistoryTransactionDetails(
  unresolvedCorrectionState,
  "legacy-unresolved-transaction",
  {
    store: "Store",
    transactionDate: Core.isoDate(),
    items: [{
      ...resolvedBase,
      funding: {
        mode: "WIC",
        wicCardId: "resolution-wic-card",
        allowanceId: "resolution-wic-benefit",
        wicQuantity: 12,
        wicUnit: "oz",
      },
    }],
  },
);
if (
  resolvedWic.validation.blockers.length ||
  resolvedWic.state.wicCards[0].allowances[0].remaining !== 12 ||
  resolvedWic.state.history[0].cashPeriodId !== null
) {
  throw new Error("An unresolved legacy item could not be resolved atomically to WIC.");
}

const retiredSourceState = Core.canonicalState();
retiredSourceState.snapCards = [
  { id: "retired-card", active: false, balance: 900, startingBalance: 1000, transactions: [] },
];
const retiredSourceItem = historyItem({
  price: 100,
  allocations: [{ type: "SNAP", cardId: "retired-card", amountCents: 100 }],
});
retiredSourceState.history = [
  {
    id: "retired-source-transaction",
    transactionDate: "2026-08-05",
    store: "Old store",
    storeDisplayName: "Old store",
    storeNormalizedKey: "old store",
    cashPeriodId: retiredSourceState.cash.periodId,
    items: [retiredSourceItem],
    totalKnownCents: 100,
    unknownPriceCount: 0,
  },
];
const metadataCorrection = Core.correctHistoryTransactionDetails(
  retiredSourceState,
  "retired-source-transaction",
  {
    store: "Corrected store",
    transactionDate: "2026-08-05",
    items: [
      {
        ...correctedBasketItem(retiredSourceItem, {
          mode: "SNAP",
          snapCardId: "retired-card",
        }),
        name: "Corrected milk",
      },
    ],
  },
);
if (
  metadataCorrection.validation.blockers.length ||
  metadataCorrection.state.snapCards[0].balance !== 900 ||
  metadataCorrection.state.history[0].store !== "Corrected store"
) {
  throw new Error("Metadata-only correction touched or rejected a retired funding source.");
}

const cashDateState = Core.canonicalState();
cashDateState.cash = Core.makeCashPeriod({
  baseBudget: 10000,
  spent: 0,
  start: "2026-08-01",
  periodId: "august-period",
});
cashDateState.cash.periodHistory = [
  {
    id: "july-period",
    start: "2026-07-01",
    end: "2026-07-31",
    baseBudget: 10000,
    carryover: 0,
    periodBudget: 10000,
    spent: 500,
    variance: 9500,
    remaining: 9500,
    overage: 0,
    status: "UNDER_BUDGET",
  },
];
const cashHistoryItem = historyItem();
cashDateState.history = [
  {
    id: "cash-date-transaction",
    transactionDate: "2026-07-10",
    store: "Store",
    storeDisplayName: "Store",
    storeNormalizedKey: "store",
    cashPeriodId: "july-period",
    items: [cashHistoryItem],
    totalKnownCents: 500,
    unknownPriceCount: 0,
  },
];
const cashDateCorrection = Core.correctHistoryTransactionDetails(
  cashDateState,
  "cash-date-transaction",
  {
    store: "Store",
    transactionDate: "2026-08-05",
    items: [correctedBasketItem(cashHistoryItem, { mode: "CASH" })],
  },
);
if (
  cashDateCorrection.validation.blockers.length ||
  cashDateCorrection.state.cash.spent !== 500 ||
  cashDateCorrection.state.cash.periodHistory[0].spent !== 0 ||
  cashDateCorrection.state.history[0].cashPeriodId !== "august-period"
) {
  throw new Error("A cross-period transaction-date correction did not move cash spending.");
}

const migratedCashState = Core.normalizeState({
  ...Core.clone(cashDateState),
  schemaVersion: 25,
  history: [
    {
      id: "legacy-cash-period-link",
      transactionDate: "2026-07-10",
      store: "Store",
      items: [structuredClone(cashHistoryItem)],
    },
  ],
});
if (migratedCashState.history[0]?.cashPeriodId !== "july-period") {
  throw new Error("A legacy Cash transaction was not linked to its unique historical period.");
}

const amendmentTransaction = {
  id: "amendment-transaction",
  sourceTransactionId: "amendment-transaction",
  transactionDate: "2026-08-10",
  createdAt: "2026-08-10T12:00:00.000Z",
  recordedAt: "2026-08-10T12:00:00.000Z",
  storeDisplayName: "Store",
  storeNormalizedKey: "store",
  programJurisdiction: Reports.PROGRAM_JURISDICTION.US_SNAP,
  status: "CORRECTED",
  items: [structuredClone(cashHistoryItem)],
  amendments: [
    {
      id: "funding-amendment",
      recordedAt: "2026-08-10T13:00:00.000Z",
      effectiveDate: "2026-08-10",
      kind: "FUNDING_CORRECTION",
      reason: "Corrected payment source",
      itemId: cashHistoryItem.id,
      previousAllocations: [{ type: "CASH", amountCents: 500 }],
      updatedAllocations: [{ type: "CASH", amountCents: 500 }],
    },
  ],
};
const amendmentBackup = await Reports.buildHistoryBackup(
  { history: [amendmentTransaction], wicCards: [] },
  {
    locale: "en-US",
    programJurisdiction: Reports.PROGRAM_JURISDICTION.US_SNAP,
  },
);
const parsedAmendmentBackup = await Reports.parseHistoryBackup(amendmentBackup);
if (
  parsedAmendmentBackup.history[0]?.amendments?.length !== 1 ||
  parsedAmendmentBackup.history[0].amendments[0]?.kind !== "FUNDING_CORRECTION"
) {
  throw new Error("History backup lost its correction audit trail.");
}

const duplicateDigest = "a".repeat(64);
const duplicateImportItem = historyItem({
  id: "duplicate-import-item",
  price: 100,
  allocations: [{ type: "CASH", amountCents: 100 }],
});
const duplicateImportEnvelope = {
  appName: Reports.APP_METADATA.productName,
  version: Reports.TRANSFER_VERSION,
  exportedAt: "2026-08-10T12:00:00.000Z",
  sourceLocale: "en-US",
  sourceProgramJurisdiction: Reports.PROGRAM_JURISDICTION.US_SNAP,
  exportBatchId: "duplicate-digest-batch",
  history: ["source-one", "source-two"].map((sourceTransactionId) => ({
    id: sourceTransactionId,
    sourceTransactionId,
    sourceRecordDigest: duplicateDigest,
    transactionDate: "2026-08-10",
    createdAt: "2026-08-10T12:00:00.000Z",
    recordedAt: "2026-08-10T12:00:00.000Z",
    storeDisplayName: "Store",
    storeNormalizedKey: "store",
    programJurisdiction: Reports.PROGRAM_JURISDICTION.US_SNAP,
    status: "COMPLETED",
    items: [structuredClone(duplicateImportItem)],
  })),
};
const duplicateImportPlan = await Reports.planHistoryImport(
  duplicateImportEnvelope,
  [],
);
if (
  duplicateImportPlan.records.length !== 1 ||
  duplicateImportPlan.duplicates.length !== 1
) {
  throw new Error("Duplicate records within one import envelope were both accepted.");
}

const bridgeMatch = app.match(
  /const NATIVE_BRIDGE_SCRIPT = String\.raw`([\s\S]*?)`;/,
);
if (!bridgeMatch) throw new Error("Could not inspect the native share bridge.");
const bridgeMessages = [];
const bridgeEvents = new Map();
const bridgeDocument = { documentElement: { lang: "en-US" } };
class TestFileReader {
  readAsDataURL(blob) {
    this.result = `data:${blob.type || "application/octet-stream"};base64,WA==`;
    queueMicrotask(() => this.onload?.());
  }
}
const bridgeWindow = {
  ReactNativeWebView: {
    postMessage(value) {
      bridgeMessages.push(JSON.parse(value));
    },
  },
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  addEventListener(name, handler) {
    bridgeEvents.set(name, handler);
  },
  GBTAdRuntime: null,
};
bridgeWindow.window = bridgeWindow;
const bridgeSandbox = {
  window: bridgeWindow,
  document: bridgeDocument,
  navigator: {},
  Blob,
  FileReader: TestFileReader,
  console,
  JSON,
  Math,
  Date,
  Promise,
  Error,
  Object,
  Array,
  String,
  Boolean,
};
vm.createContext(bridgeSandbox);
vm.runInContext(bridgeMatch[1], bridgeSandbox, { filename: "native-bridge.js" });
const readyMessage = bridgeMessages.find((message) => message.type === "bridge-ready");
if (readyMessage?.locale !== "en-US") {
  throw new Error("Native bridge did not publish its initial web locale.");
}
bridgeDocument.documentElement.lang = "es-PR";
bridgeEvents.get("gbt-locale-change")?.();
if (!bridgeMessages.some((message) => message.type === "locale" && message.locale === "es-PR")) {
  throw new Error("Native bridge did not publish a changed web locale.");
}
const firstShare = bridgeWindow.GBTNativeShareFile(
  new Blob(["first"], { type: "application/pdf" }),
  "same-name.pdf",
  "application/pdf",
);
await Promise.resolve();
await Promise.resolve();
const firstMessage = bridgeMessages.find((message) => message.type === "share-file");
if (!firstMessage?.requestId) throw new Error("Native share request was not posted.");
const concurrentError = await bridgeWindow
  .GBTNativeShareFile(new Blob(["second"]), "same-name.pdf", "application/pdf")
  .then(() => "", (error) => error.message);
if (!concurrentError.includes("already open")) {
  throw new Error("Concurrent native exports were not rejected.");
}
bridgeWindow.GBTNativeShareCompleted("stale-request", true);
const staleStillBlocked = await bridgeWindow
  .GBTNativeShareFile(new Blob(["stale"]), "same-name.pdf", "application/pdf")
  .then(() => "", (error) => error.message);
if (!staleStillBlocked.includes("already open")) {
  throw new Error("A stale native acknowledgement unlocked the active export.");
}
bridgeWindow.GBTNativeShareCompleted(firstMessage.requestId, true);
await firstShare;
const secondShare = bridgeWindow.GBTNativeShareFile(
  new Blob(["second"], { type: "application/pdf" }),
  "same-name.pdf",
  "application/pdf",
);
await Promise.resolve();
await Promise.resolve();
const shareMessages = bridgeMessages.filter((message) => message.type === "share-file");
const secondMessage = shareMessages.at(-1);
if (!secondMessage?.requestId || secondMessage.requestId === firstMessage.requestId) {
  throw new Error("Repeated same-name exports reused a native request ID.");
}
bridgeWindow.GBTNativeShareCompleted(secondMessage.requestId, false, "cancelled");
const failureMessage = await secondShare.then(() => "", (error) => error.message);
if (failureMessage !== "cancelled") {
  throw new Error("Native export failure acknowledgement was not propagated.");
}
const recoveredShare = bridgeWindow.GBTNativeShareFile(
  new Blob(["third"], { type: "text/csv" }),
  "same-name.csv",
  "text/csv",
);
await Promise.resolve();
await Promise.resolve();
const recoveredMessage = bridgeMessages.filter((message) => message.type === "share-file").at(-1);
bridgeWindow.GBTNativeShareCompleted(recoveredMessage.requestId, true);
await recoveredShare;

const prefixCases = [
  ["Walmart", "w", true],
  ["Walmart", "wa", true],
  ["Walmart", "wal", true],
  ["Waffles", "WA", true],
  ["Água", "ag", true],
  ["Safeway", "wa", false],
  ["Super Walmart", "wal", false],
  ["Walmart", "", false],
];
for (const [label, query, expected] of prefixCases) {
  if (Reports.prefixSearchMatch(label, query) !== expected) {
    throw new Error(`Prefix matching failed for ${JSON.stringify({ label, query })}.`);
  }
}

const moneyShortcutCases = [
  ["12", "00", false, "1200"],
  ["12", "99", false, "1299"],
  ["", "99", false, "99"],
  ["24000", "00", true, "24000"],
  ["24000", "99", true, "24099"],
];
for (const [digits, suffix, replaceExistingCents, expected] of moneyShortcutCases) {
  const actual = Reports.moneyDigitsWithCentsShortcut(digits, suffix, {
    replaceExistingCents,
  });
  if (actual !== expected) {
    throw new Error(`Money shortcut failed: ${digits} + .${suffix} = ${actual}.`);
  }
}
const maxMoneyDigits = String(Reports.LIMITS.maxMoneyCents);
if (Reports.moneyDigitsWithCentsShortcut(maxMoneyDigits, "99") !== maxMoneyDigits) {
  throw new Error("Money shortcut exceeded the supported maximum.");
}
if (Reports.appendMoneyDigit("99999999999", "9") !== "99999999999") {
  throw new Error("Money digit entry exceeded the supported maximum.");
}
const firstCentsShortcut = Reports.moneyDigitsWithCentsShortcut("12", "99");
const replacedCentsShortcut = Reports.moneyDigitsWithCentsShortcut(
  firstCentsShortcut,
  "00",
  { replaceExistingCents: true },
);
if (firstCentsShortcut !== "1299" || replacedCentsShortcut !== "1200") {
  throw new Error("Repeated cent shortcuts did not replace the current cents.");
}

const newSnapReconciliation = Reports.reconcileSnap({
  snapCards: [
    {
      id: "new-card",
      startingBalance: 10000,
      balance: 10000,
      transactions: [],
    },
  ],
});
if (
  newSnapReconciliation[0]?.calculatedClosingBalance !== 10000 ||
  newSnapReconciliation[0]?.reconciliationVariance !== 0
) {
  throw new Error("A new SNAP card double-counted its opening balance.");
}
const snapAdjustmentReconciliation = Reports.reconcileSnap({
  snapCards: [
    {
      id: "adjusted-card",
      startingBalance: 333333,
      balance: 212222,
      transactions: [
        { date: "2026-08-08", kind: "MANUAL_ADJUSTMENT", deltaCents: -111111 },
        { date: "2026-08-09", kind: "PURCHASE", deltaCents: -10000 },
      ],
    },
  ],
});
const adjustedSnap = snapAdjustmentReconciliation[0];
if (
  adjustedSnap?.negativeAdjustments !== 111111 ||
  adjustedSnap?.purchases !== 10000 ||
  adjustedSnap?.calculatedClosingBalance !== 212222 ||
  adjustedSnap?.reconciliationVariance !== 0
) {
  throw new Error("SNAP purchase/adjustment reconciliation failed.");
}
let unsafeSnapReconciliationCode = "";
try {
  Reports.reconcileSnap({
    snapCards: [{
      id: "unsafe-ledger",
      startingBalance: 1,
      balance: 1,
      transactions: Array.from({ length: 90073 }, (_, index) => ({
        date: "2026-08-01",
        kind: "RELOAD",
        deltaCents: index === 90072 ? 1 : Reports.LIMITS.maxMoneyCents,
      })),
    }],
  });
} catch (error) {
  unsafeSnapReconciliationCode = error?.code || "";
}
if (unsafeSnapReconciliationCode !== Reports.ERROR.INVALID_NUMBER) {
  throw new Error("An unsafe SNAP reconciliation total did not fail closed.");
}

const wicLedgerState = {
  wicCards: [
    {
      id: "wic-ledger-card",
      allowances: [
        {
          id: "wic-ledger-benefit",
          label: "WIC ledger benefit",
          unit: "oz",
          starting: 10,
          remaining: 7.3,
          startDate: "2026-08-01",
          expiryDate: "2026-08-31",
          transactions: [
            { date: "2026-08-01", kind: "ISSUANCE", delta: 0.1, unit: "oz" },
            { date: "2026-08-02", kind: "RELOAD", delta: 0.2, unit: "oz" },
            { date: "2026-08-03", kind: "MANUAL_ADJUSTMENT", delta: -1, unit: "oz" },
            { date: "2026-08-04", kind: "PURCHASE", delta: -2, unit: "oz" },
          ],
        },
      ],
    },
  ],
};
const fullWicReconciliation = Reports.reconcileWic(wicLedgerState)[0];
const scopedWicReconciliation = Reports.reconcileWic(wicLedgerState, {
  from: "2026-08-03",
})[0];
if (
  fullWicReconciliation?.additions !== 0.3 ||
  fullWicReconciliation?.negativeAdjustments !== 1 ||
  fullWicReconciliation?.redeemedQuantity !== 2 ||
  fullWicReconciliation?.calculatedRemainingQuantity !== 7.3 ||
  fullWicReconciliation?.reconciliationVariance !== 0
) {
  throw new Error("WIC additions/purchases/adjustments did not reconcile precisely.");
}
if (
  scopedWicReconciliation?.openingQuantity !== 10.3 ||
  scopedWicReconciliation?.negativeAdjustments !== 1 ||
  scopedWicReconciliation?.redeemedQuantity !== 2 ||
  scopedWicReconciliation?.calculatedRemainingQuantity !== 7.3
) {
  throw new Error("Date-scoped WIC opening balance did not reconcile.");
}
for (const invalidWicAllowance of [
  { starting: 100000.001, remaining: 1, transactions: [] },
  { starting: 1, remaining: 0.0006, transactions: [] },
  { starting: 1, remaining: 1, transactions: [{ date: "2026-08-01", kind: "RELOAD", delta: 0.0006, unit: "oz" }] },
  { starting: 1, remaining: 1, transactions: [{ date: "2026-08-01", kind: "RELOAD", delta: 100000.001, unit: "oz" }] },
]) {
  let code = "";
  try {
    Reports.reconcileWic({
      wicCards: [{
        id: "invalid-wic-card",
        allowances: [{
          id: "invalid-wic-benefit",
          unit: "oz",
          ...invalidWicAllowance,
        }],
      }],
    });
  } catch (error) {
    code = error?.code || "";
  }
  if (code !== Reports.ERROR.INVALID_NUMBER) {
    throw new Error("Out-of-domain WIC reconciliation input did not fail closed.");
  }
}

const reportState = Core.canonicalState();
reportState.onboarded = true;
reportState.settings.language = "en-US";
reportState.settings.programJurisdiction = Reports.PROGRAM_JURISDICTION.US_SNAP;
reportState.snapCards = [
  {
    id: "snap-sentinel",
    name: "SNAP source",
    active: true,
    balance: 100000,
    startingBalance: 100000,
    transactions: [],
  },
];
reportState.wicCards = [
  {
    id: "wic-sentinel",
    name: "WIC source",
    active: true,
    transactions: [],
    allowances: [
      {
        id: "wic-benefit-sentinel",
        label: "Sentinel benefit",
        unit: "oz",
        starting: 100,
        remaining: 26.875,
        startDate: "2026-08-01",
        expiryDate: "2026-08-31",
        active: true,
        transactions: [],
      },
    ],
  },
];
reportState.history = [
  {
    id: "transaction-sentinel",
    status: "COMPLETED",
    transactionDate: "2026-08-10",
    createdAt: "2026-08-10T12:00:00Z",
    recordedAt: "2026-08-10T12:00:00Z",
    storeDisplayName: "Walmart",
    programJurisdiction: Reports.PROGRAM_JURISDICTION.US_SNAP,
    items: [
      {
        id: "split-item-sentinel",
        name: "Water",
        quantity: 1,
        quantityRaw: "1",
        quantityUnit: "each",
        priceKnown: true,
        unitPriceCents: 98765,
        priceEntryMode: "UNIT_PRICE",
        lineTotalCents: null,
        category: "beverages",
        allocations: [
          { type: "SNAP", amountCents: 60001, cardId: "snap-sentinel" },
          { type: "CASH", amountCents: 38764 },
        ],
      },
      {
        id: "wic-item-sentinel",
        name: "Waffles",
        quantity: 1,
        quantityRaw: "1",
        quantityUnit: "each",
        priceKnown: true,
        unitPriceCents: 12345,
        priceEntryMode: "UNIT_PRICE",
        lineTotalCents: null,
        category: "other",
        allocations: [
          {
            type: "WIC",
            amountCents: 12345,
            cardId: "wic-sentinel",
            allowanceId: "wic-benefit-sentinel",
            quantity: 73.125,
            unit: "oz",
            wicBenefitLabel: "Sentinel benefit",
          },
        ],
      },
    ],
  },
];

const reportSnapshot = await Reports.buildReportSnapshot(
  reportState,
  { funding: "ALL", includeFullSplitContext: true },
  { locale: "en-US" },
);
const reportCsv = Reports.buildReportCsv(reportSnapshot);
const reportCsvLines = reportCsv.split(/\r?\n/);
if (reportCsvLines.length !== 3) {
  throw new Error(`Item-level CSV expected 2 data rows; found ${reportCsvLines.length - 1}.`);
}
if ((reportCsv.match(/987\.65/g) || []).length !== 1) {
  throw new Error("Split-payment CSV repeated or omitted the item total.");
}
const csvHeader = reportCsvLines[0].replace(/^\ufeff/, "").split(",");
const waterRow = reportCsvLines.find((line) => line.includes(",Water,"))?.split(",");
if (!waterRow) throw new Error("Split-payment item is missing from CSV.");
for (const [column, expected] of [
  ["itemTotalUSD", "987.65"],
  ["snapUSD", "600.01"],
  ["cashUSD", "387.64"],
]) {
  if (waterRow[csvHeader.indexOf(column)] !== expected) {
    throw new Error(`CSV ${column} did not reconcile to ${expected}.`);
  }
}

const strictSnapSnapshot = await Reports.buildReportSnapshot(
  reportState,
  { funding: "SNAP", includeFullSplitContext: false },
  { locale: "en-US" },
);
const fullSplitSnapSnapshot = await Reports.buildReportSnapshot(
  reportState,
  { funding: "SNAP", includeFullSplitContext: true },
  { locale: "en-US" },
);
const strictSnapLines = Reports.buildReportCsv(strictSnapSnapshot).split(/\r?\n/);
const fullSplitSnapLines = Reports.buildReportCsv(fullSplitSnapSnapshot).split(/\r?\n/);
const strictSnapHeader = strictSnapLines[0].replace(/^\ufeff/, "").split(",");
const strictWater = strictSnapLines.find((line) => line.includes(",Water,"))?.split(",");
const fullSplitWater = fullSplitSnapLines.find((line) => line.includes(",Water,"))?.split(",");
if (!strictWater || !fullSplitWater) {
  throw new Error("Filtered split-payment CSV item is missing.");
}
if (strictWater[strictSnapHeader.indexOf("cashUSD")] !== "") {
  throw new Error("Strict SNAP CSV leaked out-of-scope Cash context.");
}
if (fullSplitWater[strictSnapHeader.indexOf("cashUSD")] !== "387.64") {
  throw new Error("Full split-context SNAP CSV omitted the Cash remainder.");
}

const scopedReportState = Core.canonicalState();
scopedReportState.settings.language = "en-US";
scopedReportState.settings.programJurisdiction = Reports.PROGRAM_JURISDICTION.US_SNAP;
scopedReportState.snapCards = [
  { id: "scope-card-a", active: true, startingBalance: 1000, balance: 900, transactions: [] },
  { id: "scope-card-b", active: true, startingBalance: 1000, balance: 800, transactions: [] },
];
scopedReportState.history = [
  {
    id: "scope-no-store",
    status: "CORRECTED",
    transactionDate: "2026-08-10",
    createdAt: "2026-08-10T12:00:00Z",
    recordedAt: "2026-08-10T12:00:00Z",
    storeDisplayName: "",
    storeNormalizedKey: null,
    items: [
      historyItem({
        id: "scope-item-a",
        name: "Apples",
        price: 100,
        allocations: [{ type: "SNAP", cardId: "scope-card-a", amountCents: 100 }],
      }),
    ],
    amendments: [
      { id: "old-amendment", effectiveDate: "2025-01-01", kind: "CORRECTION" },
      { id: "current-amendment", effectiveDate: "2026-08-10", kind: "CORRECTION" },
    ],
  },
  {
    id: "scope-other-store",
    status: "COMPLETED",
    transactionDate: "2026-08-10",
    createdAt: "2026-08-10T13:00:00Z",
    recordedAt: "2026-08-10T13:00:00Z",
    storeDisplayName: "Walmart",
    storeNormalizedKey: "walmart",
    items: [
      historyItem({
        id: "scope-item-b",
        name: "Bananas",
        price: 200,
        allocations: [{ type: "SNAP", cardId: "scope-card-b", amountCents: 200 }],
      }),
    ],
  },
];
const scopedSourceSnapshot = await Reports.buildReportSnapshot(
  scopedReportState,
  {
    funding: "SNAP",
    cardId: "scope-card-a",
    storeNormalizedKey: "__NO_STORE__",
    from: "2026-08-01",
    to: "2026-08-31",
  },
  { locale: "en-US" },
);
if (
  scopedSourceSnapshot.allocations.length !== 1 ||
  scopedSourceSnapshot.allocations[0].cardId !== "scope-card-a" ||
  scopedSourceSnapshot.transactions.length !== 1 ||
  scopedSourceSnapshot.transactions[0].storeNormalizedKey !== null
) {
  throw new Error("Card or no-store report filters leaked out-of-scope transactions.");
}
if (
  scopedSourceSnapshot.corrections.length !== 1 ||
  scopedSourceSnapshot.corrections[0].id !== "current-amendment"
) {
  throw new Error("Date-scoped report exported an out-of-period correction amendment.");
}

const importedWicProvenanceState = Core.canonicalState();
importedWicProvenanceState.settings.language = "en-US";
importedWicProvenanceState.settings.programJurisdiction =
  Reports.PROGRAM_JURISDICTION.US_SNAP;
importedWicProvenanceState.wicCards = [
  {
    id: "local-wic-card",
    active: true,
    allowances: [
      {
        id: "actual-local-benefit",
        categoryId: "milk",
        label: "Milk",
        unit: "each",
        starting: 10,
        remaining: 10,
        active: true,
        transactions: [],
      },
    ],
  },
];
importedWicProvenanceState.history = [
  {
    id: "imported-wic-transaction",
    importedHistory: true,
    status: "COMPLETED",
    transactionDate: "2026-08-10",
    createdAt: "2026-08-10T12:00:00.000Z",
    recordedAt: "2026-08-10T12:00:00.000Z",
    storeDisplayName: "Store",
    storeNormalizedKey: "store",
    items: [
      historyItem({
        id: "missing-wic-benefit-link",
        name: "Milk",
        price: 100,
        allocations: [
          {
            type: "WIC",
            amountCents: 100,
            externalSourceRef: "local-wic-card",
            externalBenefitRef: "missing-benefit",
            quantity: 1,
            unit: "each",
          },
        ],
      }),
      historyItem({
        id: "label-only-wic-link",
        name: "Milk",
        price: 100,
        allocations: [
          {
            type: "WIC",
            amountCents: 100,
            wicBenefitLabel: "Milk benefit",
            quantity: 1,
            unit: "each",
          },
        ],
      }),
    ],
  },
];
const importedWicSnapshot = await Reports.buildReportSnapshot(
  importedWicProvenanceState,
  { funding: "WIC", includeFullSplitContext: true },
  { locale: "en-US" },
);
if (
  importedWicSnapshot.provenanceSummary.unlinkedImportedAllocationCount !== 2 ||
  !importedWicSnapshot.warnings.some(
    (warning) => warning.code === "IMPORTED_UNLINKED_ACTIVITY" && warning.count === 2,
  )
) {
  throw new Error("Imported WIC activity was falsely described as locally linked.");
}

const spanishSnapshot = await Reports.buildReportSnapshot(
  { ...reportState, settings: { ...reportState.settings, language: "es-PR" } },
  { funding: "ALL", includeFullSplitContext: true },
  { locale: "es-PR" },
);
const spanishXlsxText = new TextDecoder().decode(Reports.buildReportXlsx(spanishSnapshot));
const spanishPdfText = new TextDecoder().decode(Reports.buildReportPdf(spanishSnapshot));
if (!spanishXlsxText.includes("Información del reporte") || spanishXlsxText.includes("Report Information")) {
  throw new Error("Spanish XLSX still contains an English report-information heading.");
}
if (!spanishPdfText.includes("Actividad de transacciones") || spanishPdfText.includes("Transaction activity")) {
  throw new Error("Spanish PDF headings are not localized.");
}
if (!(spanishSnapshot.snapReconciliations[0]?.cardName || "").includes("fuente")) {
  throw new Error("Spanish anonymous report sources are not localized.");
}

const precisionSnapshot = structuredClone(reportSnapshot);
const sourceWicAllocation = reportSnapshot.allocations.find(
  (allocation) => allocation.fundingType === "WIC",
);
if (!sourceWicAllocation) throw new Error("WIC report precision fixture is missing.");
precisionSnapshot.allocations = [
  { ...sourceWicAllocation, amountCents: 6000, wicQuantity: 0.1 },
  {
    ...sourceWicAllocation,
    amountCents: 6345,
    allowanceId: "wic-benefit-precision-second",
    wicQuantity: 0.2,
  },
];
precisionSnapshot.splitContextAllocations = structuredClone(precisionSnapshot.allocations);
precisionSnapshot.wicReconciliations = [fullWicReconciliation];
const precisionCsvLines = Reports.buildReportCsv(precisionSnapshot).split(/\r?\n/);
const precisionHeader = precisionCsvLines[0].replace(/^\ufeff/, "").split(",");
const precisionWicRow = precisionCsvLines.find((line) => line.includes(",Waffles,"))?.split(",");
if (precisionWicRow?.[precisionHeader.indexOf("wicQuantity")] !== "0.3") {
  throw new Error("CSV emitted a binary floating-point WIC quantity.");
}
const precisionXlsxText = new TextDecoder().decode(
  Reports.buildReportXlsx(precisionSnapshot),
);
if (
  precisionXlsxText.includes("0.30000000000000004") ||
  !precisionXlsxText.includes("<v>0.3</v>")
) {
  throw new Error("XLSX emitted an imprecise WIC reconciliation quantity.");
}

const exactLargeCents = 9007100000000001;
if (Reports.moneyDecimalString(exactLargeCents) !== "90071000000000.01") {
  throw new Error("The exact large-cent formatter changed a supported cent value.");
}
const exactLargeSnapshot = structuredClone(reportSnapshot);
exactLargeSnapshot.totals.knownGrocerySpendCents = exactLargeCents;
exactLargeSnapshot.totals.funding.CASH = exactLargeCents;
const exactLargeXlsxText = new TextDecoder().decode(
  Reports.buildReportXlsx(exactLargeSnapshot),
);
const exactLargePdfText = new TextDecoder().decode(
  Reports.buildReportPdf(exactLargeSnapshot),
);
if (!exactLargeXlsxText.includes("90071000000000.01")) {
  throw new Error("XLSX rounded a supported exact cent total.");
}
if (!exactLargePdfText.includes("$90,071,000,000,000.01")) {
  throw new Error("PDF rounded a supported exact cent total.");
}

const maskedReport = Reports.maskedSnapshot(reportSnapshot);
if (
  maskedReport.totals.knownGrocerySpendCents !== "MASKED" ||
  Object.values(maskedReport.totals.funding).some((value) => value !== "MASKED")
) {
  throw new Error("Masked report totals retain unmasked monetary values.");
}
for (const key of [
  "openingBalance",
  "issuances",
  "refunds",
  "positiveAdjustments",
  "purchases",
  "negativeAdjustments",
  "correctionEffects",
  "calculatedClosingBalance",
  "recordedClosingBalance",
  "reconciliationVariance",
]) {
  if (maskedReport.snapReconciliations[0]?.[key] !== "MASKED") {
    throw new Error(`Masked SNAP reconciliation leaked ${key}.`);
  }
}
for (const key of [
  "openingQuantity",
  "authorizedStartQuantity",
  "additions",
  "restorations",
  "positiveAdjustments",
  "redeemedQuantity",
  "negativeAdjustments",
  "correctionEffects",
  "expiredQuantity",
  "calculatedRemainingQuantity",
  "recordedRemainingQuantity",
  "reconciliationVariance",
]) {
  if (maskedReport.wicReconciliations[0]?.[key] !== "MASKED") {
    throw new Error(`Masked WIC reconciliation leaked ${key}.`);
  }
}
const maskedCsv = Reports.buildReportCsv(maskedReport);
const maskedXlsxBytes = Reports.buildReportXlsx(maskedReport);
const maskedPdfBytes = Reports.buildReportPdf(maskedReport);
const maskedXlsxText = new TextDecoder().decode(maskedXlsxBytes);
const maskedPdfText = new TextDecoder().decode(maskedPdfBytes);
for (const sentinel of ["987.65", "600.01", "387.64", "123.45", "73.125", "26.875"]) {
  if ([maskedCsv, maskedXlsxText, maskedPdfText].some((value) => value.includes(sentinel))) {
    throw new Error(`Masked report leaked sentinel ${sentinel}.`);
  }
}
if (!maskedCsv.includes("MASKED") || !maskedXlsxText.includes("MASKED") || !maskedPdfText.includes("MASKED")) {
  throw new Error("Masked report formats do not visibly mark protected values.");
}
function assertPdfXref(bytes) {
  const text = new TextDecoder().decode(bytes);
  const startMatch = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!startMatch) throw new Error("PDF startxref marker is missing.");
  const xrefOffset = Number(startMatch[1]);
  const xrefText = new TextDecoder().decode(bytes.slice(xrefOffset));
  const lines = xrefText.split(/\r?\n/);
  if (lines[0] !== "xref") throw new Error("PDF startxref does not point to xref.");
  const [, objectCountText] = String(lines[1] || "").split(/\s+/);
  const objectCount = Number(objectCountText);
  if (!Number.isSafeInteger(objectCount) || objectCount < 2) {
    throw new Error("PDF xref object count is invalid.");
  }
  for (let objectId = 1; objectId < objectCount; objectId += 1) {
    const entry = lines[2 + objectId] || "";
    const objectOffset = Number(entry.slice(0, 10));
    const objectHeader = new TextDecoder().decode(
      bytes.slice(objectOffset, objectOffset + 32),
    );
    if (!objectHeader.startsWith(`${objectId} 0 obj`)) {
      throw new Error(`PDF xref entry ${objectId} points to the wrong object.`);
    }
  }
}

const unicodeReport = structuredClone(reportSnapshot);
unicodeReport.transactions = unicodeReport.transactions.map((transaction) => ({
  ...transaction,
  storeDisplayName: "Tienda 🥑 東京",
}));
unicodeReport.items = unicodeReport.items.map((item) => ({
  ...item,
  storeDisplayName: "Tienda 🥑 東京",
  itemName: "Piñón 🥑 東京 e\u0301",
}));
unicodeReport.allocations = unicodeReport.allocations.map((allocation) => ({
  ...allocation,
  storeDisplayName: "Tienda 🥑 東京",
  itemName: "Piñón 🥑 東京 e\u0301",
}));
unicodeReport.splitContextAllocations = structuredClone(unicodeReport.allocations);
const unicodePdf = Reports.buildReportPdf(unicodeReport);
if (!new TextDecoder().decode(unicodePdf.slice(0, 8)).startsWith("%PDF-1.4")) {
  throw new Error("Unicode report did not generate a PDF.");
}
assertPdfXref(unicodePdf);

function assertZipCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("XLSX ZIP end-of-central-directory is missing.");
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  let cursor = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error(`XLSX central-directory entry ${index} is invalid.`);
    }
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`XLSX local-file entry ${index} is invalid.`);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (entries < 5 || cursor !== centralOffset + centralSize) {
    throw new Error("XLSX central-directory size or entry count is invalid.");
  }
}
if (!new TextDecoder().decode(maskedPdfBytes.slice(0, 8)).startsWith("%PDF-1.4")) {
  throw new Error("Generated PDF signature is invalid.");
}
if (maskedXlsxBytes[0] !== 0x50 || maskedXlsxBytes[1] !== 0x4b) {
  throw new Error("Generated XLSX ZIP signature is invalid.");
}
assertPdfXref(maskedPdfBytes);
assertZipCentralDirectory(maskedXlsxBytes);

const stressReport = structuredClone(reportSnapshot);
const sourceAllocation = reportSnapshot.allocations[0];
const sourceItem = reportSnapshot.items[0];
const sourceTransaction = reportSnapshot.transactions[0];
stressReport.allocations = Array.from({ length: 1000 }, (_, index) => ({
  ...sourceAllocation,
  transactionId: `stress-transaction-${index}`,
  itemId: `stress-item-${index}`,
  itemName: `Stress item ${index}`,
}));
stressReport.splitContextAllocations = structuredClone(stressReport.allocations);
stressReport.items = Array.from({ length: 1000 }, (_, index) => ({
  ...sourceItem,
  transactionId: `stress-transaction-${index}`,
  itemId: `stress-item-${index}`,
  itemName: `Stress item ${index}`,
}));
stressReport.transactions = Array.from({ length: 1000 }, (_, index) => ({
  ...sourceTransaction,
  transactionId: `stress-transaction-${index}`,
}));
stressReport.totals.transactionCount = 1000;
stressReport.totals.itemCount = 1000;
stressReport.totals.allocationCount = 1000;
const stressCsv = Reports.buildReportCsv(stressReport);
const stressXlsx = Reports.buildReportXlsx(stressReport);
const stressPdf = Reports.buildReportPdf(stressReport);
if (stressCsv.split(/\r?\n/).length !== 1001 || stressXlsx.length < 10000 || stressPdf.length < 10000) {
  throw new Error("1,000-row report stress generation failed.");
}
assertPdfXref(stressPdf);
assertZipCentralDirectory(stressXlsx);
const oversizedPdf = structuredClone(stressReport);
oversizedPdf.allocations = Array.from({ length: 2001 }, () => sourceAllocation);
oversizedPdf.splitContextAllocations = structuredClone(oversizedPdf.allocations);
let oversizedPdfCode = "";
try {
  Reports.buildReportPdf(oversizedPdf);
} catch (error) {
  oversizedPdfCode = error?.code || "";
}
if (oversizedPdfCode !== Reports.ERROR.PDF_TOO_LARGE) {
  throw new Error("Oversized PDF did not fail safely with PDF_TOO_LARGE.");
}

requireText(html, "window.GBTAdRuntime=Object.freeze", "web ad runtime");
requireText(html, "downloadBlob('snap-ebt-wic-local-recovery.txt',blob)", "recovery export");
requireText(html, "R.prefixSearchMatch(entry.label,query)", "item prefix-only suggestions");
requireText(html, "R.prefixSearchMatch(name,query)", "store prefix-only suggestions");
requireText(html, '<button type="button" id="${type}-suggestion-${i}"', "non-submitting Shop suggestions");
requireText(html, "if(btn.closest('form'))e.preventDefault()", "single-dispatch form actions");
requireText(html, "requestAnimationFrame(()=>input?.focus())", "suggestion focus restoration");
requireText(html, "function restoreLogicalFocus(token)", "rerender focus restoration");
requireText(html, "details>summary{min-height:44px", "accessible disclosure targets");
requireText(html, "setModalBackgroundInert(true)", "modal background isolation");
requireText(html, 'data-action="money-pad-cents" data-cents="00"', "quick .00 money entry");
requireText(html, 'data-action="money-pad-cents" data-cents="99"', "quick .99 money entry");
requireText(html, "moneyPadState.centsShortcutApplied", "idempotent cent shortcuts");
requireText(html, "moneyInputAttributes(a.unit==='$'", "conditional WIC dollar keypad");
requireText(html, "moneyInputAttributes(true,d.priceEntryMode", "transaction price keypad");
requireText(html, "input.dispatchEvent(new Event('change',{bubbles:true}))", "money keypad change synchronization");
requireText(html, "function adPlacementAllowed(){return state.route!=='cards'&&!modalState;}", "Cards and modal ad exclusion");
requireText(html, "window.dispatchEvent(new Event('gbt-ad-presentation-change'))", "immediate ad-placement bridge");
requireText(html, "window.GBTNativeShareFile(blob,name", "explicit native report-share bridge");
requireText(html, "if(window.ReactNativeWebView?.postMessage)throw R.err(R.ERROR.SHARE_FAILED", "native blob-navigation fail-close");
requireText(html, "MAX_PDF_DETAIL_ROWS=2000", "bounded iPhone PDF generation");
requireText(html, 'aria-labelledby="moneyPadTitle"', "specific money-pad accessible name");
requireText(html, "HISTORY_FILTER_STORAGE_KEY='gbt-history-filters-v1'", "bounded History filter persistence");
requireText(html, "if(delta&&!isNew)", "new SNAP opening-balance ledger guard");
requireText(html, "k==='CHECKOUT'||k==='PURCHASE'", "explicit purchase ledger classification");
requireText(html, "before.budget>0&&plan.cashDeltaCents>0", "unconfigured-budget warning guard");
requireText(html, "function exactQuantityTotalCents", "shared exact checkout arithmetic");
requireText(html, "quantityRaw:q.normalized", "canonical locale-independent quantity storage");
requireText(html, "CASH_ROLLOVER_PENDING", "pending rollover checkout gate");
requireText(html, "cashPeriodForDate(next,transactionDate)", "dated Cash-period checkout mapping");
requireText(html, "archived.end=addDays(startDate,-1)", "non-overlapping Cash timing reset");
requireText(html, "scheduleMonthlyReminder(card.reminder", "stable monthly reminder anchoring");
requireText(html, "WIC_CATALOG_FAMILY_OVERRIDES", "explicit WIC catalog families");
requireText(html, "toothpaste|pasta dental|coffee|cafe|soy sauce", "non-WIC catalog exclusions");
requireText(html, "transactionDetailResolutionHtml", "atomic unresolved transaction resolution");
requireText(html, "WIC:${esc(x.card.id)}::${esc(x.allowance.id)}", "atomic WIC transaction resolution");
requireText(html, "function wicAllowanceIsReferenced", "historical WIC identity lock");
requireText(html, "seenDigests.add(dig)", "within-file import digest deduplication");
requireText(html, "if(alreadyApplied)return next", "idempotent import application");
requireText(html, "function validateHistoryAmendment", "history amendment backup validation");
requireText(html, "const epoch=persistenceEpoch", "stale persistence cancellation epoch");
requireText(html, "state=candidate;try{const res=await persistState", "optimistic serialized critical state");
requireText(html, "for(const key of [STORE_KEY,LEGACY_KEY,LEGACY_BACKUP_KEY,HISTORY_FILTER_STORAGE_KEY])", "complete local-data deletion");
requireText(html, "esc(tr('saved.storeConflict',{store:s.store}))", "saved-store HTML escaping");
requireText(html, "String(v??'').normalize('NFC')", "Unicode-safe PDF text normalization");
requireText(html, "function safeIntegerSum", "checked report aggregation");
requireText(html, "safeQuantityAggregateAdd", "bounded WIC checkout aggregation");
requireText(html, "function moneyDecimalString", "exact cent formatting");
requireText(html, "function strictSignedQuantity", "strict WIC ledger quantities");
requireText(html, "R.safeQuantityAdd(g.months.get(month)||0,Number(r.wicQuantity||0),'reports.wicMonthlyUsage')", "checked WIC trend aggregation");
requireText(html, "await R.validateHistoryTransaction(changedTx", "funding correction final-record validation");
requireText(html, "remainingDelta-baselineDelta", "WIC baseline edit reconciliation");
requireText(html, "if(label.length>256)", "bounded custom WIC labels");
requireText(html, "function onboardingProgramLabel(code)", "draft-scoped PAN onboarding labels");
requireText(html, "function resourceProgramLabel(code)", "source-program resource labels");
requireText(html, "'resources.programSnapUS':'SNAP (Estados Unidos)'", "Spanish federal SNAP resource label");
requireText(html, 'minlength="8"', "encrypted-backup passphrase minimum");
requireText(html, "history.passphraseCreateError", "encrypted-backup creation guidance");
requireText(html, "gbt-locale-change", "native locale bridge event");
requireText(html, "font:-apple-system-body", "Dynamic Type baseline");
requireText(html, "--blue:#005bb5", "accessible action color");
requireText(html, "min-height:44px", "minimum interaction target");
requireText(html, 'aria-label="${esc(tr(\'resources.section\'))}"', "resource section accessible name");
forbidText(html, "errors.push(['itemInput','UNRESOLVED_FUNDING'])", "shop item validation");
forbidText(html, "openRemoveAdsPurchase", "public test release");
forbidText(html, "confirm-remove-ads-preview", "public test release");
forbidText(html, "class=\"remove-ads-row\"", "public test release");
forbidText(html, "haptic(", "haptic-free interface");
forbidText(html, 'id="hapticSetting"', "haptic-free settings");
forbidText(html, "navigator.vibrate", "haptic-free web runtime");
forbidText(html, "drawAppBasketLogo", "retired vector logo");
forbidText(html, "M15 28h34l-4 25H19z", "retired basket logo path");
if ((maskedPdfText.match(/\/Subtype \/Image/g) || []).length !== 1) {
  throw new Error("Generated PDF must embed exactly one reusable brand image.");
}
requireText(maskedPdfText, "/BrandLogo Do", "PDF brand image drawing");

const secondaryStart = html.indexOf("const secondary=[");
const secondaryEnd = html.indexOf("];", secondaryStart);
if (secondaryStart < 0 || secondaryEnd < 0) {
  throw new Error("Could not inspect the navigation drawer.");
}
const drawerSource = html.slice(secondaryStart, secondaryEnd);
forbidText(drawerSource, "share-app", "navigation drawer");

requireText(app, TEST_APP_ID, "native wrapper test app ID marker");
requireText(app, TEST_BANNER_ID, "native wrapper test banner marker");
requireText(app, "process.env.EXPO_PUBLIC_AD_PROFILE === \"production\"", "ad profile gate");
requireText(app, 'Platform.OS === "android"', "platform-specific production banner ID");
requireText(app, "process.env.EXPO_PUBLIC_ANDROID_ADMOB_BANNER_ID", "Android production banner marker");
requireText(app, "unitId={bannerUnitId}", "native banner");
requireText(app, "size={BannerAdSize.BANNER}", "fixed 320x50 banner");
requireText(app, "const AD_SLOT_BOTTOM = 66", "HTML/native banner alignment");
requireText(app, "requestNonPersonalizedAdsOnly: true", "non-personalized request");
requireText(app, "AdsConsent.gatherConsent()", "UMP consent update");
requireText(app, "AdsConsent.getConsentInfo()", "cached UMP consent check");
requireText(app, "startAdsIfAllowed", "shared consent ad gate");
requireText(app, "await ensureAdsInitialized()", "idempotent SDK initialization");
requireText(app, "await mobileAds().initialize()", "SDK initialization");
requireText(app, "adLoadAttempt >= 2", "bounded banner retry");
requireText(
  app,
  'webAdState !== "AD_TEMPORARILY_HIDDEN"',
  "critical-flow banner unmount",
);
requireText(app, "{bannerMounted ? (", "native banner lifecycle gate");
requireText(app, "type: \"share-file\"", "native file-share bridge");
requireText(app, "requestId?: string", "native file-share acknowledgement ID");
requireText(app, "window.GBTNativeShareCompleted", "native file-share acknowledgement");
requireText(app, 'file.write(base64, { encoding: "base64" })', "validated native file write");
requireText(app, "fileUti(name, message.mimeType)", "native file type mapping");
requireText(app, "const shareDirectory = new Directory(", "unique native export directory");
requireText(app, "shareDirectory.delete()", "unique native export cleanup");
requireText(app, 'new Directory(Paths.cache, "gbt-share")', "interrupted native export cleanup root");
requireText(app, "if (staleShareDirectory.exists) staleShareDirectory.delete()", "interrupted native export startup cleanup");
forbidText(app, "new File(Paths.cache, name)", "same-name native export collision");
requireText(app, "onShouldStartLoadWithRequest", "external-link bridge");
requireText(app, "SafeAreaView", "safe-area layout");
requireText(app, 'type: "locale"', "native locale message contract");
requireText(app, "NATIVE_COPY[appLocale]", "localized native alert selection");
requireText(app, "Exportación no disponible", "Spanish native export alert");
requireText(app, 'case "locale":', "native locale message handling");
requireText(app, "gbt-locale-change", "injected native locale listener");
requireText(app, "nativeCopy.linkTitle", "localized native external-link alert");
forbidText(app, "Vibration", "haptic-free native wrapper");
forbidText(app, 'type: "haptic"', "haptic-free native bridge");
forbidText(app, 'navigator, "vibrate"', "haptic-free native bridge");
forbidText(app, 'url.startsWith("blob:")', "top-level blob navigation");
forbidText(app, 'url.startsWith("data:")', "top-level data navigation");
forbidText(app, '"blob:*"', "WebView origin allowlist");
forbidText(app, '"data:*"', "WebView origin allowlist");
forbidText(app, "Buffer.from", "native export memory duplication");
requireText(
  html,
  "Independent local-first tracker with no account, profile, or first-party analytics. Google Mobile Ads may process device, usage, advertising, crash, and performance data for non-personalized ad delivery and measurement.",
  "accurate English advertising privacy summary",
);
requireText(
  html,
  "Rastreador local e independiente, sin cuenta, perfil ni analítica propia. Google Mobile Ads puede procesar datos del dispositivo, uso, publicidad, fallos y rendimiento para mostrar y medir anuncios no personalizados.",
  "accurate Spanish advertising privacy summary",
);
requireText(html, "firstPartyAnalytics:false", "first-party analytics invariant");
requireText(html, "firstPartyTelemetry:false", "first-party telemetry invariant");

const gatherIndex = app.indexOf("AdsConsent.gatherConsent()");
const sharedGateIndex = app.indexOf("startAdsIfAllowed(reportedCanRequestAds)", gatherIndex);
if (gatherIndex < 0 || sharedGateIndex < gatherIndex) {
  throw new Error("The initial UMP update does not gate SDK initialization.");
}
if ((app.match(/startAdsIfAllowed\(/g) || []).length < 2) {
  throw new Error("Every UMP consent path must use the shared initialization gate.");
}

requireText(
  delegate,
  "publisherPrivacyPersonalizationState = .disabled",
  "global non-personalized treatment",
);
requireText(
  delegate,
  "setPublisherFirstPartyIDEnabled(false)",
  "publisher first-party ID treatment",
);
requireText(delegate, 'appendingPathComponent("WebKit", isDirectory: true)', "WKWebView backup exclusion");
requireText(delegate, '"WebKit/WebsiteData"', "WKWebView data backup exclusion");
requireText(delegate, "isExcludedFromBackup = true", "local web data backup treatment");
if (delegate.indexOf("configureAdvertisingPrivacy()") > delegate.indexOf("factory.startReactNative")) {
  throw new Error("Advertising privacy is configured after application startup.");
}

requireText(plist, TEST_APP_ID, "Info.plist test app ID");
requireText(plist, "<key>SKAdNetworkItems</key>", "Info.plist SKAdNetwork list");
forbidText(plist, "NSUserTrackingUsageDescription", "non-tracking test build");
forbidText(plist, "WKAppBoundDomains", "Google Mobile Ads compatibility");

const skadIds = skadText.split(/\r?\n/).filter(Boolean);
if (skadIds.length !== 50 || new Set(skadIds).size !== skadIds.length) {
  throw new Error(`Expected 50 unique SKAdNetwork IDs; found ${skadIds.length}.`);
}
for (const skadId of skadIds) requireText(plist, skadId, "Info.plist SKAdNetwork list");

const parsedPackage = JSON.parse(packageJson);
const parsedLock = JSON.parse(packageLock);
const parsedAppJson = JSON.parse(appJson);
const expoConfig = parsedAppJson.expo || {};
const configuredPlugins = (expoConfig.plugins || []).map((plugin) =>
  Array.isArray(plugin) ? plugin[0] : plugin,
);
if (configuredPlugins.includes("expo-iap")) {
  throw new Error("The release app configuration still includes the obsolete in-app-purchase plugin.");
}
if (configuredPlugins.includes("expo-sqlite") || configuredPlugins.includes("./plugins/withLocalOnlyDatabase")) {
  throw new Error("The release app configuration still includes the unused legacy SQLite path.");
}
if (
  expoConfig.icon !== "./assets/icon.png" ||
  expoConfig.ios?.icon !== "./assets/icon.png" ||
  expoConfig.android?.icon !== "./assets/icon.png"
) {
  throw new Error("The release app configuration does not use the reviewed icon on every platform.");
}
requireText(appConfig, "EXPO_PUBLIC_AD_PROFILE", "single advertising build profile");
requireText(appConfig, "EXPO_PUBLIC_ANDROID_ADMOB_BANNER_ID", "Android banner configuration");
requireText(appConfig, "EXPO_PUBLIC_IOS_ADMOB_BANNER_ID", "iOS banner configuration");
for (const retiredConfigMarker of [
  "EXPO_PUBLIC_BUILD_PROFILE",
  "EXPO_PUBLIC_QA_PURCHASES",
  "REWARDED",
  "INTERSTITIAL",
  "expo-iap",
]) {
  forbidText(appConfig, retiredConfigMarker, "retired advertising or purchase configuration");
}
if (parsedPackage.dependencies?.["react-native-webview"] !== "14.0.1") {
  throw new Error("react-native-webview must stay pinned to 14.0.1.");
}
if (parsedPackage.dependencies?.["react-native-google-mobile-ads"] !== "16.4.0") {
  throw new Error("react-native-google-mobile-ads must stay pinned to 16.4.0.");
}
if (parsedPackage.dependencies?.["expo-iap"] || parsedLock.packages?.["node_modules/expo-iap"]) {
  throw new Error("The banner-only release must not include the obsolete in-app-purchase SDK.");
}
for (const unusedDependency of [
  "buffer",
  "expo-crypto",
  "expo-iap",
  "expo-print",
  "expo-sqlite",
  "expo-store-review",
  "expo-system-ui",
  "jszip",
]) {
  if (parsedPackage.dependencies?.[unusedDependency]) {
    throw new Error(`Unused direct dependency remains in the release: ${unusedDependency}.`);
  }
}
if (parsedLock.packages?.["node_modules/react-native-google-mobile-ads"]?.version !== "16.4.0") {
  throw new Error("The lockfile does not pin react-native-google-mobile-ads 16.4.0.");
}

function assertRgbPng(bytes, width, height, label) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) throw new Error(`${label} is not a PNG.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== width || view.getUint32(20) !== height) throw new Error(`${label} dimensions changed.`);
  if (bytes[24] !== 8 || bytes[25] !== 2) throw new Error(`${label} must remain opaque 8-bit RGB.`);
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === "tRNS") throw new Error(`${label} unexpectedly contains transparency.`);
    offset += 12 + length;
    if (type === "IEND") break;
  }
}
function assertRgbaPng(bytes, width, height, label) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) throw new Error(`${label} is not a PNG.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== width || view.getUint32(20) !== height) throw new Error(`${label} dimensions changed.`);
  if (bytes[24] !== 8 || bytes[25] !== 6) throw new Error(`${label} must remain 8-bit RGBA.`);
}
const iconBytes = Buffer.from(iconBase64.replace(/\s/g, ""), "base64");
const brandBytes = Buffer.from(cleanBrandBase64, "base64");
for (const [actual, committed, expected, width, height, label] of [
  [iconBytes, iconFile, EXPECTED_ICON_SHA256, 1024, 1024, "App Store icon"],
  [brandBytes, brandFile, EXPECTED_BRAND_LOGO_SHA256, 256, 256, "in-app brand logo"],
  [brandSourceFile, brandSourceFile, EXPECTED_BRAND_SOURCE_SHA256, 1254, 1254, "authoritative brand source"],
]) {
  if (sha256(actual) !== expected || sha256(committed) !== expected) throw new Error(`${label} digest changed.`);
  assertRgbPng(actual, width, height, label);
}
assertRgbPng(nativeIcon, 1024, 1024, "configured native App Store icon");
for (const [asset, expected, width, height, label] of [
  [androidForeground, EXPECTED_ANDROID_FOREGROUND_SHA256, 1024, 1024, "Android adaptive foreground"],
  [androidMonochrome, EXPECTED_ANDROID_MONOCHROME_SHA256, 1024, 1024, "Android monochrome icon"],
  [androidSplash, EXPECTED_ANDROID_FOREGROUND_SHA256, 1024, 1024, "Android splash mark"],
  [playStoreIcon, EXPECTED_PLAY_STORE_ICON_SHA256, 512, 512, "Google Play icon"],
]) {
  if (sha256(asset) !== expected) throw new Error(`${label} digest changed.`);
  assertRgbaPng(asset, width, height, label);
}
if (sha256(genericSplash) !== EXPECTED_SPLASH_SHA256[0]) {
  throw new Error("Configured Expo splash icon differs from the reviewed rounded 1x artwork.");
}
assertRgbaPng(genericSplash, 176, 176, "configured Expo splash icon");
for (const [asset, configured, expected, width, height, label] of [
  [splashAsset1x, splash1x, EXPECTED_SPLASH_SHA256[0], 176, 176, "configured 1x splash logo"],
  [splashAsset2x, splash2x, EXPECTED_SPLASH_SHA256[1], 352, 352, "configured 2x splash logo"],
  [splashAsset3x, splash3x, EXPECTED_SPLASH_SHA256[2], 528, 528, "configured 3x splash logo"],
]) {
  if (sha256(asset) !== expected || sha256(configured) !== expected) {
    throw new Error(`${label} digest changed.`);
  }
  assertRgbaPng(asset, width, height, label);
  assertRgbaPng(configured, width, height, label);
}
const parsedSplashColors = JSON.parse(splashColors);
for (const entry of parsedSplashColors.colors || []) {
  const components = entry.color?.components || {};
  if (components.red !== "0.878431" || components.green !== "0.933333" || components.blue !== "0.992157" || components.alpha !== "1.000") {
    throw new Error("Native splash background is not the reviewed #E0EEFD brand color.");
  }
}

console.log(
  `Release checks passed: ${scripts.length} scripts, reviewed logo assets, ${skadIds.length} SKAdNetwork IDs, official fixed-banner test IDs, NPA + UMP gates, file/link bridges, haptics removed.`,
);
