import { readFile, writeFile } from "node:fs/promises";

const path = "release-overlay/tests/App.ui.test.tsx";
let source = await readFile(path, "utf8");
const before = `'  useEffect(() => {\\n    if (!adEligible || removeAdsEntitlement !== "not-entitled")'`;
const after = `'  useEffect(() => {\\n    if (!canAttemptBanner())'`;
if (source.includes(after)) {
  console.log("Ad test boundary already updated.");
  process.exit(0);
}
if (!source.includes(before)) {
  throw new Error("Could not find stale consent-effect end marker.");
}
source = source.replace(before, after);
await writeFile(path, source, "utf8");
console.log("Updated UI test to end the consent section at the new banner-recovery effect.");
