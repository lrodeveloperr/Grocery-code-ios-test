import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Share,
  StyleSheet,
  View,
} from "react-native";
import mobileAds, {
  AdsConsent,
  BannerAd,
  BannerAdSize,
  MaxAdContentRating,
  TestIds,
} from "react-native-google-mobile-ads";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView as PackageWebView } from "react-native-webview";
import type {
  IOSWebViewProps,
  ShouldStartLoadRequest,
  WebViewMessageEvent,
  WebViewOpenWindowEvent,
} from "react-native-webview/lib/WebViewTypes";

import APP_HTML from "./src/appHtml";

const LOCAL_APP_ORIGIN = "https://snap-ebt-wic.local/";
const AD_SLOT_HEIGHT = 50;
const AD_SLOT_BOTTOM = 66;
const TEST_ADMOB_APP_ID = "ca-app-pub-3940256099942544~1458002511";
const TEST_BANNER_ID = "ca-app-pub-3940256099942544/2934735716";

type ConsentState = "unresolved" | "permitted" | "blocked";
type NativeAdState = "idle" | "loading" | "loaded" | "failed";
type AppLocale = "en-US" | "es-PR";

const NATIVE_COPY = Object.freeze({
  "en-US": {
    exportTitle: "Export unavailable",
    exportMessage:
      "The file could not be opened in the iPhone share sheet. Please try again.",
    advertisingTitle: "Advertising unavailable",
    advertisingMessage:
      "Advertising could not be initialized. Please try again later.",
    privacyTitle: "Advertising privacy choices",
    privacyMessage:
      "No additional advertising privacy form is required on this device right now.",
    linkTitle: "Link unavailable",
    linkMessage: "This secure web page could not be opened.",
  },
  "es-PR": {
    exportTitle: "Exportación no disponible",
    exportMessage:
      "No se pudo abrir el archivo en la hoja para compartir del iPhone. Inténtalo de nuevo.",
    advertisingTitle: "Publicidad no disponible",
    advertisingMessage:
      "No se pudo iniciar la publicidad. Inténtalo de nuevo más tarde.",
    privacyTitle: "Opciones de privacidad de anuncios",
    privacyMessage:
      "No se requiere ningún formulario adicional de privacidad de anuncios en este dispositivo en este momento.",
    linkTitle: "Enlace no disponible",
    linkMessage: "No se pudo abrir esta página web segura.",
  },
});

type WebViewHandle = {
  injectJavaScript: (script: string) => void;
  reload: () => void;
};

const NativeWebView = PackageWebView as unknown as React.ForwardRefExoticComponent<
  IOSWebViewProps & React.RefAttributes<WebViewHandle>
>;

type BridgeMessage =
  | { type: "bridge-ready"; locale?: string }
  | { type: "locale"; locale?: string }
  | { type: "ad-eligibility"; eligible: boolean }
  | {
      type: "ad-presentation";
      state: string;
      height: number;
      eligible: boolean;
    }
  | { type: "privacy-choices" }
  | { type: "share-text"; title?: string; text?: string; url?: string }
  | {
      type: "share-file";
      requestId?: string;
      name?: string;
      mimeType?: string;
      dataUrl?: string;
    };

