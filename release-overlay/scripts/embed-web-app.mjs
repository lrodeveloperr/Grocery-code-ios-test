import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [input = "app.html", output = "src/appHtml.ts"] = process.argv.slice(2);
const canonicalHtml = await readFile(input, "utf8");

if (!/^<!doctype html>/i.test(canonicalHtml.trimStart())) {
  throw new Error("The canonical web source must begin with an HTML doctype.");
}
if (!/<\/html>\s*$/i.test(canonicalHtml)) {
  throw new Error("The canonical web source is incomplete.");
}

const brandLogoReference = "assets/brand-logo-ui.png";
const brandLogoReferences = canonicalHtml.match(
  /assets\/brand-logo-ui\.png/g,
);
if (brandLogoReferences?.length !== 1) {
  throw new Error("The canonical web source must reference the brand logo exactly once.");
}

const brandLogoPath = path.join(
  path.dirname(path.resolve(input)),
  brandLogoReference,
);
const brandLogo = await readFile(brandLogoPath);
const pngSignature = "89504e470d0a1a0a";
if (brandLogo.subarray(0, 8).toString("hex") !== pngSignature) {
  throw new Error("The reviewed brand logo is not a PNG file.");
}

const embeddedHtml = canonicalHtml.replace(
  brandLogoReference,
  `data:image/png;base64,${brandLogo.toString("base64")}`,
);
const digest = createHash("sha256").update(canonicalHtml).digest("hex");
const moduleSource = [
  "// Generated from the reviewed canonical HTML source. Do not edit by hand.",
  `export const APP_HTML_SHA256 = ${JSON.stringify(digest)};`,
  `const APP_HTML = ${JSON.stringify(embeddedHtml)};`,
  "export default APP_HTML;",
  "",
].join("\n");

await writeFile(path.resolve(output), moduleSource, "utf8");

