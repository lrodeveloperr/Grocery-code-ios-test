import { readFile, writeFile } from "node:fs/promises";

const appPath = "release-overlay/App.tsx";
const testPath = "release-overlay/tests/App.ui.test.tsx";
const docPath = "IOS_IAP_AD_QA_HARDENING.md";

let source = await readFile(appPath, "utf8");
if (source.includes("createAdDiagnostics") && source.includes("triggerBannerReload")) {
  console.log("App.tsx resilience patch already applied.");
  process.exit(0);
}

function replaceOrThrow(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Could not find App.tsx patch target: ${label}`);
  }
  source = source.replace(before, after);
}

replaceOrThrow(
  'import APP_HTML from "./src/appHtml";\nimport {\n  connectRemoveAdsStore,',
  'import APP_HTML from "./src/appHtml";\nimport {\n  createAdDiagnostics,\n  NETWORK_RECOVERY_DEBOUNCE_MS,\n  nextAdRetryDelay,\n  OFFLINE_REACHABILITY_POLL_MS,\n  probeAdNetworkReachability,\n  withRetryJitter,\n} from "./src/adResilience";\nimport {\n  connectRemoveAdsStore,',
  "ad resilience import",
);

replaceOrThrow(
  '  const trackingAuthorizationRef = useRef<Promise<boolean> | null>(null);\n  const previousWebAdStateRef = useRef("AD_LOADING");',
  '  const trackingAuthorizationRef = useRef<Promise<boolean> | null>(null);\n  const previousWebAdStateRef = useRef("AD_LOADING");\n  const appStateRef = useRef(AppState.currentState);\n  const adLoadInFlightRef = useRef(false);\n  const adNetworkReachableRef = useRef<boolean | null>(null);\n  const adDiagnosticsRef = useRef(createAdDiagnostics());',
  "ad resilience refs",
);

replaceOrThrow(
  '      if (entitlement === "entitled") {\n        setNativeAdState("idle");\n        setAdLoadAttempt(0);\n      }',
  '      if (entitlement === "entitled") {\n        // Remove the ad path immediately. Any outstanding retry callback also\n        // re-checks this ref before it can remount a banner.\n        adLoadInFlightRef.current = false;\n        adNetworkReachableRef.current = null;\n        setNativeAdState("idle");\n        setAdLoadAttempt(0);\n      }',
  "entitlement ad cancellation",
);

replaceOrThrow(
  `  const refreshRemoveAdsProduct = useCallback(async () => {\n    setRemoveAdsProductState("loading");\n    try {\n      const product = await fetchRemoveAdsProduct();\n      if (!product) {\n        setRemoveAdsProduct(null);\n        setRemoveAdsProductState("unavailable");\n        return null;\n      }\n      setRemoveAdsProduct(product);\n      setRemoveAdsProductState("ready");\n      return product;\n    } catch {\n      setRemoveAdsProduct(null);\n      setRemoveAdsProductState("unavailable");\n      return null;\n    }\n  }, []);`,
  `  const refreshRemoveAdsProduct = useCallback(async () => {\n    setRemoveAdsProductState("loading");\n    try {\n      const product = await fetchRemoveAdsProduct();\n      if (!product) {\n        setRemoveAdsProduct(null);\n        setRemoveAdsProductState("unavailable");\n        return null;\n      }\n      if (product.priceMatchesExpected === false) {\n        const message =\n          \`StoreKit returned \${product.displayPrice} for the U.S. storefront, but Remove Ads is intended to be USD \${product.expectedUsdPrice.toFixed(2)}. Check App Store Connect. StoreKit remains authoritative and purchasing is not blocked.\`;\n        console.warn("[IAP PRICE MISMATCH]", message);\n        if (testAds) {\n          Alert.alert("Price configuration mismatch", message);\n        }\n      }\n      setRemoveAdsProduct(product);\n      setRemoveAdsProductState("ready");\n      return product;\n    } catch (error) {\n      console.warn("StoreKit product lookup failed", error);\n      setRemoveAdsProduct(null);\n      setRemoveAdsProductState("unavailable");\n      return null;\n    }\n  }, [testAds]);`,
  "price validation UI handling",
);

replaceOrThrow(
  `          } catch (error) {\n            console.warn(\n              "StoreKit will replay the unfinished transaction",\n              error,\n            );\n          }`,
  `          } catch (error) {\n            console.warn(\n              "StoreKit will replay the unfinished transaction",\n              error,\n            );\n            Alert.alert(\n              "Purchase saved",\n              "Your Remove Ads purchase is active, but Apple could not finish the transaction cleanly after several attempts. If ads ever return, use Restore Purchases or contact support.",\n            );\n          }`,
  "finish transaction failure feedback",
);

replaceOrThrow(
  `        if (isRemoveAdsAlreadyOwned(error)) {\n          const entitled = await reconcileRemoveAdsEntitlement();\n          completeRemoveAdsAction(\n            "purchase",\n            entitled === true ? "success" : "failed",\n          );\n        } else if (isRemoveAdsPurchaseCancelled(error)) {\n          completeRemoveAdsAction("purchase", "cancelled");\n        } else if (isRemoveAdsPurchasePending(error)) {\n          completeRemoveAdsAction("purchase", "pending");\n        } else {\n          completeRemoveAdsAction("purchase", "failed");\n        }`,
  `        if (isRemoveAdsAlreadyOwned(error)) {\n          const entitled = await reconcileRemoveAdsEntitlement();\n          completeRemoveAdsAction(\n            "purchase",\n            entitled === true ? "success" : "failed",\n          );\n          if (entitled !== true) {\n            Alert.alert(\n              "Purchase configuration issue",\n              "Apple reports that Remove Ads is already owned, but the entitlement could not be confirmed. Please use Restore Purchases. If that does not work, contact support.",\n            );\n          }\n        } else if (isRemoveAdsPurchaseCancelled(error)) {\n          completeRemoveAdsAction("purchase", "cancelled");\n        } else if (isRemoveAdsPurchasePending(error)) {\n          completeRemoveAdsAction("purchase", "pending");\n          Alert.alert(\n            "Purchase pending",\n            "Your purchase is being processed. You will be notified when it completes.",\n          );\n        } else {\n          console.warn("Remove Ads purchase failed", error);\n          completeRemoveAdsAction("purchase", "failed");\n          Alert.alert(\n            "Purchase unavailable",\n            "Remove Ads could not be purchased right now. Please check your connection and try again.",\n          );\n        }`,
  "purchase error feedback",
);

const insertionPoint = `  useEffect(() => {\n    if (\n      removeAdsEntitlement !== "not-entitled" ||\n      !legalReady ||\n      consentState !== "unresolved"\n    ) {`;
if (!source.includes(insertionPoint)) {
  throw new Error("Could not find insertion point for ad recovery helpers");
}
const recoveryHelpers = `  const canAttemptBanner = useCallback(() => {\n    return (\n      appStateRef.current === "active" &&\n      removeAdsEntitlementRef.current === "not-entitled" &&\n      legalReady &&\n      consentState === "permitted" &&\n      adEligible &&\n      webAdState !== "AD_TEMPORARILY_HIDDEN" &&\n      Boolean(bannerUnitId)\n    );\n  }, [adEligible, bannerUnitId, consentState, legalReady, webAdState]);\n\n  const triggerBannerReload = useCallback(\n    (reason: string, resetBackoff = false) => {\n      if (!canAttemptBanner() || adLoadInFlightRef.current) return false;\n      if (resetBackoff) setAdLoadAttempt(0);\n      adLoadInFlightRef.current = true;\n      const diagnostics = adDiagnosticsRef.current;\n      diagnostics.attempts += 1;\n      diagnostics.lastAttemptAt = Date.now();\n      if (testAds) {\n        console.info(\"[AdMob QA] banner load\", { reason, ...diagnostics });\n      }\n      setBannerInstance((instance) => instance + 1);\n      setNativeAdState("loading");\n      return true;\n    },\n    [canAttemptBanner, testAds],\n  );\n\n`;
source = source.replace(insertionPoint, recoveryHelpers + insertionPoint);

replaceOrThrow(
  `  useEffect(() => {\n    if (!adEligible || removeAdsEntitlement !== "not-entitled") {\n      setNativeAdState("idle");\n      setAdLoadAttempt(0);\n      return;\n    }\n    setNativeAdState("loading");\n  }, [adEligible, removeAdsEntitlement]);\n\n  useEffect(() => {\n    if (\n      nativeAdState !== "failed" ||\n      !adEligible ||\n      consentState !== "permitted" ||\n      removeAdsEntitlement !== "not-entitled" ||\n      adLoadAttempt >= 2\n    ) {\n      return;\n    }\n    const retryTimer = setTimeout(\n      () => {\n        setAdLoadAttempt((attempt) => attempt + 1);\n        setBannerInstance((instance) => instance + 1);\n        setNativeAdState("loading");\n      },\n      2000 * 2 ** adLoadAttempt,\n    );\n    return () => clearTimeout(retryTimer);\n  }, [\n    adEligible,\n    adLoadAttempt,\n    consentState,\n    nativeAdState,\n    removeAdsEntitlement,\n  ]);`,
  `  useEffect(() => {\n    if (!canAttemptBanner()) {\n      adLoadInFlightRef.current = false;\n      if (\n        removeAdsEntitlement !== "not-entitled" ||\n        !adEligible ||\n        consentState !== "permitted"\n      ) {\n        setNativeAdState("idle");\n        setAdLoadAttempt(0);\n      }\n      return;\n    }\n    if (nativeAdState === "idle") {\n      triggerBannerReload("eligibility", true);\n    }\n  }, [\n    adEligible,\n    canAttemptBanner,\n    consentState,\n    nativeAdState,\n    removeAdsEntitlement,\n    triggerBannerReload,\n  ]);\n\n  useEffect(() => {\n    if (nativeAdState !== "failed" || !canAttemptBanner()) return;\n\n    let cancelled = false;\n    const knownOffline = adNetworkReachableRef.current === false;\n    const delay = knownOffline\n      ? OFFLINE_REACHABILITY_POLL_MS\n      : withRetryJitter(nextAdRetryDelay(adLoadAttempt));\n\n    const retryTimer = setTimeout(() => {\n      void (async () => {\n        if (cancelled || !canAttemptBanner()) return;\n        const reachable = await probeAdNetworkReachability();\n        if (cancelled || !canAttemptBanner()) return;\n\n        if (!reachable) {\n          adNetworkReachableRef.current = false;\n          adDiagnosticsRef.current.reachabilityFailures += 1;\n          // Re-arm this effect without asking AdMob for inventory while the\n          // network is demonstrably unavailable. Offline polling stays at 30s.\n          setAdLoadAttempt((attempt) => Math.min(attempt + 1, 1_000));\n          return;\n        }\n\n        const recoveredFromOffline = adNetworkReachableRef.current === false;\n        adNetworkReachableRef.current = true;\n        if (recoveredFromOffline) {\n          // Debounce flapping Wi-Fi/cellular transitions before remounting.\n          await waitFor(NETWORK_RECOVERY_DEBOUNCE_MS);\n          if (cancelled || !canAttemptBanner()) return;\n        }\n        setAdLoadAttempt((attempt) => Math.min(attempt + 1, 1_000));\n        triggerBannerReload(\n          recoveredFromOffline ? "network-recovered" : "backoff-retry",\n        );\n      })();\n    }, delay);\n\n    return () => {\n      cancelled = true;\n      clearTimeout(retryTimer);\n    };\n  }, [\n    adLoadAttempt,\n    canAttemptBanner,\n    nativeAdState,\n    triggerBannerReload,\n  ]);\n\n  useEffect(() => {\n    const subscription = AppState.addEventListener("change", (nextState) => {\n      const previousState = appStateRef.current;\n      appStateRef.current = nextState;\n      if (nextState !== "active") {\n        // iOS may suspend an in-flight request. The foreground path is allowed\n        // to remount it exactly once when the user returns.\n        adLoadInFlightRef.current = false;\n        return;\n      }\n      if (previousState === "active" || !canAttemptBanner()) return;\n      if (nativeAdState === "loaded") return;\n\n      adDiagnosticsRef.current.foregroundRecoveries += 1;\n      adNetworkReachableRef.current = null;\n      adLoadInFlightRef.current = false;\n      triggerBannerReload("foreground", true);\n    });\n    return () => subscription.remove();\n  }, [canAttemptBanner, nativeAdState, triggerBannerReload]);`,
  "self-healing retry system",
);

replaceOrThrow(
  `    ) {\n      setAdLoadAttempt(0);\n      setBannerInstance((instance) => instance + 1);\n      setNativeAdState("loading");\n    }\n  }, [adEligible, consentState, removeAdsEntitlement, webAdState]);`,
  `    ) {\n      adLoadInFlightRef.current = false;\n      adNetworkReachableRef.current = null;\n      triggerBannerReload("web-banner-visible", true);\n    }\n  }, [\n    adEligible,\n    consentState,\n    removeAdsEntitlement,\n    triggerBannerReload,\n    webAdState,\n  ]);`,
  "web banner recovery",
);

replaceOrThrow(
  `    if (removeAdsEntitlementRef.current !== "not-entitled") {\n      completeRemoveAdsAction("purchase", "failed");\n      return;\n    }`,
  `    if (removeAdsEntitlementRef.current !== "not-entitled") {\n      completeRemoveAdsAction("purchase", "failed");\n      Alert.alert(\n        "Purchase unavailable",\n        "Apple is still checking your Remove Ads status. Please try again in a moment.",\n      );\n      return;\n    }`,
  "purchase checking feedback",
);

replaceOrThrow(
  `    if (!removeAdsStoreRef.current) {\n      completeRemoveAdsAction("purchase", "failed");\n      return;\n    }`,
  `    if (!removeAdsStoreRef.current) {\n      completeRemoveAdsAction("purchase", "failed");\n      Alert.alert(\n        "App Store unavailable",\n        "The App Store connection is not ready. Please check your connection and try again.",\n      );\n      return;\n    }`,
  "purchase store feedback",
);

replaceOrThrow(
  `    if (!product) {\n      completeRemoveAdsAction("purchase", "failed");\n      return;\n    }`,
  `    if (!product) {\n      completeRemoveAdsAction("purchase", "failed");\n      Alert.alert(\n        "Purchase unavailable",\n        "Remove Ads is not available from the App Store right now. Please try again later.",\n      );\n      return;\n    }`,
  "product unavailable feedback",
);

replaceOrThrow(
  `    if (!removeAdsStoreRef.current) {\n      completeRemoveAdsAction("restore", "failed");\n      return;\n    }`,
  `    if (!removeAdsStoreRef.current) {\n      completeRemoveAdsAction("restore", "failed");\n      Alert.alert(\n        "Restore unavailable",\n        "The App Store connection is not ready. Please check your connection and try again.",\n      );\n      return;\n    }`,
  "restore store feedback",
);

replaceOrThrow(
  `    } catch {\n      completeRemoveAdsAction("restore", "failed");\n    } finally {`,
  `    } catch (error) {\n      console.warn("Remove Ads restore failed", error);\n      completeRemoveAdsAction("restore", "failed");\n      Alert.alert(\n        "Restore unavailable",\n        "Purchases could not be restored right now. Please check your connection and try again.",\n      );\n    } finally {`,
  "restore error feedback",
);

replaceOrThrow(
  `              onAdLoaded={() => {\n                setAdLoadAttempt(0);\n                setNativeAdState("loaded");\n              }}\n              onAdFailedToLoad={() => setNativeAdState("failed")}`,
  `              onAdLoaded={() => {\n                adLoadInFlightRef.current = false;\n                adNetworkReachableRef.current = true;\n                const diagnostics = adDiagnosticsRef.current;\n                diagnostics.loads += 1;\n                diagnostics.lastLoadedAt = Date.now();\n                setAdLoadAttempt(0);\n                setNativeAdState("loaded");\n                if (testAds) {\n                  console.info("[AdMob QA] banner loaded", { ...diagnostics });\n                }\n              }}\n              onAdFailedToLoad={(error) => {\n                adLoadInFlightRef.current = false;\n                const diagnostics = adDiagnosticsRef.current;\n                diagnostics.failures += 1;\n                diagnostics.lastFailureAt = Date.now();\n                if (testAds) {\n                  console.warn("[AdMob QA] banner failed", error, {\n                    ...diagnostics,\n                  });\n                }\n                setNativeAdState("failed");\n              }}`,
  "banner callbacks",
);

await writeFile(appPath, source, "utf8");

let tests = await readFile(testPath, "utf8");
if (!tests.includes("OFFLINE_REACHABILITY_POLL_MS")) {
  const anchor = `  expect(nativeSource).toContain("finishVerifiedRemoveAdsPurchase(purchase)");`;
  if (!tests.includes(anchor)) throw new Error("Could not patch UI test resilience assertions");
  tests = tests.replace(
    anchor,
    `${anchor}\n  expect(nativeSource).toContain("triggerBannerReload");\n  expect(nativeSource).toContain("probeAdNetworkReachability");\n  expect(nativeSource).toContain("OFFLINE_REACHABILITY_POLL_MS");\n  expect(nativeSource).toContain("foregroundRecoveries");\n  expect(nativeSource).toContain('reason, ...diagnostics');`,
  );
  await writeFile(testPath, tests, "utf8");
}

let doc = await readFile(docPath, "utf8");
if (!doc.includes("## Supermarket / network-outage resilience")) {
  doc += `\n\n## Supermarket / network-outage resilience\n\nThe banner layer is now explicitly self-healing while the tracker remains fully local and usable:\n\n- retries use a capped 2s, 5s, 15s, 30s, 60s, 2m, 5m schedule with jitter;\n- once a lightweight Google ad-network 204 probe confirms the phone is offline/unreachable, the app stops asking AdMob for inventory and probes reachability every 30 seconds instead;\n- captive portals are treated as unreachable unless the probe returns HTTP 204;\n- restored connectivity is debounced before the banner remounts;\n- foregrounding the app triggers one fresh recovery attempt when a banner is not loaded;\n- a ref-backed lock prevents foreground, retry, and WebView events from launching duplicate banner loads;\n- every retry re-checks entitlement, legal/ad eligibility, app foreground state, and temporary banner visibility;\n- a successful load resets the backoff to the fast path;\n- local in-memory diagnostics count attempts, loads, failures, reachability failures, and foreground recoveries without analytics or user identifiers;\n- the banner still occupies zero layout height until an ad has actually loaded, so outages never degrade the grocery workflow.\n`;
  await writeFile(docPath, doc, "utf8");
}

console.log("Applied iOS ad resilience patch.");
