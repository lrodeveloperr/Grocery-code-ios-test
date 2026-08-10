internal import Expo
import GoogleMobileAds
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    configureAdvertisingPrivacy()

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    let didFinishLaunching = super.application(
      application,
      didFinishLaunchingWithOptions: launchOptions
    )

    excludeWebViewDataFromBackup()
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      self?.excludeWebViewDataFromBackup()
    }

    return didFinishLaunching
  }

  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
      || RCTLinkingManager.application(app, open: url, options: options)
  }

  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let handled = RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
    return super.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    ) || handled
  }

  private func configureAdvertisingPrivacy() {
    let configuration = MobileAds.shared.requestConfiguration
    configuration.publisherPrivacyPersonalizationState = .disabled
    configuration.setPublisherFirstPartyIDEnabled(false)
  }

  private func excludeWebViewDataFromBackup() {
    let fileManager = FileManager.default
    guard let libraryDirectory = fileManager.urls(
      for: .libraryDirectory,
      in: .userDomainMask
    ).first else { return }

    let webViewDataLocations = [
      libraryDirectory.appendingPathComponent("WebKit", isDirectory: true),
      libraryDirectory.appendingPathComponent(
        "WebKit/WebsiteData",
        isDirectory: true
      ),
    ]

    for location in webViewDataLocations {
      var isDirectory: ObjCBool = false
      guard fileManager.fileExists(
        atPath: location.path,
        isDirectory: &isDirectory
      ), isDirectory.boolValue else { continue }

      var excludedLocation = location
      var resourceValues = URLResourceValues()
      resourceValues.isExcludedFromBackup = true
      try? excludedLocation.setResourceValues(resourceValues)
    }
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(
      forBundleRoot: ".expo/.virtual-metro-entry"
    )
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
