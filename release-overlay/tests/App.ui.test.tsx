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

test("keeps the free release ad-supported, non-personalized, and UMP-gated", () => {
  for (const obsolete of [
    "publisherAdsAllowed",
    "publisher-ad-choice",
    "onAdvertisingAllowed",
    "advertisingPermissionSetting",
    "savePublisherAdvertisingChoice",
    "confirmPublisherAdvertisingChoice",
    "AD_DISCLOSURE_VERSION",
    "ADS_REMOVED",
    "ads-removed",
  ]) {
    expect(nativeSource).not.toContain(obsolete);
    expect(webSource).not.toContain(obsolete);
  }

  expect(occurrences(nativeSource, "AdsConsent.gatherConsent()")).toBe(1);
  expect(occurrences(nativeSource, "mobileAds().initialize()")).toBe(1);
  expect(occurrences(nativeSource, "<BannerAd")).toBe(1);
  expect(occurrences(nativeSource, "requestNonPersonalizedAdsOnly: true")).toBe(1);

  const consentEffect = sourceSection(
    nativeSource,
    '  useEffect(() => {\n    if (!legalReady || consentState !== "unresolved") return;',
    '  useEffect(() => {\n    if (!adEligible)',
  );
  expect(consentEffect).toContain("AdsConsent.gatherConsent()");
  expect(consentEffect).toContain("startAdsIfAllowed(reportedCanRequestAds)");
  expect(consentEffect).not.toContain("publisher");

  const bannerGate = sourceSection(
    nativeSource,
    "  const showBanner =",
    "  const bannerMounted =",
  );
  expect(bannerGate).toContain("legalReady &&");
  expect(bannerGate).toContain('consentState === "permitted"');
  expect(bannerGate).not.toContain("publisher");

  const bannerStyle = sourceSection(
    nativeSource,
    "  bannerOverlay: {",
    "  bannerHidden: {",
  );
  expect(bannerStyle).toContain("left: 0");
  expect(bannerStyle).toContain("right: 0");
  expect(nativeSource).toContain("BannerAdSize.BANNER");
  expect(nativeSource).not.toMatch(/\b(?:InterstitialAd|RewardedAd|RewardedInterstitialAd|AppOpenAd|NativeAd)\b/);
  expect(nativeSource).not.toMatch(/AppTrackingTransparency|requestTrackingAuthorization|ATTrackingManager/);

  expect(nativeSource).toContain("AdsConsentPrivacyOptionsRequirementStatus.REQUIRED");
  expect(nativeSource).toContain(
    "if (legalReady && privacyChoicesRequired) void showPrivacyChoices();",
  );
  expect(webSource).toContain("window.GBTAdvertisingPrivacyOptions=Object.freeze");
  expect(webSource).toContain(
    "advertisingPrivacyChoicesRequired?legalRow('privacy-choices'",
  );

  expect(webSource).toContain("delete out.settings.advertisingConsent;");
  expect(webSource).toContain("delete s.entryDrafts.onboarding.advertisingAllowed;");
  expect(occurrences(webSource, "advertisingConsent")).toBe(1);
  expect(occurrences(webSource, "advertisingAllowed")).toBe(2);
  expect(webSource).toContain("tr('onboarding.advertisingNotice')");
  expect(webSource).toContain("tr('legal.adSupportedBody')");
  expect(webSource).toContain("drawerOpen||!adPlacementAllowed()");
  expect(webSource).toContain("Google AdMob may process your IP address/coarse location");
  expect(webSource).toContain("Google AdMob puede procesar tu dirección IP/ubicación aproximada");
  expect(webSource).not.toContain("You can decline and still use all core tracker features without ads");
  expect(webSource).not.toContain("Puedes rechazarlo y seguir usando todas las funciones principales sin anuncios");
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

test("moves the localized safety disclosure from the drawer into Help", () => {
  expect(webSource).not.toContain('id="drawerDisclaimer"');
  expect(webSource).not.toContain("el('drawerDisclaimer')");
  expect(webSource).not.toContain(".drawer-note{");

  const drawerSource = sourceSection(
    webSource,
    '<aside id="drawer" class="drawer">',
    "</aside>",
  );
  expect(drawerSource).not.toContain("app.disclaimer");

  const helpSource = sourceSection(
    webSource,
    "function renderHelp(){",
    "\n\nfunction initialOnboardingDraft",
  );
  expect(helpSource).toContain('id="helpDisclaimer"');
  expect(helpSource).toContain("tr('app.disclaimer')");
  expect(occurrences(helpSource, "tr('app.disclaimer')")).toBe(1);
  expect(webSource).toContain(
    ".main{padding-bottom:calc(var(--ad-nav-height) + var(--ad-visible-height) + var(--ad-visible-separator-height) + var(--ad-content-gap))!important}",
  );

  const localizedCopy: Array<[string, number]> = [
    ["Independent local-first tracker. No account, profile, or publisher-operated analytics or telemetry. Core tracker data is stored in the app on this device and is not uploaded to an operator-controlled server; exports and device backups are explained in the Privacy Policy. The free app displays a limited number of non-personalized banner ads. Google may process device and advertising data as explained in the Privacy Policy. The app never asks for an EBT/WIC PIN or connects to a government benefit account.", 2],
    ["Rastreador independiente y local. No requiere cuenta ni perfil y no contiene analítica o telemetría operada por el editor. Los datos principales del rastreador se almacenan en la aplicación en este dispositivo y no se cargan a un servidor controlado por el operador; las exportaciones y copias de seguridad se explican en la Política de Privacidad. La aplicación gratuita muestra una cantidad limitada de anuncios de banner no personalizados. Google puede procesar datos del dispositivo y de publicidad según se explica en la Política de Privacidad. La aplicación nunca solicita un PIN de EBT/WIC ni se conecta a una cuenta gubernamental de beneficios.", 2],
    ["Locally entered balances, benefits, grocery items, budgets, and History are not sent as ad parameters.", 2],
    ["No hay cuenta ni perfil. Los saldos, beneficios, artículos, presupuestos e Historial introducidos localmente no se envían como parámetros publicitarios.", 2],
    ["Independent app—not affiliated with or endorsed by USDA/FNS, Puerto Rico ADSEF, any SNAP/PAN or WIC agency, retailer, or card issuer. It does not provide official balances, eligibility decisions, retailer acceptance, or product authorization. Official sources control.", 3],
    ["Aplicación independiente: no está afiliada ni respaldada por USDA/FNS, ADSEF de Puerto Rico, una agencia de SNAP/PAN o WIC, un comercio ni un emisor de tarjeta. No ofrece saldos oficiales, decisiones de elegibilidad, aceptación de comercios ni autorización de productos. Prevalecen las fuentes oficiales.", 3],
  ];
  for (const [value, expectedOccurrences] of localizedCopy) {
    expect(occurrences(webSource, value)).toBe(expectedOccurrences);
  }
});

test("ships only the reviewed WebView product without dormant billing code", () => {
  expect(nativeSource).not.toContain('case "publisher-ad-choice"');
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
