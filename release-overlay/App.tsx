import { Buffer } from "buffer";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Share,
  StyleSheet,
  View,
  Vibration,
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

type WebViewHandle = {
  injectJavaScript: (script: string) => void;
  reload: () => void;
};

const NativeWebView = PackageWebView as unknown as React.ForwardRefExoticComponent<
  IOSWebViewProps & React.RefAttributes<WebViewHandle>
>;

type BridgeMessage =
  | { type: "bridge-ready" }
  | { type: "ad-eligibility"; eligible: boolean }
  | {
      type: "ad-presentation";
      state: string;
      height: number;
      eligible: boolean;
    }
  | { type: "privacy-choices" }
  | { type: "haptic"; milliseconds?: number }
  | { type: "share-text"; title?: string; text?: string; url?: string }
  | {
      type: "share-file";
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

  const nativeShare = async function (payload) {
    const files = payload && payload.files ? Array.from(payload.files) : [];
    if (files.length) {
      const file = files[0];
      const dataUrl = await new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(reader.error || new Error("File read failed")); };
        reader.readAsDataURL(file);
      });
      post({
        type: "share-file",
        name: file.name || "export",
        mimeType: file.type || "application/octet-stream",
        dataUrl: dataUrl
      });
      return;
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
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: function (milliseconds) {
        post({ type: "haptic", milliseconds: Number(milliseconds) || 5 });
        return true;
      }
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
  window.setInterval(function () {
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
  }, 250);

  post({ type: "bridge-ready" });
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
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Invalid file payload");
  return dataUrl.slice(separator + 1);
}

export default function App() {
  const webViewRef = useRef<WebViewHandle>(null);
  const [webReady, setWebReady] = useState(false);
  const [consentState, setConsentState] =
    useState<ConsentState>("unresolved");
  const [adEligible, setAdEligible] = useState(false);
  const [nativeAdState, setNativeAdState] =
    useState<NativeAdState>("idle");
  const [webAdState, setWebAdState] = useState("AD_LOADING");

  const productionBannerId =
    process.env.EXPO_PUBLIC_IOS_ADMOB_BANNER_ID?.trim() || "";
  const productionAds =
    process.env.EXPO_PUBLIC_AD_PROFILE === "production";
  const bannerUnitId = productionAds ? productionBannerId : TestIds.BANNER;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const consent = await AdsConsent.gatherConsent();
        if (!active) return;
        if (!consent.canRequestAds) {
          setConsentState("blocked");
          return;
        }
        await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.PG,
        });
        await mobileAds().initialize();
        if (active) setConsentState("permitted");
      } catch {
        if (active) setConsentState("blocked");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!adEligible) {
      setNativeAdState("idle");
      return;
    }
    setNativeAdState("loading");
  }, [adEligible]);

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

  const shareFile = useCallback(async (message: BridgeMessage) => {
    if (message.type !== "share-file" || !message.dataUrl) return;
    const file = new File(Paths.cache, sanitizedFileName(message.name));
    try {
      const base64 = parseDataUrl(message.dataUrl);
      file.create({ overwrite: true, intermediates: true });
      file.write(Buffer.from(base64, "base64"));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("System sharing is unavailable");
      }
      await Sharing.shareAsync(file.uri, {
        dialogTitle: sanitizedFileName(message.name),
        mimeType: message.mimeType || "application/octet-stream",
        UTI: message.mimeType || "public.data",
      });
    } catch {
      Alert.alert(
        "Export unavailable",
        "The file could not be opened in the iPhone share sheet. Please try again.",
      );
    } finally {
      try {
        file.delete();
      } catch {}
    }
  }, []);

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
      setConsentState(info.canRequestAds ? "permitted" : "blocked");
    } catch {
      Alert.alert(
        "Advertising privacy choices",
        "No additional advertising privacy form is required on this device right now.",
      );
    }
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: BridgeMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      } catch {
        return;
      }
      switch (message.type) {
        case "bridge-ready":
          setWebReady(true);
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
        case "haptic":
          Vibration.vibrate(Math.min(25, Math.max(1, message.milliseconds || 5)));
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
      Alert.alert("Link unavailable", "This secure web page could not be opened.");
    });
  }, []);

  const shouldStartNavigation = useCallback(
    (request: ShouldStartLoadRequest) => {
      const url = request.url || "";
      if (
        url === "about:blank" ||
        url.startsWith(LOCAL_APP_ORIGIN) ||
        url.startsWith("blob:") ||
        url.startsWith("data:")
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
  const bannerVisible = showBanner && webAdState === "AD_LOADED";

  return (
    <SafeAreaProvider style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <NativeWebView
          ref={webViewRef}
          source={source}
          originWhitelist={["https://*", "about:*", "blob:*", "data:*"]}
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
        {showBanner ? (
          <View
            pointerEvents={bannerVisible ? "auto" : "none"}
            style={[
              styles.bannerOverlay,
              !bannerVisible && styles.bannerHidden,
            ]}
          >
            <BannerAd
              unitId={bannerUnitId}
              size={BannerAdSize.BANNER}
              requestOptions={{ requestNonPersonalizedAdsOnly: true }}
              onAdLoaded={() => setNativeAdState("loaded")}
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
    backgroundColor: "#eef6ff",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#eef6ff",
  },
  webView: {
    flex: 1,
    backgroundColor: "#eef6ff",
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