const NATIVE_BRIDGE_SCRIPT = String.raw`
(function () {
  if (window.__GBT_NATIVE_BRIDGE_INSTALLED__) return;
  window.__GBT_NATIVE_BRIDGE_INSTALLED__ = true;
  const post = function (payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (_) {}
  };

  const bridgeError = function (code, message) {
    const error = new Error(String(message || "File export failed"));
    error.code = String(code || "SHARE_FAILED");
    return error;
  };

  const pendingFileShares = Object.create(null);
  let fileShareInFlight = false;
  window.GBTNativeShareCompleted = function (requestId, ok, message, code) {
    const pending = pendingFileShares[String(requestId || "")];
    if (!pending) return;
    delete pendingFileShares[String(requestId || "")];
    window.clearTimeout(pending.timeout);
    fileShareInFlight = false;
    if (ok) pending.resolve();
    else pending.reject(bridgeError(code || "SHARE_FAILED", message));
  };
  window.GBTNativeShareFile = function (blob, name, mimeType) {
    if (!(blob instanceof Blob)) {
      return Promise.reject(bridgeError("SHARE_FAILED", "Invalid export file"));
    }
    if (fileShareInFlight) {
      return Promise.reject(bridgeError("EXPORT_BUSY", "Another export is already open"));
    }
    if (blob.size <= 0 || blob.size > 20 * 1024 * 1024) {
      return Promise.reject(bridgeError("FILE_TOO_LARGE", "Export file size is not supported"));
    }
    fileShareInFlight = true;
    const requestId = "share-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    return new Promise(function (resolve, reject) {
      const timeout = window.setTimeout(function () {
        delete pendingFileShares[requestId];
        fileShareInFlight = false;
        reject(bridgeError("SHARE_FAILED", "The iPhone share sheet did not respond"));
      }, 120000);
      pendingFileShares[requestId] = { resolve: resolve, reject: reject, timeout: timeout };
      try {
        const reader = new FileReader();
        reader.onload = function () {
          const dataUrl = String(reader.result || "");
          if (!dataUrl || dataUrl.length > 28 * 1024 * 1024) {
            window.GBTNativeShareCompleted(
              requestId,
              false,
              "Export file size is not supported",
              "FILE_TOO_LARGE"
            );
            return;
          }
          post({
            type: "share-file",
            requestId: requestId,
            name: String(name || "export"),
            mimeType: String(mimeType || blob.type || "application/octet-stream"),
            dataUrl: dataUrl
          });
        };
        reader.onerror = function () {
          window.GBTNativeShareCompleted(
            requestId,
            false,
            "Export file could not be read",
            "SHARE_FAILED"
          );
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        window.GBTNativeShareCompleted(
          requestId,
          false,
          error instanceof Error ? error.message : "Export file could not be read",
          "SHARE_FAILED"
        );
      }
    });
  };

  const nativeShare = async function (payload) {
    const files = payload && payload.files ? Array.from(payload.files) : [];
    if (files.length) {
      const file = files[0];
      return window.GBTNativeShareFile(
        file,
        file.name || "export",
        file.type || "application/octet-stream"
      );
    }
    post({
      type: "share-text",
      title: payload && payload.title ? String(payload.title) : "",
      text: payload && payload.text ? String(payload.text) : "",
      url: payload && payload.url ? String(payload.url) : ""
    });
  };

  try {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: function (payload) {
        return Boolean(payload && payload.files && payload.files.length);
      }
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: nativeShare
    });
  } catch (_) {}

  try {
    window.webkit = window.webkit || {};
    window.webkit.messageHandlers = window.webkit.messageHandlers || {};
    window.webkit.messageHandlers.openPrivacyChoices = {
      postMessage: function () { post({ type: "privacy-choices" }); }
    };
  } catch (_) {}

  let lastEligibility = null;
  let lastPresentation = "";
  const publishAdPresentation = function () {
    const runtime = window.GBTAdRuntime;
    if (!runtime || typeof runtime.getLayoutMetrics !== "function") return;
    const metrics = runtime.getLayoutMetrics();
    const eligible = Boolean(metrics.canRequestRealAd);
    if (eligible !== lastEligibility) {
      lastEligibility = eligible;
      post({ type: "ad-eligibility", eligible: eligible });
    }
    const presentation = String(metrics.state) + "|" + String(metrics.runtimeHeight) + "|" + String(eligible);
    if (presentation !== lastPresentation) {
      lastPresentation = presentation;
      post({
        type: "ad-presentation",
        state: String(metrics.state || ""),
        height: Number(metrics.runtimeHeight) || 0,
        eligible: eligible
      });
    }
  };
  window.addEventListener("gbt-ad-presentation-change", publishAdPresentation);
  window.setInterval(publishAdPresentation, 250);
  publishAdPresentation();

  const currentLocale = function () {
    return document.documentElement.lang === "es-PR" ? "es-PR" : "en-US";
  };
  window.addEventListener("gbt-locale-change", function () {
    post({ type: "locale", locale: currentLocale() });
  });
  post({ type: "bridge-ready", locale: currentLocale() });
})();
true;
`;

function sanitizedFileName(value: unknown) {
  const name = String(value || "export")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return name || "export";
}

function parseDataUrl(dataUrl: string) {
  if (dataUrl.length > 28 * 1024 * 1024) {
    throw new Error("Export file size is not supported");
  }
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Invalid file payload");
  const header = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  if (!/;base64$/i.test(header) || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    throw new Error("Invalid base64 file payload");
  }
  return payload;
}

