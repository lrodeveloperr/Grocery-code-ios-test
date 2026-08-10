import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const EXPECTED_HTML_SHA256 =
  "d18d77e8c4f7b84d0286885514389798e71d73f378839390fd49e06cbb3165e6";
const EXPECTED_ICON_SHA256 =
  "83ca4ce7eea1f53ba1891cfa1b736c447f55991aa3730566b0bd374c73ba6fa3";
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

const [html, app, delegate, plist, embedded, packageJson, packageLock, skadText, iconBase64] =
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
  ]);

if (sha256(html) !== EXPECTED_HTML_SHA256) {
  throw new Error(`Canonical HTML digest changed: ${sha256(html)}`);
}
requireText(
  embedded,
  `export const APP_HTML_SHA256 = "${EXPECTED_HTML_SHA256}";`,
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

requireText(html, "window.GBTAdRuntime=Object.freeze", "web ad runtime");
requireText(html, "downloadBlob('snap-ebt-wic-local-recovery.txt',blob)", "recovery export");
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
requireText(app, "onShouldStartLoadWithRequest", "external-link bridge");
requireText(app, "SafeAreaView", "safe-area layout");
forbidText(app, "Vibration", "haptic-free native wrapper");
forbidText(app, 'type: "haptic"', "haptic-free native bridge");
forbidText(app, 'navigator, "vibrate"', "haptic-free native bridge");

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
if (parsedPackage.dependencies?.["react-native-webview"] !== "14.0.1") {
  throw new Error("react-native-webview must stay pinned to 14.0.1.");
}
if (parsedPackage.dependencies?.["react-native-google-mobile-ads"] !== "16.4.0") {
  throw new Error("react-native-google-mobile-ads must stay pinned to 16.4.0.");
}
if (parsedLock.packages?.["node_modules/react-native-google-mobile-ads"]?.version !== "16.4.0") {
  throw new Error("The lockfile does not pin react-native-google-mobile-ads 16.4.0.");
}

const iconBytes = Buffer.from(iconBase64.replace(/\s/g, ""), "base64");
if (sha256(iconBytes) !== EXPECTED_ICON_SHA256) {
  throw new Error("The reviewed App Store icon digest changed.");
}

console.log(
  `Release checks passed: ${scripts.length} scripts, ${skadIds.length} SKAdNetwork IDs, official fixed-banner test IDs, NPA + UMP gates, file/link bridges, haptics removed.`,
);
