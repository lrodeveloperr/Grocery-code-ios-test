import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const EXPECTED_HTML_SHA256 =
  "875d52cb6773cd4a29def9d0f444e4d821334de15f5ed0985c4928f8fbd9d120";
const EXPECTED_ICON_SHA256 =
  "a2893e96e83fed237c7063747c1f41c10c30ea85e3911149c13b02bfa861f808";
const EXPECTED_BRAND_LOGO_SHA256 =
  "a2893e96e83fed237c7063747c1f41c10c30ea85e3911149c13b02bfa861f808";
const EXPECTED_BRAND_MASTER_SHA256 =
  "6dc4daf09634cf419056c20be1ccbcfb3af9694a66909d579194100a1e740ff0";
const TEST_APP_ID = "ca-app-pub-3940256099942544~1458002511";
const TEST_BANNER_ID = "ca-app-pub-3940256099942544/2934735716";

const read = (path) => readFile(path, "utf8");
const readBytes = (path) => readFile(path);
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

const [html, app, delegate, plist, embedded, packageJson, packageLock, skadText, iconBase64, brandLogo, brandMaster] =
  await Promise.all([
    read("app.html"),
    read("App.tsx"),
    read("ios/SNAPEBTGroceryTrackerQA/AppDelegate.swift"),
    read("ios/SNAPEBTGroceryTrackerQA/Info.plist"),
    read("src/appHtml.ts"),
    read("package.json"),
    read("package-lock.json"),
    read("ios/skadnetwork-ids.txt"),
    read("assets/app-icon.png.base64"),
    readBytes("assets/brand-logo-ui.png"),
    readBytes("assets/brand-logo-master.jpeg"),
  ]);

if (sha256(html) !== EXPECTED_HTML_SHA256) {
  throw new Error(`Canonical HTML digest changed: ${sha256(html)}`);
}
requireText(
  embedded,
  `export const APP_HTML_SHA256 = "${EXPECTED_HTML_SHA256}";`,
  "embedded source",
);
requireText(html, '<div class="drawer-logo"><img src="assets/brand-logo-ui.png"', "brand logo source");
requireText(html, '${ICONS.brandLogo}', "onboarding brand logo");
requireText(html, "ICONS.brandLogo=brandLogoMount?brandLogoMount.innerHTML:'';", "brand logo reuse");
requireText(
  html,
  ".drawer{width:min(88vw,360px);background:#f7f7fa;box-shadow:none;",
  "closed drawer shadow",
);
requireText(
  html,
  ".drawer.open{box-shadow:20px 0 60px rgba(0,0,0,.18)}",
  "open drawer shadow",
);
requireText(
  html,
  ".drawer-shade{background:transparent;visibility:hidden;backdrop-filter:none;-webkit-backdrop-filter:none}",
  "closed drawer shade compositor hardening",
);
requireText(
  app,
  "automaticallyAdjustContentInsets={false}",
  "WebView inset hardening",
);
if ((app.match(/backgroundColor: "#f2f2f7"/g) || []).length !== 3) {
  throw new Error("Native root, safe-area, and WebView backgrounds must match the web surface.");
}
if ((html.match(/assets\/brand-logo-ui\.png/g) || []).length !== 1) {
  throw new Error("The canonical web app must reference the brand logo exactly once.");
}
if ((embedded.match(/data:image\/png;base64,/g) || []).length !== 1) {
  throw new Error("The native embedded app must inline the reviewed brand logo exactly once.");
}
forbidText(embedded, "assets/brand-logo-ui.png", "native embedded brand logo");
for (const fingerprint of ["M15 28" + "h34l-4 25H19z", "#ffd" + "66e", "#f39" + "a47", "drawApp" + "BasketLogo"]) {
  forbidText(html, fingerprint, "legacy colorful basket branding");
  forbidText(embedded, fingerprint, "embedded legacy colorful basket branding");
}

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
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(scripts[0][1], sandbox, { filename: "GBTCore.inline.js" });
vm.runInContext(scripts[3][1], sandbox, { filename: "GBTRemediation.inline.js" });
const Core = sandbox.GBTCore;
const Reports = sandbox.GBTRemediation;
if (!Core || !Reports) throw new Error("Could not load pure application/report logic.");

