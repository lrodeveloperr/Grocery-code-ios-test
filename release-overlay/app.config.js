const TEST_ANDROID_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const TEST_IOS_APP_ID = "ca-app-pub-3940256099942544~1458002511";
const GOOGLE_TEST_PUBLISHER_ID = "3940256099942544";

const IOS_PRODUCTION_KEYS = [
  "EXPO_PUBLIC_ADMOB_PUBLISHER_ID",
  "EXPO_PUBLIC_IOS_ADMOB_APP_ID",
  "EXPO_PUBLIC_IOS_ADMOB_BANNER_ID",
];

module.exports = ({ config }) => {
  const profile = process.env.EXPO_PUBLIC_BUILD_PROFILE || "qa";
  const production = profile === "production";

  if (production) {
    const missing = IOS_PRODUCTION_KEYS.filter((key) => !process.env[key]);
    if (missing.length) {
      throw new Error(
        `Production iOS AdMob configuration rejected. Missing: ${missing.join(", ")}.`,
      );
    }

    const publisherId = String(
      process.env.EXPO_PUBLIC_ADMOB_PUBLISHER_ID || "",
    ).trim();
    const iosAppId = String(
      process.env.EXPO_PUBLIC_IOS_ADMOB_APP_ID || "",
    ).trim();
    const iosBannerId = String(
      process.env.EXPO_PUBLIC_IOS_ADMOB_BANNER_ID || "",
    ).trim();
    const appMatch = iosAppId.match(/^ca-app-pub-(\d{16})~(\d{10})$/);
    const bannerMatch = iosBannerId.match(/^ca-app-pub-(\d{16})\/(\d{10})$/);

    if (
      publisherId === GOOGLE_TEST_PUBLISHER_ID ||
      !/^\d{16}$/.test(publisherId) ||
      appMatch?.[1] !== publisherId ||
      bannerMatch?.[1] !== publisherId
    ) {
      throw new Error(
        "Production iOS AdMob identifiers are malformed, test-owned, or publisher-mismatched.",
      );
    }

    if (process.env.EXPO_PUBLIC_QA_PURCHASES === "1") {
      throw new Error("Production builds cannot enable simulated purchases.");
    }
  }

  const androidAppId = production
    ? config.plugins
        ?.find(
          (plugin) =>
            Array.isArray(plugin) &&
            plugin[0] === "react-native-google-mobile-ads",
        )?.[1]?.androidAppId
    : TEST_ANDROID_APP_ID;
  const iosAppId = production
    ? process.env.EXPO_PUBLIC_IOS_ADMOB_APP_ID
    : TEST_IOS_APP_ID;
  const qaSuffix = production ? "" : ".qa";

  return {
    ...config,
    name: production ? config.name : `${config.name} QA`,
    android: {
      ...config.android,
      package: `${config.android.package}${qaSuffix}`,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}${qaSuffix}`,
    },
    extra: { ...(config.extra || {}), buildProfile: profile },
    plugins: (config.plugins || []).map((plugin) => {
      if (
        !Array.isArray(plugin) ||
        plugin[0] !== "react-native-google-mobile-ads"
      ) {
        return plugin;
      }
      return [plugin[0], { ...plugin[1], androidAppId, iosAppId }];
    }),
  };
};
