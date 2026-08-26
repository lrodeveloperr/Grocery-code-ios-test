import { readFile, writeFile } from "node:fs/promises";

const path = "release-overlay/App.tsx";
let source = await readFile(path, "utf8");
if (source.includes("const AD_RETRY_DELAYS_MS = [") && !source.includes('from "./src/adResilience"')) {
  console.log("Ad resilience is already inlined.");
  process.exit(0);
}

const importBlock = `import {\n  createAdDiagnostics,\n  NETWORK_RECOVERY_DEBOUNCE_MS,\n  nextAdRetryDelay,\n  OFFLINE_REACHABILITY_POLL_MS,\n  probeAdNetworkReachability,\n  withRetryJitter,\n} from "./src/adResilience";\n`;
if (!source.includes(importBlock)) throw new Error("Could not find ad resilience import");
source = source.replace(importBlock, "");

const anchor = `function waitFor(milliseconds: number) {\n  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));\n}\n`;
if (!source.includes(anchor)) throw new Error("Could not find waitFor anchor");
const inline = `\nconst AD_RETRY_DELAYS_MS = [\n  2_000,\n  5_000,\n  15_000,\n  30_000,\n  60_000,\n  120_000,\n  300_000,\n] as const;\nconst OFFLINE_REACHABILITY_POLL_MS = 30_000;\nconst NETWORK_RECOVERY_DEBOUNCE_MS = 1_500;\nconst AD_NETWORK_PROBE_TIMEOUT_MS = 4_000;\nconst AD_NETWORK_PROBE_URL =\n  "https://pagead2.googlesyndication.com/pagead/gen_204";\n\ntype AdDiagnostics = {\n  attempts: number;\n  loads: number;\n  failures: number;\n  reachabilityFailures: number;\n  foregroundRecoveries: number;\n  lastAttemptAt: number | null;\n  lastLoadedAt: number | null;\n  lastFailureAt: number | null;\n};\n\nfunction createAdDiagnostics(): AdDiagnostics {\n  return {\n    attempts: 0,\n    loads: 0,\n    failures: 0,\n    reachabilityFailures: 0,\n    foregroundRecoveries: 0,\n    lastAttemptAt: null,\n    lastLoadedAt: null,\n    lastFailureAt: null,\n  };\n}\n\nfunction nextAdRetryDelay(attempt: number) {\n  const index = Math.min(\n    Math.max(0, Math.trunc(attempt)),\n    AD_RETRY_DELAYS_MS.length - 1,\n  );\n  return AD_RETRY_DELAYS_MS[index];\n}\n\nfunction withRetryJitter(delayMs: number, random = Math.random) {\n  const jitter = (random() * 0.3 - 0.15) * delayMs;\n  return Math.max(250, Math.round(delayMs + jitter));\n}\n\nasync function probeAdNetworkReachability(\n  timeoutMs = AD_NETWORK_PROBE_TIMEOUT_MS,\n): Promise<boolean> {\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), timeoutMs);\n  try {\n    const response = await fetch(AD_NETWORK_PROBE_URL, {\n      method: "GET",\n      signal: controller.signal,\n      headers: {\n        "Cache-Control": "no-cache, no-store, max-age=0",\n        Pragma: "no-cache",\n      },\n    });\n    // Captive portals commonly return a page or redirect instead of Google's\n    // expected 204. Treat anything else as not-yet-reachable.\n    return response.status === 204;\n  } catch {\n    return false;\n  } finally {\n    clearTimeout(timer);\n  }\n}\n`;
source = source.replace(anchor, anchor + inline);
await writeFile(path, source, "utf8");
console.log("Inlined ad resilience into App.tsx so every existing iOS assembly path includes it.");
