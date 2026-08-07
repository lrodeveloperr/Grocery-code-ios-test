import SwiftUI
import UIKit

@main
struct GroceryBenefitsTrackerApp: App {
    @StateObject private var store = TrackerStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(AppTheme.green)
        }
        .onChange(of: scenePhase) { phase in
            if phase != .active { store.flushDeferredChanges() }
        }
    }
}

enum AppTheme {
    enum Role { case accent, tintedSurface, secondaryOnTint, prominentFill }

    static var green: Color { adaptiveColor(.accent) }
    static var mint: Color { adaptiveColor(.tintedSurface) }
    static var ink: Color { .primary }
    static var secondaryOnTint: Color { adaptiveColor(.secondaryOnTint) }
    static var prominentFill: Color { adaptiveColor(.prominentFill) }

    static func uiColor(_ role: Role, style: UIUserInterfaceStyle) -> UIColor {
        switch (role, style == .dark) {
        case (.accent, false):
            return UIColor(red: 0.02, green: 0.25, blue: 0.14, alpha: 1)
        case (.accent, true):
            return UIColor(red: 0.55, green: 0.95, blue: 0.72, alpha: 1)
        case (.tintedSurface, false):
            return UIColor(red: 0.87, green: 0.97, blue: 0.92, alpha: 1)
        case (.tintedSurface, true):
            return UIColor(red: 0.05, green: 0.16, blue: 0.12, alpha: 1)
        case (.secondaryOnTint, false):
            return UIColor(red: 0.22, green: 0.30, blue: 0.26, alpha: 1)
        case (.secondaryOnTint, true):
            return UIColor(red: 0.72, green: 0.82, blue: 0.77, alpha: 1)
        case (.prominentFill, _):
            return UIColor(red: 0.03, green: 0.50, blue: 0.33, alpha: 1)
        }
    }

    private static func adaptiveColor(_ role: Role) -> Color {
        Color(uiColor: UIColor { traits in
            uiColor(role, style: traits.userInterfaceStyle)
        })
    }
}

extension View {
    func appProminentButtonStyle() -> some View {
        buttonStyle(.borderedProminent)
            .tint(AppTheme.prominentFill)
            .foregroundStyle(.white)
    }
}
