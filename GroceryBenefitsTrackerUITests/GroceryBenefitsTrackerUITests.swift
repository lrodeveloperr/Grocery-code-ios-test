import XCTest

final class GroceryBenefitsTrackerUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testFreshOnboardingCanSwitchLanguageAndReachWallet() {
        let app = XCUIApplication()
        app.launchArguments = ["-qa-ui-test-reset"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Grocery Benefits Tracker"].waitForExistence(timeout: 8))
        let continueButton = app.buttons["Continue"]
        XCTAssertTrue(continueButton.exists)
        XCTAssertFalse(continueButton.isEnabled)

        app.buttons["Español (Puerto Rico)"].tap()
        XCTAssertTrue(app.staticTexts["Control de Beneficios de Comestibles"].waitForExistence(timeout: 3))
        app.buttons["English"].tap()

        let acceptance = app.switches["I accept the Terms and Privacy Notice"]
        XCTAssertTrue(acceptance.waitForExistence(timeout: 3))
        acceptance.tap()
        XCTAssertTrue(continueButton.isEnabled)
        continueButton.tap()

        let basketTab = app.tabBars.buttons["Basket"]
        XCTAssertTrue(basketTab.waitForExistence(timeout: 5))
        app.tabBars.buttons["Wallet"].tap()
        XCTAssertTrue(app.buttons["Add local card"].waitForExistence(timeout: 3))
    }
}
