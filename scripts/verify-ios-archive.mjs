import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (name) => readFile(path.join(root, name), "utf8");

const project = await read(
  "ios/SNAPEBTGroceryTrackerQA.xcodeproj/project.pbxproj",
);
const scheme = await read(
  "ios/SNAPEBTGroceryTrackerQA.xcodeproj/xcshareddata/xcschemes/SNAPEBTGroceryTrackerQA.xcscheme",
);
const info = await read("ios/SNAPEBTGroceryTrackerQA/Info.plist");
const appDelegate = await read("ios/SNAPEBTGroceryTrackerQA/AppDelegate.swift");
const privacyManifest = await read(
  "ios/SNAPEBTGroceryTrackerQA/PrivacyInfo.xcprivacy",
);
const configPlugin = await read("plugins/withLocalOnlyDatabase.js");

assert.match(
  project,
  /PRODUCT_BUNDLE_IDENTIFIER = "com\.goodusestudios\.snapebtgrocerytracker\.qa";/,
);
assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 16\.4;/);
assert.match(project, /PRODUCT_NAME = "SNAPEBTGroceryTrackerQA";/);
assert.match(scheme, /BuildableName = "SNAPEBTGroceryTrackerQA\.app"/);
assert.match(info, /<string>SNAP &amp; EBT Grocery Tracker QA<\/string>/);
assert.match(info, /ca-app-pub-3940256099942544~1458002511/);
assert.match(info, /<key>GADDelayAppMeasurementInit<\/key>\s*<true\/>/);
assert.match(info, /<key>NSUserTrackingUsageDescription<\/key>/);
assert.match(info, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
assert.match(privacyManifest, /<key>NSPrivacyTracking<\/key>\s*<true\/>/);

const appDelegateEnd = appDelegate.indexOf("\nclass ReactNativeDelegate");
const helper = appDelegate.indexOf(
  "private func excludeTrackerDatabaseFromBackup()",
);
assert.ok(helper > 0 && helper < appDelegateEnd, "backup helper must be inside AppDelegate");
assert.match(appDelegate, /excludeTrackerDatabaseFromBackup\(\)\s*\n\s*return super\.application/);
assert.match(appDelegate, /resourceValues\.isExcludedFromBackup = true/);
assert.match(configPlugin, /contents\.lastIndexOf\("}", reactNativeDelegate\)/);

for (const name of [
  "PRIVACY.md",
  "TERMS.md",
  "STORE_LISTING.md",
  "APP_STORE_LISTING.md",
  "RELEASE_CHECKLIST.md",
  "THIRD_PARTY_NOTICES.txt",
]) {
  assert.equal((await stat(path.join(root, name))).isFile(), true, `missing ${name}`);
}

console.log(
  "iOS archive verification passed: QA identity, deployment target, scheme, test ads, ATT disclosure, tracking privacy manifest, local-only backup handling, and release documents are present.",
);
