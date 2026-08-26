import { readFile, writeFile } from "node:fs/promises";

const path = "release-overlay/scripts/verify-test-release.mjs";
let source = await readFile(path, "utf8");
const before = 'requireText(app, "adLoadAttempt >= 2", "bounded banner retry");';
const after = `requireText(app, "const AD_RETRY_DELAYS_MS = [", "self-healing banner retry schedule");\nrequireText(app, "300_000", "capped five-minute banner retry");\nrequireText(app, "OFFLINE_REACHABILITY_POLL_MS = 30_000", "offline reachability polling");\nrequireText(app, "response.status === 204", "captive-portal rejection");\nrequireText(app, "probeAdNetworkReachability()", "ad-network recovery probe");\nrequireText(app, 'triggerBannerReload("foreground", true)', "foreground banner recovery");\nrequireText(app, "adLoadInFlightRef.current", "single banner-load lock");`;
if (source.includes("self-healing banner retry schedule")) {
  console.log("Ad release verifier already updated.");
  process.exit(0);
}
if (!source.includes(before)) {
  throw new Error("Could not find obsolete bounded banner retry guard.");
}
source = source.replace(before, after);
await writeFile(path, source, "utf8");
console.log("Updated release verifier to require the self-healing ad recovery controls.");
