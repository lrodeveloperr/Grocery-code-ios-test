export const AD_RETRY_DELAYS_MS = [
  2_000,
  5_000,
  15_000,
  30_000,
  60_000,
  120_000,
  300_000,
] as const;

export const OFFLINE_REACHABILITY_POLL_MS = 30_000;
export const NETWORK_RECOVERY_DEBOUNCE_MS = 1_500;
export const AD_NETWORK_PROBE_TIMEOUT_MS = 4_000;

// A successful probe must return 204. Captive portals commonly return 200 or
// a redirect, so they are treated as not-yet-reachable and the app keeps
// working without repeatedly asking AdMob for a banner that cannot load.
const AD_NETWORK_PROBE_URL =
  "https://pagead2.googlesyndication.com/pagead/gen_204";

export type AdDiagnostics = {
  attempts: number;
  loads: number;
  failures: number;
  reachabilityFailures: number;
  foregroundRecoveries: number;
  lastAttemptAt: number | null;
  lastLoadedAt: number | null;
  lastFailureAt: number | null;
};

export function createAdDiagnostics(): AdDiagnostics {
  return {
    attempts: 0,
    loads: 0,
    failures: 0,
    reachabilityFailures: 0,
    foregroundRecoveries: 0,
    lastAttemptAt: null,
    lastLoadedAt: null,
    lastFailureAt: null,
  };
}

export function nextAdRetryDelay(attempt: number) {
  const index = Math.min(
    Math.max(0, Math.trunc(attempt)),
    AD_RETRY_DELAYS_MS.length - 1,
  );
  return AD_RETRY_DELAYS_MS[index];
}

export function withRetryJitter(delayMs: number, random = Math.random) {
  // +/- 15% avoids a large population of devices retrying simultaneously
  // after a carrier/Wi-Fi outage while keeping the delay human-scale.
  const jitter = (random() * 0.3 - 0.15) * delayMs;
  return Math.max(250, Math.round(delayMs + jitter));
}

export async function probeAdNetworkReachability(
  timeoutMs = AD_NETWORK_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(AD_NETWORK_PROBE_URL, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
    return response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