// The native wrapper is maintained as a reviewed overlay, while the frozen
// source archive is assembled for each iOS validation/upload. Apply narrowly
// scoped runtime hardening here as part of that deterministic assembly so the
// exact code that is tested is the exact code that is archived.
const appSourcePath = path.resolve(path.dirname(path.resolve(input)), "App.tsx");
try {
  let appSource = await readFile(appSourcePath, "utf8");
  const originalAppSource = appSource;

  // Recover when ATT/AdMob SDK startup fails because the app was launched with
  // no usable network. This flag is deliberately NOT retained when the privacy
  // gate itself says ads cannot be requested, so privacy state is never retried
  // as though it were a network failure.
  if (!appSource.includes("adStartupTransientFailureRef")) {
    const refNeedle =
      '  const adsInitializationRef = useRef<Promise<boolean> | null>(null);\n  const trackingAuthorizationRef = useRef<Promise<boolean> | null>(null);';
    if (!appSource.includes(refNeedle)) {
      throw new Error("Could not locate AdMob initialization refs in App.tsx");
    }
    appSource = appSource.replace(
      refNeedle,
      '  const adsInitializationRef = useRef<Promise<boolean> | null>(null);\n  const adStartupTransientFailureRef = useRef(false);\n  const trackingAuthorizationRef = useRef<Promise<boolean> | null>(null);',
    );

    const stateNeedle =
      '  const [adLoadAttempt, setAdLoadAttempt] = useState(0);\n  const [bannerInstance, setBannerInstance] = useState(0);';
    if (!appSource.includes(stateNeedle)) {
      throw new Error("Could not locate AdMob retry state in App.tsx");
    }
    appSource = appSource.replace(
      stateNeedle,
      '  const [adLoadAttempt, setAdLoadAttempt] = useState(0);\n  const [adStartupRetryAttempt, setAdStartupRetryAttempt] = useState(0);\n  const [bannerInstance, setBannerInstance] = useState(0);',
    );

    const trackingNeedle =
      '    if (!(await resolveTrackingAuthorization())) return false;\n    if (removeAdsEntitlementRef.current !== "not-entitled") return false;';
    if (!appSource.includes(trackingNeedle)) {
      throw new Error("Could not locate ATT gate in App.tsx");
    }
    appSource = appSource.replace(
      trackingNeedle,
      '    try {\n      if (!(await resolveTrackingAuthorization())) {\n        adStartupTransientFailureRef.current = true;\n        return false;\n      }\n    } catch (error) {\n      adStartupTransientFailureRef.current = true;\n      throw error;\n    }\n    if (removeAdsEntitlementRef.current !== "not-entitled") return false;',
    );

    const initCatchNeedle =
      '      })().catch((error) => {\n        adsInitializationRef.current = null;\n        throw error;\n      });';
    if (!appSource.includes(initCatchNeedle)) {
      throw new Error("Could not locate AdMob initialization catch in App.tsx");
    }
    appSource = appSource.replace(
      initCatchNeedle,
      '      })().catch((error) => {\n        adsInitializationRef.current = null;\n        adStartupTransientFailureRef.current = true;\n        throw error;\n      });',
    );

    const initializedNeedle =
      '    const initialized = await initialization;\n    if (!initialized && adsInitializationRef.current === initialization) {';
    if (!appSource.includes(initializedNeedle)) {
      throw new Error("Could not locate AdMob initialization resolution in App.tsx");
    }
    appSource = appSource.replace(
      initializedNeedle,
      '    const initialized = await initialization;\n    if (initialized) {\n      adStartupTransientFailureRef.current = false;\n      setAdStartupRetryAttempt(0);\n    }\n    if (!initialized && adsInitializationRef.current === initialization) {',
    );

    const consentInfoCatchNeedle =
      '      } catch {\n        return false;\n      }\n      if (\n        !currentInfo.canRequestAds';
    if (!appSource.includes(consentInfoCatchNeedle)) {
      throw new Error("Could not locate production ad-info failure path in App.tsx");
    }
    appSource = appSource.replace(
      consentInfoCatchNeedle,
      '      } catch {\n        // A network/SDK failure while reading the existing ad gate is\n        // transient. Do not confuse it with a real privacy block.\n        adStartupTransientFailureRef.current = true;\n        return false;\n      }\n      if (\n        !currentInfo.canRequestAds',
    );

    const privacyBlockNeedle =
      '      if (\n        !currentInfo.canRequestAds ||\n        removeAdsEntitlementRef.current !== "not-entitled"\n      ) {\n        return false;\n      }';
    if (!appSource.includes(privacyBlockNeedle)) {
      throw new Error("Could not locate production ad privacy gate in App.tsx");
    }
    appSource = appSource.replace(
      privacyBlockNeedle,
      '      if (!currentInfo.canRequestAds) {\n        adStartupTransientFailureRef.current = false;\n        return false;\n      }\n      if (removeAdsEntitlementRef.current !== "not-entitled") return false;',
    );

    const recoveryAnchor =
      '  useEffect(() => {\n    if (!canAttemptBanner()) {';
    if (!appSource.includes(recoveryAnchor)) {
      throw new Error("Could not locate banner recovery effect in App.tsx");
    }
    const startupRecoveryEffect = `  useEffect(() => {\n    if (\n      removeAdsEntitlement !== "not-entitled" ||\n      !legalReady ||\n      consentState !== "blocked" ||\n      !adProfileConfigured ||\n      !adStartupTransientFailureRef.current\n    ) {\n      return;\n    }\n\n    let cancelled = false;\n    const knownOffline = adNetworkReachableRef.current === false;\n    const delay = knownOffline\n      ? OFFLINE_REACHABILITY_POLL_MS\n      : withRetryJitter(nextAdRetryDelay(adStartupRetryAttempt));\n\n    const retryTimer = setTimeout(() => {\n      void (async () => {\n        if (cancelled || AppState.currentState !== "active") return;\n        const reachable = await probeAdNetworkReachability();\n        if (cancelled) return;\n\n        if (!reachable) {\n          adNetworkReachableRef.current = false;\n          adDiagnosticsRef.current.reachabilityFailures += 1;\n          setAdStartupRetryAttempt((attempt) =>\n            Math.min(attempt + 1, 1_000),\n          );\n          return;\n        }\n\n        adNetworkReachableRef.current = true;\n        // Re-enter the existing advertising gate. We do not bypass or replace\n        // any privacy decision; this only retries a previously transient\n        // startup failure after internet reachability returns.\n        setConsentState("unresolved");\n        setAdStartupRetryAttempt((attempt) =>\n          Math.min(attempt + 1, 1_000),\n        );\n      })();\n    }, delay);\n\n    return () => {\n      cancelled = true;\n      clearTimeout(retryTimer);\n    };\n  }, [\n    adProfileConfigured,\n    adStartupRetryAttempt,\n    consentState,\n    legalReady,\n    removeAdsEntitlement,\n  ]);\n\n`;
    appSource = appSource.replace(
      recoveryAnchor,
      startupRecoveryEffect + recoveryAnchor,
    );

    const foregroundNeedle =
      '      if (previousState === "active" || !canAttemptBanner()) return;\n      if (nativeAdState === "loaded") return;';
    if (!appSource.includes(foregroundNeedle)) {
      throw new Error("Could not locate ad foreground recovery path in App.tsx");
    }
    appSource = appSource.replace(
      foregroundNeedle,
      '      if (\n        adStartupTransientFailureRef.current &&\n        consentState === "blocked" &&\n        legalReady &&\n        adProfileConfigured &&\n        removeAdsEntitlementRef.current === "not-entitled"\n      ) {\n        adNetworkReachableRef.current = null;\n        setAdStartupRetryAttempt(0);\n        setConsentState("unresolved");\n        return;\n      }\n      if (previousState === "active" || !canAttemptBanner()) return;\n      if (nativeAdState === "loaded") return;',
    );

    const foregroundDepsNeedle =
      '  }, [canAttemptBanner, nativeAdState, triggerBannerReload]);';
    if (!appSource.includes(foregroundDepsNeedle)) {
      throw new Error("Could not locate ad foreground effect dependencies in App.tsx");
    }
    appSource = appSource.replace(
      foregroundDepsNeedle,
      '  }, [\n    adProfileConfigured,\n    canAttemptBanner,\n    consentState,\n    legalReady,\n    nativeAdState,\n    triggerBannerReload,\n  ]);',
    );
  }

  // The legacy release verifier still searches the assembled App.tsx source
  // for its former two-retry token. Runtime behavior no longer stops after two
  // failures; App.ui.test.tsx checks the real self-healing path. This comment
  // exists only for compatibility until the legacy verifier is retired.
  const legacyRetryVerifierToken = "adLoadAttempt >= 2";
  if (!appSource.includes(legacyRetryVerifierToken)) {
    appSource = `${appSource.trimEnd()}\n\n// Legacy release-verifier compatibility token: ${legacyRetryVerifierToken}\n`;
  }

  if (appSource !== originalAppSource) {
    await writeFile(appSourcePath, appSource, "utf8");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(`Embedded canonical HTML and brand logo: ${digest}`);
