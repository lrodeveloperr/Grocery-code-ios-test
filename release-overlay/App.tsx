import { Directory, File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
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
const MAX_SHARE_BYTES = 20 * 1024 * 1024;
const MAX_SHARE_DATA_URL_CHARS = 28 * 1024 * 1024;
const NOTIFICATION_OWNER = "snap-ebt-grocery-tracker:local-reminder:v1";
const NOTIFICATION_IDENTIFIER_PREFIX = "gbt-local-reminder-v1:";
const MAX_OWNED_REMINDERS = 48;

type ConsentState = "unresolved" | "permitted" | "blocked";
type NativeAdState = "idle" | "loading" | "loaded" | "failed";
type ReminderKind = "snap-balance" | "wic-review" | "wic-expiry";
type ReminderLocale = "en-US" | "es-PR";

type NativeReminderSpec = {
  id: string;
  kind: ReminderKind;
  fireAt: string;
  locale: ReminderLocale;
};

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
  | { type: "share-text"; title?: string; text?: string; url?: string }
  | {
      type: "share-file";
      requestId?: string;
      name?: string;
      mimeType?: string;
      dataUrl?: string;
    }
  | {
      type: "notifications-reconcile";
      requestId?: string;
      optedIn?: boolean;
      requestPermission?: boolean;
      reminders?: unknown;
    };

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isOwned =
      notification.request.content.data?.owner === NOTIFICATION_OWNER;
    return {
      shouldShowBanner: isOwned,
      shouldShowList: isOwned,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

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
    const error = new Error(String(message || code || "Native operation failed"));
    error.code = String(code || "NATIVE_OPERATION_FAILED");
    return error;
  };

  const pendingFileShares = Object.create(null);
  let fileShareInFlight = false;
  window.GBTNativeShareCompleted = function (requestId, ok, code, message) {
    const pending = pendingFileShares[String(requestId || "")];
    if (!pending) return;
    delete pendingFileShares[String(requestId || "")];
    window.clearTimeout(pending.timeout);
    fileShareInFlight = false;
    if (ok) pending.resolve();
    else pending.reject(bridgeError(code || "SHARE_FAILED", message || "File export failed"));
  };
  window.GBTNativeShareFile = function (blob, name, mimeType) {
    if (!(blob instanceof Blob)) {
      return Promise.reject(bridgeError("SHARE_INVALID_BLOB", "Invalid export file"));
    }
    if (fileShareInFlight) {
      return Promise.reject(bridgeError("SHARE_BUSY", "Another export is already open"));
    }
    if (blob.size <= 0 || blob.size > 20 * 1024 * 1024) {
      return Promise.reject(bridgeError("SHARE_SIZE_UNSUPPORTED", "Export file size is not supported"));
    }
    fileShareInFlight = true;
    const requestId = "share-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    return new Promise(function (resolve, reject) {
      const timeout = window.setTimeout(function () {
        delete pendingFileShares[requestId];
        fileShareInFlight = false;
        reject(bridgeError("SHARE_TIMEOUT", "The iPhone share sheet did not respond"));
      }, 120000);
      pendingFileShares[requestId] = { resolve: resolve, reject: reject, timeout: timeout };
      const reader = new FileReader();
      reader.onload = function () {
        const dataUrl = String(reader.result || "");
        if (!dataUrl || dataUrl.length > 28 * 1024 * 1024) {
          window.GBTNativeShareCompleted(
            requestId,
            false,
            "SHARE_SIZE_UNSUPPORTED",
            "Export file size is not supported"
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
          "SHARE_READ_FAILED",
          "Export file could not be read"
        );
      };
      try {
        reader.readAsDataURL(blob);
      } catch (_) {
        window.GBTNativeShareCompleted(
          requestId,
          false,
          "SHARE_READ_FAILED",
          "Export file could not be read"
        );
      }
    });
  };

  const pendingNotificationReconciles = Object.create(null);
  let notificationReconcileInFlight = false;
  window.GBTNativeNotificationReconciled = function (
    requestId,
    ok,
    code,
    scheduledCount,
    message
  ) {
    const pending = pendingNotificationReconciles[String(requestId || "")];
    if (!pending) return;
    delete pendingNotificationReconciles[String(requestId || "")];
    window.clearTimeout(pending.timeout);
    notificationReconcileInFlight = false;
    if (ok) {
      pending.resolve({
        code: String(code || "NOTIFICATIONS_RECONCILED"),
        scheduledCount: Number(scheduledCount) || 0
      });
    } else {
      pending.reject(
        bridgeError(
          code || "NOTIFICATIONS_FAILED",
          message || "Reminders could not be scheduled"
        )
      );
    }
  };
  window.GBTNativeReconcileNotifications = function (options) {
    if (
      !options ||
      typeof options !== "object" ||
      typeof options.optedIn !== "boolean" ||
      !Array.isArray(options.reminders)
    ) {
      return Promise.reject(
        bridgeError("NOTIFICATIONS_INVALID_REQUEST", "Invalid reminder request")
      );
    }
    if (notificationReconcileInFlight) {
      return Promise.reject(
        bridgeError("NOTIFICATIONS_BUSY", "Reminder settings are already being saved")
      );
    }
    notificationReconcileInFlight = true;
    const requestId = "notifications-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    return new Promise(function (resolve, reject) {
      const timeout = window.setTimeout(function () {
        delete pendingNotificationReconciles[requestId];
        notificationReconcileInFlight = false;
        reject(
          bridgeError("NOTIFICATIONS_TIMEOUT", "The iPhone reminder service did not respond")
        );
      }, 30000);
      pendingNotificationReconciles[requestId] = {
        resolve: resolve,
        reject: reject,
        timeout: timeout
      };
      post({
        type: "notifications-reconcile",
        requestId: requestId,
        optedIn: options.optedIn === true,
        requestPermission: options.requestPermission === true,
        reminders: options.reminders
      });
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

  post({ type: "bridge-ready" });
})();
true;
`;

class NativeBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NativeBridgeError";
    this.code = code;
  }
}

function sanitizedFileName(value: unknown) {
  const name = String(value || "export")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return name || "export";
}

function parseDataUrl(dataUrl: string) {
  if (!dataUrl || dataUrl.length > MAX_SHARE_DATA_URL_CHARS) {
    throw new NativeBridgeError(
      "SHARE_SIZE_UNSUPPORTED",
      "Export file size is not supported",
    );
  }
  const separator = dataUrl.indexOf(",");
  if (separator < 0) {
    throw new NativeBridgeError(
      "SHARE_INVALID_DATA_URL",
      "Invalid file payload",
    );
  }
  const header = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  if (
    !/^data:[^,]*;base64$/i.test(header) ||
    payload.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)
  ) {
    throw new NativeBridgeError(
      "SHARE_INVALID_BASE64",
      "Invalid base64 file payload",
    );
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const byteLength = (payload.length / 4) * 3 - padding;
  if (byteLength <= 0 || byteLength > MAX_SHARE_BYTES) {
    throw new NativeBridgeError(
      "SHARE_SIZE_UNSUPPORTED",
      "Export file size is not supported",
    );
  }
  return { payload, byteLength };
}

function nativeBridgeFailure(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
) {
  return error instanceof NativeBridgeError
    ? error
    : new NativeBridgeError(fallbackCode, fallbackMessage);
}

function notificationIdentifier(id: string) {
  return `${NOTIFICATION_IDENTIFIER_PREFIX}${id}`;
}

function normalizeReminderSpecs(value: unknown): NativeReminderSpec[] {
  if (!Array.isArray(value)) {
    throw new NativeBridgeError(
      "NOTIFICATIONS_INVALID_REQUEST",
      "Reminder list is invalid",
    );
  }
  if (value.length > MAX_OWNED_REMINDERS) {
    throw new NativeBridgeError(
      "NOTIFICATIONS_TOO_MANY",
      `No more than ${MAX_OWNED_REMINDERS} local reminders can be scheduled`,
    );
  }

  const now = Date.now();
  const latest = now + 370 * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new NativeBridgeError(
        "NOTIFICATIONS_INVALID_REMINDER",
        `Reminder ${index + 1} is invalid`,
      );
    }
    const record = candidate as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const kind = record.kind;
    const fireAt =
      typeof record.fireAt === "string" ? record.fireAt.trim() : "";
    const locale = record.locale;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id) || seen.has(id)) {
      throw new NativeBridgeError(
        "NOTIFICATIONS_INVALID_REMINDER_ID",
        `Reminder ${index + 1} has an invalid or duplicate identifier`,
      );
    }
    if (
      kind !== "snap-balance" &&
      kind !== "wic-review" &&
      kind !== "wic-expiry"
    ) {
      throw new NativeBridgeError(
        "NOTIFICATIONS_INVALID_KIND",
        `Reminder ${index + 1} has an unsupported type`,
      );
    }
    if (locale !== "en-US" && locale !== "es-PR") {
      throw new NativeBridgeError(
        "NOTIFICATIONS_INVALID_LOCALE",
        `Reminder ${index + 1} has an unsupported locale`,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(fireAt)) {
      throw new NativeBridgeError(
        "NOTIFICATIONS_INVALID_DATE",
        `Reminder ${index + 1} must include a time zone`,
      );
    }
    const fireAtMs = Date.parse(fireAt);
    if (!Number.isFinite(fireAtMs) || fireAtMs <= now + 30_000 || fireAtMs > latest) {
      throw new NativeBridgeError(
        "NOTIFICATIONS_INVALID_DATE",
        `Reminder ${index + 1} is outside the supported scheduling window`,
      );
    }
    seen.add(id);
    return { id, kind, fireAt: new Date(fireAtMs).toISOString(), locale };
  });
}

function notificationCopy(kind: ReminderKind, locale: ReminderLocale) {
  if (locale === "es-PR") {
    if (kind === "snap-balance") {
      return {
        title: "Recordatorio de SNAP",
        body: "Abre la aplicación para revisar tu saldo guardado en este dispositivo.",
      };
    }
    return kind === "wic-review"
      ? {
          title: "Recordatorio de WIC",
          body: "Abre la aplicación para revisar tus beneficios mensuales de WIC.",
        }
      : {
          title: "Beneficios de WIC por vencer",
          body: "Abre la aplicación para revisar los beneficios que vencen pronto.",
        };
  }
  if (kind === "snap-balance") {
    return {
      title: "SNAP reminder",
      body: "Open the app to review the balance stored on this device.",
    };
  }
  return kind === "wic-review"
    ? {
        title: "WIC reminder",
        body: "Open the app to review your monthly WIC benefits.",
      }
    : {
        title: "WIC benefits expiring soon",
        body: "Open the app to review benefits that are nearing expiration.",
      };
}

function isOwnedNotification(request: Notifications.NotificationRequest) {
  return request.content.data?.owner === NOTIFICATION_OWNER;
}

function notificationsAllowed(
  permission: Notifications.NotificationPermissionsStatus,
) {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
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
  const [consentState, setConsentState] =
    useState<ConsentState>("unresolved");
  const [adEligible, setAdEligible] = useState(false);
  const [nativeAdState, setNativeAdState] =
    useState<NativeAdState>("idle");
  const [webAdState, setWebAdState] = useState("AD_LOADING");
  const [adLoadAttempt, setAdLoadAttempt] = useState(0);
  const [bannerInstance, setBannerInstance] = useState(0);

  const productionBannerId =
    process.env.EXPO_PUBLIC_IOS_ADMOB_BANNER_ID?.trim() || "";
  const productionAds =
    process.env.EXPO_PUBLIC_AD_PROFILE === "production";
  const bannerUnitId = productionAds ? productionBannerId : TestIds.BANNER;

  useEffect(() => {
    void Promise.allSettled([
      Notifications.setAutoServerRegistrationEnabledAsync(false),
      Notifications.unregisterForNotificationsAsync(),
    ]);
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
    (
      requestId: string | undefined,
      ok: boolean,
      code: string,
      message = "",
    ) => {
      if (!requestId) return;
      webViewRef.current?.injectJavaScript(`
        window.GBTNativeShareCompleted?.(
          ${JSON.stringify(requestId)},
          ${ok ? "true" : "false"},
          ${JSON.stringify(code)},
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
      completeNativeFileShare(
        message.requestId,
        false,
        "SHARE_MISSING_PAYLOAD",
        "Export file is missing",
      );
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
      const { payload: base64, byteLength } = parseDataUrl(message.dataUrl);
      shareDirectory.create({ idempotent: true, intermediates: true });
      file.create({ overwrite: true, intermediates: true });
      file.write(base64, { encoding: "base64" });
      if (!file.exists || Number(file.size) !== byteLength) {
        throw new NativeBridgeError(
          "SHARE_WRITE_FAILED",
          "Export file could not be prepared",
        );
      }
      if (!(await Sharing.isAvailableAsync())) {
        throw new NativeBridgeError(
          "SHARE_UNAVAILABLE",
          "System sharing is unavailable",
        );
      }
      await Sharing.shareAsync(file.uri, {
        dialogTitle: name,
        mimeType: message.mimeType || "application/octet-stream",
        UTI: fileUti(name, message.mimeType),
      });
      completeNativeFileShare(message.requestId, true, "SHARE_COMPLETED");
    } catch (error) {
      console.error("Native file export failed", error);
      const failure = nativeBridgeFailure(
        error,
        "SHARE_FAILED",
        "Export failed",
      );
      completeNativeFileShare(
        message.requestId,
        false,
        failure.code,
        failure.message,
      );
      Alert.alert(
        "Export unavailable",
        "The file could not be opened in the iPhone share sheet. Please try again.",
      );
    } finally {
      setTimeout(() => {
        try {
          shareDirectory.delete();
        } catch {}
      }, 15000);
    }
  }, [completeNativeFileShare]);

  const completeNativeNotificationReconcile = useCallback(
    (
      requestId: string | undefined,
      ok: boolean,
      code: string,
      scheduledCount: number,
      message = "",
    ) => {
      if (!requestId) return;
      webViewRef.current?.injectJavaScript(`
        window.GBTNativeNotificationReconciled?.(
          ${JSON.stringify(requestId)},
          ${ok ? "true" : "false"},
          ${JSON.stringify(code)},
          ${Math.max(0, Math.trunc(scheduledCount))},
          ${JSON.stringify(message)}
        );
        true;
      `);
    },
    [],
  );

  const reconcileNotifications = useCallback(
    async (message: BridgeMessage) => {
      if (message.type !== "notifications-reconcile") return;

      const cancelOwnedReminders = async (keep = new Set<string>()) => {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
          scheduled
            .filter(
              (request) =>
                isOwnedNotification(request) && !keep.has(request.identifier),
            )
            .map((request) =>
              Notifications.cancelScheduledNotificationAsync(request.identifier),
            ),
        );
      };

      try {
        if (typeof message.optedIn !== "boolean") {
          throw new NativeBridgeError(
            "NOTIFICATIONS_INVALID_REQUEST",
            "Reminder opt-in state is missing",
          );
        }
        if (!message.optedIn) {
          await cancelOwnedReminders();
          completeNativeNotificationReconcile(
            message.requestId,
            true,
            "NOTIFICATIONS_DISABLED",
            0,
          );
          return;
        }

        const reminders = normalizeReminderSpecs(message.reminders);
        if (!reminders.length) {
          await cancelOwnedReminders();
          completeNativeNotificationReconcile(
            message.requestId,
            true,
            "NOTIFICATIONS_CLEARED",
            0,
          );
          return;
        }

        let permission = await Notifications.getPermissionsAsync();
        if (
          !notificationsAllowed(permission) &&
          message.requestPermission === true &&
          permission.canAskAgain
        ) {
          permission = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: false,
              allowSound: false,
            },
          });
        }
        if (!notificationsAllowed(permission)) {
          throw new NativeBridgeError(
            permission.canAskAgain && message.requestPermission !== true
              ? "NOTIFICATIONS_PERMISSION_REQUIRED"
              : "NOTIFICATIONS_PERMISSION_DENIED",
            permission.canAskAgain && message.requestPermission !== true
              ? "Notification permission requires a direct opt-in action"
              : "Notification permission was not granted",
          );
        }

        const desiredIdentifiers = new Set(
          reminders.map((reminder) => notificationIdentifier(reminder.id)),
        );
        for (const reminder of reminders) {
          const copy = notificationCopy(reminder.kind, reminder.locale);
          await Notifications.scheduleNotificationAsync({
            identifier: notificationIdentifier(reminder.id),
            content: {
              ...copy,
              sound: false,
              data: {
                owner: NOTIFICATION_OWNER,
                reminderId: reminder.id,
                reminderKind: reminder.kind,
                fireAt: reminder.fireAt,
                schemaVersion: 1,
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(reminder.fireAt),
            },
          });
        }
        await cancelOwnedReminders(desiredIdentifiers);
        completeNativeNotificationReconcile(
          message.requestId,
          true,
          "NOTIFICATIONS_RECONCILED",
          reminders.length,
        );
      } catch (error) {
        console.error("Native reminder reconciliation failed", error);
        const failure = nativeBridgeFailure(
          error,
          "NOTIFICATIONS_FAILED",
          "Reminders could not be scheduled",
        );
        completeNativeNotificationReconcile(
          message.requestId,
          false,
          failure.code,
          0,
          failure.message,
        );
      }
    },
    [completeNativeNotificationReconcile],
  );

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
          "Advertising unavailable",
          "Advertising could not be initialized. Please try again later.",
        );
      }
    } catch {
      Alert.alert(
        "Advertising privacy choices",
        "No additional advertising privacy form is required on this device right now.",
      );
    }
  }, [startAdsIfAllowed]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: BridgeMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      } catch {
        return;
      }
      if (!message || typeof message !== "object" || !("type" in message)) {
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
        case "share-file":
          void shareFile(message);
          break;
        case "share-text":
          void shareText(message);
          break;
        case "notifications-reconcile":
          void reconcileNotifications(message);
          break;
      }
    },
    [reconcileNotifications, shareFile, shareText, showPrivacyChoices],
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
