import { readFile, writeFile } from "node:fs/promises";

const workflows = [
  ".github/workflows/validate-latest-ios.yml",
  ".github/workflows/upload-testflight-test-ads.yml",
  ".github/workflows/upload-app-store-production.yml",
];

for (const path of workflows) {
  let text = await readFile(path, "utf8");
  if (text.includes('release-overlay/src/adResilience.ts')) continue;
  const needle = `          cp release-overlay/src/removeAdsPurchase.ts \\\n            "$app_root/src/removeAdsPurchase.ts"`;
  if (!text.includes(needle)) {
    throw new Error(`Could not find Remove Ads overlay copy in ${path}`);
  }
  text = text.replace(
    needle,
    `${needle}\n          cp release-overlay/src/adResilience.ts \\\n            "$app_root/src/adResilience.ts"`,
  );
  await writeFile(path, text, "utf8");
}

const verifyPath = "release-overlay/scripts/verify-test-release.mjs";
let verify = await readFile(verifyPath, "utf8");
if (!verify.includes("adResilience")) {
  verify = verify.replace(
    `const [html, app, purchase, iosNotices, delegate, plist, embedded, packageJson, packageLock, skadText, iconBase64, brandLogo, brandMaster, privacyManifest, englishInfoPlist, spanishInfoPlist] =\n  await Promise.all([\n    read("app.html"),\n    read("App.tsx"),\n    read("src/removeAdsPurchase.ts"),`,
    `const [html, app, purchase, adResilience, iosNotices, delegate, plist, embedded, packageJson, packageLock, skadText, iconBase64, brandLogo, brandMaster, privacyManifest, englishInfoPlist, spanishInfoPlist] =\n  await Promise.all([\n    read("app.html"),\n    read("App.tsx"),\n    read("src/removeAdsPurchase.ts"),\n    read("src/adResilience.ts"),`,
  );
  const anchor = `requireText(\n  app,\n  "automaticallyAdjustContentInsets={false}",\n  "WebView inset hardening",\n);`;
  if (!verify.includes(anchor)) throw new Error("Could not find verifier insertion anchor");
  verify = verify.replace(
    anchor,
    `${anchor}\nrequireText(app, 'from "./src/adResilience"', "native ad resilience import");\nrequireText(app, "triggerBannerReload", "native ad self-healing reload");\nrequireText(app, "probeAdNetworkReachability", "native ad reachability recovery");\nrequireText(adResilience, "OFFLINE_REACHABILITY_POLL_MS = 30_000", "offline ad polling");\nrequireText(adResilience, "response.status === 204", "captive-portal rejection");\nrequireText(adResilience, "300_000", "capped long ad retry");`,
  );
  await writeFile(verifyPath, verify, "utf8");
}

console.log("Wired ad resilience helper into all iOS assembly paths and release verification.");
