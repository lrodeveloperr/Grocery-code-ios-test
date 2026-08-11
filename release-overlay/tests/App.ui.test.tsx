import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const nativeSource = readFileSync(resolve(root, "App.tsx"), "utf8");
const webSource = readFileSync(resolve(root, "app.html"), "utf8");

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test("keeps publisher advertising optional, default-off, and legally gated", () => {
  expect(nativeSource).toContain(
    "const [publisherAdsAllowed, setPublisherAdsAllowed] = useState(false);",
  );
  expect(occurrences(nativeSource, "AdsConsent.gatherConsent()")).toBe(1);
  expect(occurrences(nativeSource, "mobileAds().initialize()")).toBe(1);

  const consentEffect = sourceSection(
    nativeSource,
    "useEffect(() => {\n    if (\n      !legalReady ||\n      !publisherAdsAllowed ||",
    "  useEffect(() => {\n    if (!adEligible)",
  );
  expect(consentEffect).toContain("AdsConsent.gatherConsent()");
  expect(consentEffect).toContain("startAdsIfAllowed(reportedCanRequestAds)");

  const bannerGate = sourceSection(
    nativeSource,
    "  const showBanner =",
    "  const bannerMounted =",
  );
  expect(bannerGate).toContain("legalReady &&");
  expect(bannerGate).toContain("publisherAdsAllowed &&");
  expect(bannerGate).toContain('consentState === "permitted"');

  expect(nativeSource).toContain(
    "if (legalReady && publisherAdsAllowed) void showPrivacyChoices();",
  );
  expect(webSource).toContain("const AD_DISCLOSURE_VERSION='2026-08-11';");
  expect(webSource).toContain('id="onAdvertisingAllowed" type="checkbox"');
  expect(webSource).toContain(
    "next.settings.advertisingConsent=makeAdvertisingConsent(d.advertisingAllowed===true)",
  );
  expect(webSource).toContain("function confirmPublisherAdvertisingChoice()");
  expect(webSource).toContain("void savePublisherAdvertisingChoice(true)");
  expect(webSource).toContain("Google AdMob may process your IP address/coarse location");
  expect(webSource).toContain("Google AdMob puede procesar tu dirección IP/ubicación aproximada");
});

test("keeps Clear All fail-closed across native cache, reminders, and web stores", () => {
  expect(nativeSource).toContain('| { type: "clear-app-data"; requestId?: string };');
  expect(nativeSource).toContain(
    'const shareCacheRoot = new Directory(Paths.cache, "gbt-share");',
  );
  expect(nativeSource).toContain("await cancelOwnedScheduledReminders();");
  expect(nativeSource).toContain("purgeShareCacheRoot();");
  expect(nativeSource).toContain("window.GBTNativeClearAppDataCompleted?.(");

  const nativeClear = sourceSection(
    nativeSource,
    "  const clearNativeAppData = useCallback(",
    "  const reconcileNotifications = useCallback(",
  );
  expect(nativeClear.indexOf("await cancelOwnedScheduledReminders();")).toBeLessThan(
    nativeClear.indexOf("purgeShareCacheRoot();"),
  );
  expect(nativeClear).toContain('"APP_DATA_CLEARED"');
  expect(nativeClear).toContain('"APP_DATA_CLEAR_FAILED"');

  const verifiedLegacyClear = sourceSection(
    webSource,
    "function clearLegacyAndRecoveryStorage()",
    "function resetTransientAppState()",
  );
  expect(verifiedLegacyClear).toContain("localStorage.removeItem(key)");
  expect(verifiedLegacyClear).toContain("localStorage.getItem(key)!==null");
  expect(verifiedLegacyClear).toContain("catch(_){return false;}");

  const webClear = sourceSection(
    webSource,
    "async function clearAllStoredData()",
    "async function resetMalformedLocalStorage()",
  );
  const nativeIndex = webClear.indexOf("clearOwnedNativeData()");
  const legacyIndex = webClear.indexOf("clearLegacyAndRecoveryStorage()");
  const durableIndex = webClear.indexOf("durableStore.clear(");
  expect(nativeIndex).toBeGreaterThanOrEqual(0);
  expect(nativeIndex).toBeLessThan(legacyIndex);
  expect(legacyIndex).toBeLessThan(durableIndex);
  expect(occurrences(webClear, "await reconcileNativeReminders()")).toBe(3);
  expect(webClear).toContain("state=C.canonicalState()");
});

test("ships only the reviewed WebView product without dormant billing code", () => {
  expect(nativeSource).toContain('case "publisher-ad-choice"');
  expect(nativeSource).toContain('case "clear-app-data"');
  expect(nativeSource).toContain("automaticallyAdjustContentInsets={false}");
  expect(nativeSource).not.toMatch(/expo-iap|react-native-iap|\.\/src\/billing/);
  expect(webSource).not.toMatch(/expo-iap|react-native-iap|anonymousReport/);

  const injectedBridge = sourceSection(
    nativeSource,
    "const NATIVE_BRIDGE_SCRIPT = String.raw`",
    "\n\nclass NativeBridgeError",
  )
    .replace("const NATIVE_BRIDGE_SCRIPT = String.raw`", "")
    .replace(/\n`;\s*$/, "");
  expect(() => new Function(injectedBridge)).not.toThrow();
});