const bridgeMatch = app.match(
  /const NATIVE_BRIDGE_SCRIPT = String\.raw`([\s\S]*?)`;/,
);
if (!bridgeMatch) throw new Error("Could not inspect the native share bridge.");
const bridgeMessages = [];
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
  addEventListener: () => {},
  GBTAdRuntime: null,
};
bridgeWindow.window = bridgeWindow;
const bridgeSandbox = {
  window: bridgeWindow,
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
bridgeWindow.GBTNativeShareCompleted("stale-request", true, "SHARE_COMPLETED", "");
const staleStillBlocked = await bridgeWindow
  .GBTNativeShareFile(new Blob(["stale"]), "same-name.pdf", "application/pdf")
  .then(() => "", (error) => error.message);
if (!staleStillBlocked.includes("already open")) {
  throw new Error("A stale native acknowledgement unlocked the active export.");
}
bridgeWindow.GBTNativeShareCompleted(firstMessage.requestId, true, "SHARE_COMPLETED", "");
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
bridgeWindow.GBTNativeShareCompleted(
  secondMessage.requestId,
  false,
  "SHARE_CANCELLED",
  "cancelled",
);
const shareFailure = await secondShare.then(
  () => ({ code: "", message: "" }),
  (error) => ({ code: error.code, message: error.message }),
);
if (shareFailure.code !== "SHARE_CANCELLED" || shareFailure.message !== "cancelled") {
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
bridgeWindow.GBTNativeShareCompleted(
  recoveredMessage.requestId,
  true,
  "SHARE_COMPLETED",
  "",
);
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

function assertTaggedPdfAccessibility(bytes) {
  const text = new TextDecoder().decode(bytes);
  for (const marker of [
    "/MarkInfo << /Marked true /Suspects false >>",
    "/StructTreeRoot",
    "/ParentTree",
    "/StructParents",
    "/MCID",
    "/Artifact BMC",
    "/ToUnicode",
    "/Title",
    "/S /Document",
    "/S /H1",
    "/S /H2",
    "/S /P",
    "/S /Table",
    "/S /TR",
    "/S /TH",
    "/S /TD",
  ]) {
    if (!text.includes(marker)) throw new Error(`Tagged PDF is missing ${marker}.`);
  }
  const pageCount = (text.match(/\/Type \/Page\b/g) || []).length;
  const structParentCount = (text.match(/\/StructParents\s+\d+/g) || []).length;
  const fontUnicodeCount = (text.match(/\/ToUnicode\s+\d+\s+0\s+R/g) || []).length;
  if (!pageCount || structParentCount !== pageCount) {
    throw new Error("Tagged PDF does not map every page into the ParentTree.");
  }
  if (fontUnicodeCount !== 2) {
    throw new Error("Tagged PDF fonts do not both expose a ToUnicode map.");
  }
}

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
assertTaggedPdfAccessibility(maskedPdfBytes);
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
assertTaggedPdfAccessibility(stressPdf);
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
requireText(html, 'data-action="money-pad-cents" data-cents="00"', "quick .00 money entry");
requireText(html, 'data-action="money-pad-cents" data-cents="99"', "quick .99 money entry");
requireText(html, "moneyPadState.centsShortcutApplied", "idempotent cent shortcuts");
requireText(html, "moneyInputAttributes(a.unit==='$'", "conditional WIC dollar keypad");
requireText(html, "moneyInputAttributes(true,d.priceEntryMode", "transaction price keypad");
requireText(html, "input.dispatchEvent(new Event('change',{bubbles:true}))", "money keypad change synchronization");
requireText(html, "function adPlacementAllowed(){return state.route!=='cards'&&!modalState;}", "Cards and modal ad exclusion");
requireText(html, "window.dispatchEvent(new Event('gbt-ad-presentation-change'))", "immediate ad-placement bridge");
requireText(html, "window.GBTNativeShareFile(blob,name", "explicit native report-share bridge");
requireText(html, "SNAP_ITEM_NOT_ELIGIBLE", "SNAP/PAN eligibility checkout guard");
requireText(html, "buildHistoryBackupParts", "multipart History backup");
requireText(html, "Payment Allocations", "allocation-detail spreadsheet export");
requireText(html, "window.GBTNativeReconcileNotifications", "local reminder bridge");
requireText(html, "const TERMS_VERSION='2026-08-11';", "versioned Terms acceptance");
requireText(html, "const AD_DISCLOSURE_VERSION='2026-08-11';", "versioned advertising disclosure");
requireText(html, 'id="onAgeConfirmed" type="checkbox"', "separate adult confirmation");
requireText(html, 'id="onTermsAccepted" type="checkbox"', "separate Terms and Privacy confirmation");
requireText(html, 'id="onAdvertisingAllowed" type="checkbox"', "separate optional publisher advertising choice");
requireText(html, "if(step==='legal'&&(!d.ageConfirmed||!d.termsAccepted))", "mandatory first-run legal gate");
requireText(html, "next.settings.legalAcceptance=makeLegalAcceptance()", "persisted legal acceptance");
requireText(html, "next.settings.advertisingConsent=makeAdvertisingConsent(d.advertisingAllowed===true)", "persisted publisher advertising choice");
requireText(html, "disclosureVersion:AD_DISCLOSURE_VERSION,updatedAt:new Date().toISOString()", "accountable publisher advertising record");
requireText(html, "function confirmPublisherAdvertisingChoice()", "later publisher advertising confirmation");
requireText(html, "<p>${tr('onboarding.advertisingChoice')}</p>", "full later publisher advertising disclosure");
requireText(html, "e.target.checked=false;confirmPublisherAdvertisingChoice()", "publisher advertising opt-in confirmation gate");
requireText(html, "renderTermsReaccept()", "material Terms reacceptance gate");
requireText(html, "window.GBTNativeClearAppData", "acknowledged native Clear All bridge");
requireText(html, "localStorage.removeItem(key);if(localStorage.getItem(key)!==null)return false;", "verified legacy tracker deletion");
requireText(html, "await reconcileNativeReminders()", "Clear All failure reminder rollback");
requireText(html, "surviving temporary export-cache copies", "Clear All native-cache boundary");
requireText(html, "Masking hides financial amounts and WIC quantities only.", "masked-report scope warning");
requireText(html, "No account, profile, or publisher-operated analytics or telemetry.", "qualified local-first disclosure");
forbidText(html, "anonymousReport", "overbroad report anonymity claim");
forbidText(html, "Anonymous report", "overbroad report anonymity claim");
forbidText(html, "Reporte anónimo", "overbroad report anonymity claim");
forbidText(html, "Core tracker data stays on this device unless you export it.", "device-backup overstatement");
forbidText(html, "Los datos principales del rastreador permanecen en este dispositivo salvo que los exportes.", "device-backup overstatement");
forbidText(html, "Optional permanent Remove Ads", "unshipped purchase claim");
forbidText(html, "Restore Purchase", "unshipped purchase claim");
forbidText(html, "USDA/FNA", "agency attribution");
requireText(html, "if(window.ReactNativeWebView?.postMessage)throw R.err(R.ERROR.SHARE_FAILED", "native blob-navigation fail-close");
requireText(html, "MAX_PDF_DETAIL_ROWS=2000", "bounded iPhone PDF generation");
requireText(html, "if(delta&&!isNew)", "new SNAP opening-balance ledger guard");
requireText(html, "k==='CHECKOUT'||k==='PURCHASE'", "explicit purchase ledger classification");
forbidText(html, "errors.push(['itemInput','UNRESOLVED_FUNDING'])", "shop item validation");
forbidText(html, "openRemoveAdsPurchase", "public test release");
forbidText(html, "confirm-remove-ads-preview", "public test release");
forbidText(html, "class=\"remove-ads-row\"", "public test release");
forbidText(html, "haptic(", "haptic-free interface");
forbidText(html, 'id="hapticSetting"', "haptic-free settings");
forbidText(html, "navigator.vibrate", "haptic-free web runtime");

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
requireText(app, "unitId={bannerUnitId}", "native banner");
requireText(app, "size={BannerAdSize.BANNER}", "fixed 320x50 banner");
requireText(app, "const AD_SLOT_BOTTOM = 66", "HTML/native banner alignment");
requireText(app, "requestNonPersonalizedAdsOnly: true", "non-personalized request");
requireText(app, "AdsConsent.gatherConsent()", "UMP consent update");
requireText(app, "AdsConsent.getConsentInfo()", "cached UMP consent check");
requireText(app, 'type: "legal-ready"; ready: boolean', "native legal-readiness bridge");
requireText(app, 'type: "publisher-ad-choice"; allowed: boolean', "publisher advertising bridge");
requireText(app, '!publisherAdsAllowed ||', "publisher-choice UMP block");
requireText(app, 'if (legalReady && publisherAdsAllowed) void showPrivacyChoices();', "privacy-choice legal and publisher gate");
requireText(app, "const showBanner =\n    legalReady &&", "banner legal gate");
requireText(app, "legalReady &&\n    publisherAdsAllowed &&", "banner publisher-choice gate");
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
requireText(app, "type: \"notifications-reconcile\"", "native notification bridge");
requireText(app, "type: \"clear-app-data\"", "native Clear All bridge");
requireText(app, "NOTIFICATIONS_RECONCILED", "native notification acknowledgement");
requireText(app, "APP_DATA_CLEARED", "native Clear All acknowledgement");
requireText(app, "window.GBTNativeClearAppDataCompleted", "native Clear All completion callback");
requireText(app, 'new Directory(Paths.cache, "gbt-share")', "native temporary export-cache root");
requireText(app, "purgeShareCacheRoot()", "native temporary export-cache purge");
requireText(app, "await cancelOwnedScheduledReminders()", "native owned-reminder purge");
requireText(app, 'type ReminderKind = "snap-balance" | "wic-review" | "wic-expiry"', "bounded local reminder kinds");
requireText(app, "requestId?: string", "native file-share acknowledgement ID");
requireText(app, "window.GBTNativeShareCompleted", "native file-share acknowledgement");
requireText(app, 'file.write(base64, { encoding: "base64" })', "validated native file write");
requireText(app, "fileUti(name, message.mimeType)", "native file type mapping");
requireText(app, "const shareDirectory = new Directory(", "unique native export directory");
requireText(app, "shareDirectory.delete()", "unique native export cleanup");
forbidText(app, "new File(Paths.cache, name)", "same-name native export collision");
requireText(app, "onShouldStartLoadWithRequest", "external-link bridge");
requireText(app, "SafeAreaView", "safe-area layout");
forbidText(app, "Vibration", "haptic-free native wrapper");
forbidText(app, 'type: "haptic"', "haptic-free native bridge");
forbidText(app, 'navigator, "vibrate"', "haptic-free native bridge");
forbidText(app, 'url.startsWith("blob:")', "top-level blob navigation");
forbidText(app, 'url.startsWith("data:")', "top-level data navigation");
forbidText(app, '"blob:*"', "WebView origin allowlist");
forbidText(app, '"data:*"', "WebView origin allowlist");
forbidText(app, "Buffer.from", "native export memory duplication");

const gatherIndex = app.indexOf("AdsConsent.gatherConsent()");
const gatherEffectIndex = app.lastIndexOf("useEffect(() => {", gatherIndex);
const gatherGateSource = app.slice(gatherEffectIndex, gatherIndex);
const sharedGateIndex = app.indexOf("startAdsIfAllowed(reportedCanRequestAds)", gatherIndex);
if (
  gatherIndex < 0 ||
  gatherEffectIndex < 0 ||
  !gatherGateSource.includes("!legalReady") ||
  !gatherGateSource.includes("!publisherAdsAllowed") ||
  !gatherGateSource.includes('consentState !== "unresolved"') ||
  sharedGateIndex < gatherIndex
) {
  throw new Error("The initial UMP update does not gate SDK initialization.");
}
if ((app.match(/AdsConsent\.gatherConsent\(\)/g) || []).length !== 1) {
  throw new Error("UMP gathering must have one publisher-gated entry point.");
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
if (delegate.indexOf("configureAdvertisingPrivacy()") > delegate.indexOf("factory.startReactNative")) {
  throw new Error("Advertising privacy is configured after application startup.");
}

requireText(plist, TEST_APP_ID, "Info.plist test app ID");
if (!/<key>GADDelayAppMeasurementInit<\/key>\s*<true\s*\/>/.test(plist)) {
  throw new Error("Info.plist must delay Google app measurement until publisher advertising is enabled.");
}
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
if (parsedPackage.dependencies?.["react-native-webview"] !== "14.0.1") {
  throw new Error("react-native-webview must stay pinned to 14.0.1.");
}
if (parsedPackage.dependencies?.["react-native-google-mobile-ads"] !== "16.4.0") {
  throw new Error("react-native-google-mobile-ads must stay pinned to 16.4.0.");
}
if (parsedPackage.dependencies?.["expo-notifications"] !== "~57.0.10") {
  throw new Error("expo-notifications must stay compatible with Expo 57.");
}
for (const dependency of ["expo-iap", "react-native-iap"]) {
  if (parsedPackage.dependencies?.[dependency] || parsedPackage.devDependencies?.[dependency]) {
    throw new Error(`${dependency} is not shipped in the no-purchase release.`);
  }
  if (parsedLock.packages?.[`node_modules/${dependency}`]) {
    throw new Error(`The lockfile still contains unshipped ${dependency}.`);
  }
}

const appConfig = JSON.parse(await read("app.json"));
const configuredPlugins = appConfig?.expo?.plugins || [];
for (const plugin of configuredPlugins) {
  const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
  if (pluginName === "expo-iap" || pluginName === "react-native-iap") {
    throw new Error(`Legacy IAP config plugin remains configured: ${pluginName}`);
  }
}
if (parsedLock.packages?.["node_modules/react-native-google-mobile-ads"]?.version !== "16.4.0") {
  throw new Error("The lockfile does not pin react-native-google-mobile-ads 16.4.0.");
}
if (parsedLock.packages?.["node_modules/expo-notifications"]?.version !== "57.0.10") {
  throw new Error("The lockfile does not pin expo-notifications 57.0.10.");
}

const iconBytes = Buffer.from(iconBase64.replace(/\s/g, ""), "base64");
if (sha256(iconBytes) !== EXPECTED_ICON_SHA256) {
  throw new Error("The reviewed App Store icon digest changed.");
}
if (sha256(brandLogo) !== EXPECTED_BRAND_LOGO_SHA256) {
  throw new Error("The reviewed in-app brand logo digest changed.");
}
if (sha256(brandMaster) !== EXPECTED_BRAND_MASTER_SHA256) {
  throw new Error("The exact user-supplied brand master digest changed.");
}
if (!iconBytes.equals(brandLogo)) {
  throw new Error("The App Store icon and in-app brand image must use the same reviewed derivative.");
}

console.log(
  `Release checks passed: ${scripts.length} scripts, ${skadIds.length} SKAdNetwork IDs, official fixed-banner test IDs, NPA + UMP gates, file/link/reminder bridges, haptics removed.`,
);