function fileUti(name: string, mimeType?: string) {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "pdf" || mimeType === "application/pdf") {
    return "com.adobe.pdf";
  }
  if (extension === "csv" || mimeType?.startsWith("text/csv")) {
    return "public.comma-separated-values-text";
  }
  if (
    extension === "xlsx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "org.openxmlformats.spreadsheetml.sheet";
  }
  if (extension === "json" || mimeType?.startsWith("application/json")) {
    return "public.json";
  }
  if (extension === "txt" || mimeType?.startsWith("text/plain")) {
    return "public.plain-text";
  }
  return "public.data";
}

export default function App() {
  const webViewRef = useRef<WebViewHandle>(null);
  const adsInitializationRef = useRef<Promise<void> | null>(null);
  const previousWebAdStateRef = useRef("AD_LOADING");
  const [webReady, setWebReady] = useState(false);
  const [appLocale, setAppLocale] = useState<AppLocale>("en-US");
  const [consentState, setConsentState] =
    useState<ConsentState>("unresolved");
  const [adEligible, setAdEligible] = useState(false);
  const [nativeAdState, setNativeAdState] =
    useState<NativeAdState>("idle");
  const [webAdState, setWebAdState] = useState("AD_LOADING");
  const [adLoadAttempt, setAdLoadAttempt] = useState(0);
  const [bannerInstance, setBannerInstance] = useState(0);
  const nativeCopy = NATIVE_COPY[appLocale];

  const productionBannerId = (Platform.OS === "android"
    ? process.env.EXPO_PUBLIC_ANDROID_ADMOB_BANNER_ID
    : process.env.EXPO_PUBLIC_IOS_ADMOB_BANNER_ID
  )?.trim() || "";
  const productionAds =
    process.env.EXPO_PUBLIC_AD_PROFILE === "production";
  const bannerUnitId = productionAds ? productionBannerId : TestIds.BANNER;

  useEffect(() => {
    const staleShareDirectory = new Directory(Paths.cache, "gbt-share");
    try {
      if (staleShareDirectory.exists) staleShareDirectory.delete();
    } catch (error) {
      console.warn("Stale export cleanup failed", error);
    }
  }, []);

  const ensureAdsInitialized = useCallback(async () => {
    if (!adsInitializationRef.current) {
      adsInitializationRef.current = (async () => {
        await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.PG,
        });
        await mobileAds().initialize();
      })().catch((error) => {
        adsInitializationRef.current = null;
        throw error;
      });
    }
    await adsInitializationRef.current;
  }, []);

  const startAdsIfAllowed = useCallback(
    async (reportedCanRequestAds = false) => {
      let canRequestAds = reportedCanRequestAds;
      try {
        const currentInfo = await AdsConsent.getConsentInfo();
        canRequestAds = currentInfo.canRequestAds;
      } catch {}
      if (!canRequestAds) return false;
      await ensureAdsInitialized();
      return true;
    },
    [ensureAdsInitialized],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      let reportedCanRequestAds = false;
      try {
        const consent = await AdsConsent.gatherConsent();
        reportedCanRequestAds = consent.canRequestAds;
      } catch {}
      if (!active) return;
      try {
        const started = await startAdsIfAllowed(reportedCanRequestAds);
        if (active) setConsentState(started ? "permitted" : "blocked");
      } catch {
        if (active) {
          setConsentState("blocked");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [startAdsIfAllowed]);

  useEffect(() => {
    if (!adEligible) {
      setNativeAdState("idle");
      setAdLoadAttempt(0);
      return;
    }
    setNativeAdState("loading");
  }, [adEligible]);

  useEffect(() => {
    if (
      nativeAdState !== "failed" ||
      !adEligible ||
      consentState !== "permitted" ||
      adLoadAttempt >= 2
    ) {
      return;
    }
    const retryTimer = setTimeout(
      () => {
        setAdLoadAttempt((attempt) => attempt + 1);
        setBannerInstance((instance) => instance + 1);
        setNativeAdState("loading");
      },
      2000 * 2 ** adLoadAttempt,
    );
    return () => clearTimeout(retryTimer);
  }, [adEligible, adLoadAttempt, consentState, nativeAdState]);

  useEffect(() => {
    const previous = previousWebAdStateRef.current;
    previousWebAdStateRef.current = webAdState;
    if (
      previous === "AD_TEMPORARILY_HIDDEN" &&
      webAdState !== "AD_TEMPORARILY_HIDDEN" &&
      adEligible &&
      consentState === "permitted"
    ) {
      setAdLoadAttempt(0);
      setBannerInstance((instance) => instance + 1);
      setNativeAdState("loading");
    }
  }, [adEligible, consentState, webAdState]);

  const syncAdRuntime = useCallback(() => {
    if (!webReady) return;
    const consent =
      consentState === "permitted"
        ? "REQUEST_PERMITTED"
        : consentState === "blocked"
          ? "REQUEST_BLOCKED"
          : "UNRESOLVED";
    const state =
      consentState === "blocked" || !adEligible
        ? "AD_DISABLED"
        : nativeAdState === "loaded"
          ? "AD_LOADED"
          : nativeAdState === "failed"
            ? "AD_UNAVAILABLE"
            : "AD_LOADING";
    const height = nativeAdState === "loaded" ? AD_SLOT_HEIGHT : 0;
    webViewRef.current?.injectJavaScript(`
      (function () {
        const runtime = window.GBTAdRuntime;
        if (!runtime) return;
        runtime.setMode("REAL");
        runtime.setConsentStatus(${JSON.stringify(consent)});
        runtime.setRuntimeBannerHeight(${height});
        runtime.setState(${JSON.stringify(state)});
      })();
      true;
    `);
  }, [
    adEligible,
    consentState,
    nativeAdState,
    webReady,
  ]);

  useEffect(() => {
    syncAdRuntime();
  }, [syncAdRuntime]);

  const completeNativeFileShare = useCallback(
    (requestId: string | undefined, ok: boolean, message = "") => {
      if (!requestId) return;
      webViewRef.current?.injectJavaScript(`
        window.GBTNativeShareCompleted?.(
          ${JSON.stringify(requestId)},
          ${ok ? "true" : "false"},
          ${JSON.stringify(message)}
        );
        true;
      `);
    },
    [],
  );

  const shareFile = useCallback(async (message: BridgeMessage) => {
    if (message.type !== "share-file") return;
    if (!message.dataUrl) {
      completeNativeFileShare(message.requestId, false, "Export file is missing");
      return;
    }
    const name = sanitizedFileName(message.name);
    const shareDirectory = new Directory(
      Paths.cache,
      "gbt-share",
      sanitizedFileName(
        `${message.requestId || "share"}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ),
    );
    const file = new File(shareDirectory, name);
    try {
      const base64 = parseDataUrl(message.dataUrl);
      shareDirectory.create({ idempotent: true, intermediates: true });
      file.create({ overwrite: true, intermediates: true });
      file.write(base64, { encoding: "base64" });
      if (!file.exists || !file.size) {
        throw new Error("Export file is empty");
      }
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("System sharing is unavailable");
      }
      await Sharing.shareAsync(file.uri, {
        dialogTitle: name,
        mimeType: message.mimeType || "application/octet-stream",
        UTI: fileUti(name, message.mimeType),
      });
      completeNativeFileShare(message.requestId, true);
    } catch (error) {
      console.error("Native file export failed", error);
      completeNativeFileShare(
        message.requestId,
        false,
        error instanceof Error ? error.message : "Export failed",
      );
    } finally {
      setTimeout(() => {
        try {
          shareDirectory.delete();
        } catch {}
      }, 15000);
    }
  }, [completeNativeFileShare]);

  const shareText = useCallback(async (message: BridgeMessage) => {
    if (message.type !== "share-text") return;
    const remoteUrl =
      typeof message.url === "string" &&
      /^https:\/\//i.test(message.url) &&
      !message.url.startsWith(LOCAL_APP_ORIGIN)
        ? message.url
        : undefined;
    const text = [message.text, remoteUrl].filter(Boolean).join("\n");
    if (!text) return;
    try {
      await Share.share({
        title: message.title || undefined,
        message: text,
        url: remoteUrl,
      });
    } catch {}
  }, []);

  const showPrivacyChoices = useCallback(async () => {
    try {
      await AdsConsent.showPrivacyOptionsForm();
      const info = await AdsConsent.getConsentInfo();
      if (!info.canRequestAds) {
        setConsentState("blocked");
        return;
      }
      try {
        const started = await startAdsIfAllowed(info.canRequestAds);
        setConsentState(started ? "permitted" : "blocked");
      } catch {
        setConsentState("blocked");
        Alert.alert(
          nativeCopy.advertisingTitle,
          nativeCopy.advertisingMessage,
        );
      }
    } catch {
      Alert.alert(
        nativeCopy.privacyTitle,
        nativeCopy.privacyMessage,
      );
    }
  }, [nativeCopy, startAdsIfAllowed]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data) as unknown;
      } catch {
        return;
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { type?: unknown }).type !== "string"
      ) {
        return;
      }
      const message = parsed as BridgeMessage;
      switch (message.type) {
        case "bridge-ready":
          setAppLocale(message.locale === "es-PR" ? "es-PR" : "en-US");
          setWebReady(true);
          break;
        case "locale":
          setAppLocale(message.locale === "es-PR" ? "es-PR" : "en-US");
          break;
        case "ad-eligibility":
          setAdEligible(Boolean(message.eligible));
          break;
        case "ad-presentation":
          setWebAdState(message.state);
          break;
        case "privacy-choices":
          void showPrivacyChoices();
          break;
        case "share-file":
          void shareFile(message);
          break;
        case "share-text":
          void shareText(message);
          break;
      }
    },
    [shareFile, shareText, showPrivacyChoices],
  );

  const openExternalUrl = useCallback((url: string) => {
    if (!/^https:\/\//i.test(url)) return;
    void Linking.openURL(url).catch(() => {
      Alert.alert(nativeCopy.linkTitle, nativeCopy.linkMessage);
    });
  }, [nativeCopy]);

  const shouldStartNavigation = useCallback(
    (request: ShouldStartLoadRequest) => {
      const url = request.url || "";
      if (
        url === "about:blank" ||
        url.startsWith(LOCAL_APP_ORIGIN)
      ) {
        return true;
      }
      if (/^https:\/\//i.test(url)) openExternalUrl(url);
      return false;
    },
    [openExternalUrl],
  );

  const source = useMemo(
    () => ({ html: APP_HTML, baseUrl: LOCAL_APP_ORIGIN }),
    [],
  );
  const showBanner =
    consentState === "permitted" &&
    adEligible &&
    nativeAdState !== "failed";
  const bannerMounted =
    showBanner && webAdState !== "AD_TEMPORARILY_HIDDEN";
  const bannerVisible =
    bannerMounted &&
    nativeAdState === "loaded" &&
    webAdState === "AD_LOADED";

  return (
    <SafeAreaProvider style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <NativeWebView
          ref={webViewRef}
          source={source}
          originWhitelist={["https://*", "about:*"]}
          injectedJavaScript={NATIVE_BRIDGE_SCRIPT}
          javaScriptEnabled
          cacheEnabled
          incognito={false}
          sharedCookiesEnabled={false}
          allowsLinkPreview={false}
          pullToRefreshEnabled={false}
          mediaPlaybackRequiresUserAction
          onMessage={onMessage}
          onLoadEnd={() => setWebReady(true)}
          onShouldStartLoadWithRequest={shouldStartNavigation}
          onOpenWindow={(event: WebViewOpenWindowEvent) =>
            openExternalUrl(event.nativeEvent.targetUrl || "")
          }
          onContentProcessDidTerminate={() => webViewRef.current?.reload()}
          style={styles.webView}
        />
        {bannerMounted ? (
          <View
            pointerEvents={bannerVisible ? "auto" : "none"}
            style={[
              styles.bannerOverlay,
              !bannerVisible && styles.bannerHidden,
            ]}
          >
            <BannerAd
              key={`banner-${bannerInstance}`}
              unitId={bannerUnitId}
              size={BannerAdSize.BANNER}
              requestOptions={{ requestNonPersonalizedAdsOnly: true }}
              onAdLoaded={() => {
                setAdLoadAttempt(0);
                setNativeAdState("loaded");
              }}
              onAdFailedToLoad={() => setNativeAdState("failed")}
            />
          </View>
        ) : null}
        {!productionAds ? (
          <View accessibilityElementsHidden style={styles.testMarker} />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#e0eefd",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#e0eefd",
  },
  webView: {
    flex: 1,
    backgroundColor: "#e0eefd",
  },
  bannerOverlay: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: AD_SLOT_BOTTOM,
    height: AD_SLOT_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  bannerHidden: {
    opacity: 0,
  },
  testMarker: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export const RELEASE_TEST_IDENTIFIERS = Object.freeze({
  appId: TEST_ADMOB_APP_ID,
  bannerId: TEST_BANNER_ID,
});
