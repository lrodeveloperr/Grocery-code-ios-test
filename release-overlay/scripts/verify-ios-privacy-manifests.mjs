#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) {
    throw new Error("Arguments must be supplied as --name value pairs.");
  }
  values.set(key.slice(2), value);
}

const appManifestPath = values.get("app-manifest");
const sdkRoot = values.get("sdk-root");
const bundleRoot = values.get("bundle-root");
const reportPath = values.get("report");
if (!appManifestPath || !sdkRoot || !reportPath) {
  throw new Error("--app-manifest, --sdk-root, and --report are required.");
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalized = (value) => value.split(path.sep).join("/");

async function walk(root) {
  const found = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile() && entry.name === "PrivacyInfo.xcprivacy") {
        found.push(candidate);
      }
    }
  }
  await visit(root);
  return found.sort();
}

function parsePlist(file) {
  const output = execFileSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", file],
    { encoding: "utf8" },
  );
  return JSON.parse(output);
}

function componentFor(file) {
  if (/Google(?:-Mobile-Ads-SDK|MobileAds)/i.test(file)) {
    return "GoogleMobileAds";
  }
  if (/GoogleUserMessagingPlatform|UserMessagingPlatform/i.test(file)) {
    return "UserMessagingPlatform";
  }
  return null;
}

function validateTrackingShape(document, label) {
  const domains = document.NSPrivacyTrackingDomains;
  if (document.NSPrivacyTracking === true) {
    if (!Array.isArray(domains) || domains.length === 0) {
      throw new Error(`${label}: NSPrivacyTracking=true requires nonempty NSPrivacyTrackingDomains.`);
    }
  } else if (domains !== undefined) {
    throw new Error(`${label}: tracking domains cannot exist unless NSPrivacyTracking=true.`);
  }
  for (const domain of domains || []) {
    if (
      typeof domain !== "string" ||
      domain.length === 0 ||
      domain !== domain.toLowerCase() ||
      domain.includes("/") ||
      domain.includes("?") ||
      domain.includes("#") ||
      domain.includes(":") ||
      !domain.includes(".")
    ) {
      throw new Error(`${label}: malformed tracking domain in vendor manifest.`);
    }
  }
}

function summarize(document) {
  return {
    tracking: document.NSPrivacyTracking === true,
    trackingDomains: [...(document.NSPrivacyTrackingDomains || [])].sort(),
    collectedDataTypes: (document.NSPrivacyCollectedDataTypes || []).map((entry) => ({
      dataType: entry.NSPrivacyCollectedDataType,
      linked: entry.NSPrivacyCollectedDataTypeLinked === true,
      tracking: entry.NSPrivacyCollectedDataTypeTracking === true,
      purposes: [...(entry.NSPrivacyCollectedDataTypePurposes || [])].sort(),
    })),
    accessedAPITypes: (document.NSPrivacyAccessedAPITypes || []).map((entry) => ({
      apiType: entry.NSPrivacyAccessedAPIType,
      reasons: [...(entry.NSPrivacyAccessedAPITypeReasons || [])].sort(),
    })),
  };
}

async function inventory(root, scope) {
  const entries = [];
  for (const file of await walk(root)) {
    const component = componentFor(normalized(file));
    if (!component) continue;
    const document = parsePlist(file);
    validateTrackingShape(document, `${scope} ${component} manifest`);
    entries.push({
      scope,
      component,
      relativePath: normalized(path.relative(root, file)),
      sha256: sha256(await readFile(file)),
      ...summarize(document),
    });
  }
  for (const component of ["GoogleMobileAds", "UserMessagingPlatform"]) {
    if (!entries.some((entry) => entry.component === component)) {
      throw new Error(`${scope}: packaged manifest for ${component} was not found.`);
    }
  }
  const googleTracking = entries.filter(
    (entry) =>
      entry.component === "GoogleMobileAds" &&
      entry.tracking &&
      entry.trackingDomains.length > 0,
  );
  if (googleTracking.length === 0) {
    throw new Error(
      `${scope}: GoogleMobileAds must carry its own tracking declaration and domains.`,
    );
  }
  return entries;
}

const appDocument = parsePlist(appManifestPath);
if (appDocument.NSPrivacyTracking !== false) {
  throw new Error("The app-owned privacy manifest must set NSPrivacyTracking=false.");
}
if ("NSPrivacyTrackingDomains" in appDocument) {
  throw new Error("The app-owned privacy manifest must not list SDK tracking domains.");
}
if ("NSPrivacyCollectedDataTypes" in appDocument) {
  throw new Error("The app-owned privacy manifest must not duplicate SDK collection rows.");
}
validateTrackingShape(appDocument, "app-owned manifest");

const installed = await inventory(sdkRoot, "installed");
const packaged = bundleRoot ? await inventory(bundleRoot, "packaged") : [];
const allVendorEntries = [...installed, ...packaged];
const report = {
  appOwnedManifest: {
    relativePath: path.basename(appManifestPath),
    sha256: sha256(await readFile(appManifestPath)),
    ...summarize(appDocument),
  },
  installed,
  packaged,
  aggregate: {
    tracking: allVendorEntries.some((entry) => entry.tracking),
    trackingDomains: [
      ...new Set(allVendorEntries.flatMap((entry) => entry.trackingDomains)),
    ].sort(),
    collectedDataTypes: [
      ...new Set(
        allVendorEntries.flatMap((entry) =>
          entry.collectedDataTypes.map((item) => item.dataType),
        ),
      ),
    ].sort(),
  },
  appStoreConnectLabelReconciliationRequired: true,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Privacy manifest verification passed: app-owned tracking=false; ${installed.length} installed and ${packaged.length} packaged Google/UMP manifests inventoried.`,
);
console.log(JSON.stringify(report, null, 2));
