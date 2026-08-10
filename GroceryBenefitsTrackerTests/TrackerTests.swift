import CryptoKit
import Dispatch
import Foundation
import UIKit
import XCTest
@testable import GroceryBenefitsTrackerQA

final class MoneyAndModelTests: XCTestCase {
    func testStrictMoneyParsing() {
        XCTAssertEqual(Money.parseCents("12"), 1_200)
        XCTAssertEqual(Money.parseCents("$12.3"), 1_230)
        XCTAssertEqual(Money.parseCents("12,34"), 1_234)
        XCTAssertNil(Money.parseCents("12.345"))
        XCTAssertNil(Money.parseCents("-1"))
        XCTAssertNil(Money.parseCents("abc"))
    }

    func testBasketClassificationsRemainSeparate() {
        let items = [
            GroceryItem(name: "Rice", quantity: 2, unitPriceCents: 300, eligibility: .eligible),
            GroceryItem(name: "Soap", quantity: 1, unitPriceCents: 250, eligibility: .notEligible),
            GroceryItem(name: "Prepared meal", quantity: 1, unitPriceCents: 700, eligibility: .unsure)
        ]
        let totals = BasketTotals(items: items)
        XCTAssertEqual(totals.total, 1_550)
        XCTAssertEqual(totals.eligible, 600)
        XCTAssertEqual(totals.notEligible, 250)
        XCTAssertEqual(totals.unsure, 700)
    }

    func testCatalogContainsOneHundredFiftyCommonEnglishItems() {
        XCTAssertEqual(Catalog.english.count, 150)
        XCTAssertEqual(Set(Catalog.english.map(\.normalizedItemKey)).count, 150)
    }

    func testInclusiveDayRangeNormalizesReversedDatesAndFractionalSeconds() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let early = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 8, day: 2, hour: 19)))
        let late = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 8, day: 5, hour: 8)))
        let range = try XCTUnwrap(DateRanges.inclusiveDays(late, early, calendar: calendar))
        let firstMoment = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 8, day: 2)))
        let finalFractionalMoment = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 8, day: 5, hour: 23, minute: 59, second: 59)))
            .addingTimeInterval(0.999_999)
        XCTAssertEqual(range.start, firstMoment)
        XCTAssertGreaterThanOrEqual(finalFractionalMoment, range.start)
        XCTAssertLessThan(finalFractionalMoment, range.end)
        XCTAssertEqual(range.end, try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 8, day: 6))))
    }

    func testPersistedCanonicalKeysDoNotUseTurkishLocaleCasing() {
        XCTAssertEqual("I".normalizedItemKey, "i")
        XCTAssertNotEqual("I".normalizedItemKey, "ı".normalizedItemKey)
        XCTAssertEqual("CAFÉ".normalizedItemKey, "cafe")
    }
}

final class AccessibilityContrastTests: XCTestCase {
    func testEligibilityPaletteMeetsNormalTextContrastInLightAndDarkAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let surfaces = [UIColor.systemBackground, .secondarySystemBackground]
                .map { $0.resolvedColor(with: traits) }

            for eligibility in Eligibility.allCases {
                let foreground = EligibilityPalette.uiColor(eligibility, style: style)
                for surface in surfaces {
                    let tintedBadge = composite(foreground, alpha: 0.15, over: surface)
                    XCTAssertGreaterThanOrEqual(
                        contrast(foreground, tintedBadge),
                        4.5,
                        "\(eligibility) badge must meet WCAG AA in \(style) appearance"
                    )
                }
                XCTAssertGreaterThanOrEqual(
                    contrast(foreground, surfaces[1]),
                    4.5,
                    "\(eligibility) report value must meet WCAG AA in \(style) appearance"
                )
            }
        }
    }

    func testAppThemeMeetsTextAndControlContrastInLightAndDarkAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let surfaces = [UIColor.systemBackground, .secondarySystemBackground]
                .map { $0.resolvedColor(with: traits) }
            let accent = AppTheme.uiColor(.accent, style: style)
            for surface in surfaces {
                XCTAssertGreaterThanOrEqual(
                    contrast(accent, surface),
                    4.5,
                    "Accent text and icons must meet WCAG AA in \(style) appearance"
                )
            }

            let tintedSurface = AppTheme.uiColor(.tintedSurface, style: style)
            let primaryLabel = UIColor.label.resolvedColor(with: traits)
            let secondaryOnTint = AppTheme.uiColor(.secondaryOnTint, style: style)
            XCTAssertGreaterThanOrEqual(contrast(primaryLabel, tintedSurface), 4.5)
            XCTAssertGreaterThanOrEqual(contrast(accent, tintedSurface), 4.5)
            XCTAssertGreaterThanOrEqual(contrast(secondaryOnTint, tintedSurface), 4.5)
            for surface in surfaces {
                XCTAssertGreaterThanOrEqual(contrast(secondaryOnTint, surface), 4.5)
            }

            let prominentFill = AppTheme.uiColor(.prominentFill, style: style)
            XCTAssertGreaterThanOrEqual(contrast(.white, prominentFill), 4.5)
            for surface in surfaces {
                XCTAssertGreaterThanOrEqual(
                    contrast(prominentFill, surface),
                    3.0,
                    "Prominent control boundary must remain visible in \(style) appearance"
                )
            }
        }
    }

    private func composite(_ foreground: UIColor, alpha: Double, over background: UIColor) -> UIColor {
        let foregroundRGB = components(foreground)
        let backgroundRGB = components(background)
        return UIColor(
            red: CGFloat(alpha * foregroundRGB.red + (1 - alpha) * backgroundRGB.red),
            green: CGFloat(alpha * foregroundRGB.green + (1 - alpha) * backgroundRGB.green),
            blue: CGFloat(alpha * foregroundRGB.blue + (1 - alpha) * backgroundRGB.blue),
            alpha: 1
        )
    }

    private func contrast(_ first: UIColor, _ second: UIColor) -> Double {
        let firstLuminance = luminance(first)
        let secondLuminance = luminance(second)
        return (max(firstLuminance, secondLuminance) + 0.05) /
            (min(firstLuminance, secondLuminance) + 0.05)
    }

    private func luminance(_ color: UIColor) -> Double {
        let rgb = components(color)
        func linear(_ component: Double) -> Double {
            component <= 0.04045
                ? component / 12.92
                : pow((component + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(rgb.red) + 0.7152 * linear(rgb.green) + 0.0722 * linear(rgb.blue)
    }

    private func components(_ color: UIColor) -> (red: Double, green: Double, blue: Double) {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
        return (Double(red), Double(green), Double(blue))
    }
}

private final class RecoveryMoveFailingFileManager: FileManager, @unchecked Sendable {
    private enum Failure: Error { case expected }

    override func moveItem(at source: URL, to destination: URL) throws {
        if source.lastPathComponent == "tracker-state.recovery",
           destination.lastPathComponent == "tracker-state.json" {
            throw Failure.expected
        }
        try super.moveItem(at: source, to: destination)
    }
}

final class PersistenceTests: XCTestCase {
    private enum InjectedFailure: Error { case expected }

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func testMissingPrimaryLoadsNewTracker() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let result = try StatePersistence(directory: directory).load()
        XCTAssertEqual(result.state, .empty)
        XCTAssertFalse(result.recoveredBackup)
    }

    func testDamagedPrimaryRestoresVerifiedBackup() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var first = TrackerState.empty
        first.draftStore = "First valid state"
        try persistence.save(first)
        var second = first
        second.draftStore = "Second valid state"
        try persistence.save(second)
        try Data("damaged".utf8).write(to: directory.appendingPathComponent("tracker-state.json"), options: .atomic)

        let recovered = try persistence.load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertEqual(recovered.state.draftStore, "First valid state")
        XCTAssertEqual(try persistence.load().state.draftStore, "First valid state")
    }

    func testDamagedEnvelopeWithoutBackupFailsClosed() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try Data("not-an-envelope".utf8).write(to: directory.appendingPathComponent("tracker-state.json"), options: .atomic)
        XCTAssertThrowsError(try StatePersistence(directory: directory).load())
    }

    func testMissingPrimaryRestoresBackupOne() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var first = TrackerState.empty
        first.draftStore = "Backup one"
        try persistence.save(first)
        var second = first
        second.draftStore = "Primary"
        try persistence.save(second)
        try FileManager.default.removeItem(at: directory.appendingPathComponent("tracker-state.json"))

        let recovered = try persistence.load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertEqual(recovered.state.draftStore, "Backup one")
    }

    func testMissingPrimaryRestoresBackupFive() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var state = TrackerState.empty
        state.draftStore = "Backup five"
        try persistence.save(state)
        let primary = directory.appendingPathComponent("tracker-state.json")
        try FileManager.default.copyItem(at: primary, to: directory.appendingPathComponent("tracker-state.backup-5.json"))
        try FileManager.default.removeItem(at: primary)

        let recovered = try persistence.load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertEqual(recovered.state.draftStore, "Backup five")
    }

    func testFiveSnapshotDepthSurvivesFourCorruptBackups() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        for index in 0...6 {
            var state = TrackerState.empty
            state.draftStore = "Generation \(index)"
            try persistence.save(state)
        }
        let backups = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("tracker-state.backup-") }
        XCTAssertEqual(backups.count, 5)
        try FileManager.default.removeItem(at: directory.appendingPathComponent("tracker-state.json"))
        for backup in backups.dropFirst() {
            try Data("damaged".utf8).write(to: backup, options: .atomic)
        }
        let recovered = try persistence.load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertTrue((1...5).map { "Generation \($0)" }.contains(recovered.state.draftStore))
    }

    func testBackupGenerationRemainsNewestWhenWallClockMovesBackward() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var clock = Date(timeIntervalSince1970: 2_000)
        let persistence = StatePersistence(directory: directory, now: { clock })
        for index in 0...5 {
            clock = Date(timeIntervalSince1970: TimeInterval(2_000 + index))
            var state = TrackerState.empty
            state.draftStore = "Generation \(index)"
            try persistence.save(state)
        }
        clock = Date(timeIntervalSince1970: 1_000)
        var newest = TrackerState.empty
        newest.draftStore = "Generation 6"
        try persistence.save(newest)
        try Data("damaged".utf8).write(
            to: directory.appendingPathComponent("tracker-state.json"),
            options: .atomic
        )

        let recovered = try persistence.load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertEqual(recovered.state.draftStore, "Generation 5")
    }

    func testInterruptedPendingFileDoesNotReplaceValidPrimary() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var state = TrackerState.empty
        state.draftStore = "Committed"
        try persistence.save(state)
        try Data("interrupted".utf8).write(to: directory.appendingPathComponent("tracker-state.pending"))
        XCTAssertEqual(try persistence.load().state.draftStore, "Committed")
    }

    func testVerifiedPendingSoleArtifactPromotesAfterFirstSaveCrash() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var candidate = TrackerState.empty
        candidate.draftStore = "First committed intent"
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let payload = try encoder.encode(candidate)
        let digest = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        let envelope = StateEnvelope(formatVersion: 1, payload: payload, sha256: digest)
        try encoder.encode(envelope).write(
            to: directory.appendingPathComponent("tracker-state.pending"),
            options: .atomic
        )

        let loaded = try StatePersistence(directory: directory).load()
        XCTAssertEqual(loaded.state, candidate)
        XCTAssertFalse(loaded.recoveredBackup)
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("tracker-state.json").path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appendingPathComponent("tracker-state.pending").path))
        XCTAssertEqual(
            try directory.appendingPathComponent("tracker-state.json")
                .resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup,
            true
        )
    }

    func testInvalidPendingSoleArtifactIsDiscardedAsUncommitted() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let pending = directory.appendingPathComponent("tracker-state.pending")
        try Data("incomplete first save".utf8).write(to: pending, options: .atomic)

        let loaded = try StatePersistence(directory: directory).load()
        XCTAssertEqual(loaded.state, .empty)
        XCTAssertFalse(loaded.recoveredBackup)
        XCTAssertFalse(FileManager.default.fileExists(atPath: pending.path))
    }

    func testVerifiedRecoveryStagePromotesAfterProcessCrash() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var state = TrackerState.empty
        state.draftStore = "Recovery stage"
        let persistence = StatePersistence(directory: directory)
        try persistence.save(state)
        let primary = directory.appendingPathComponent("tracker-state.json")
        let recovery = directory.appendingPathComponent("tracker-state.recovery")
        try FileManager.default.copyItem(at: primary, to: recovery)
        try FileManager.default.removeItem(at: primary)

        let loaded = try persistence.load()
        XCTAssertEqual(loaded.state, state)
        XCTAssertTrue(loaded.recoveredBackup)
        XCTAssertTrue(FileManager.default.fileExists(atPath: primary.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: recovery.path))
    }

    func testFailedRecoveryMovePreservesSoleVerifiedSnapshot() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var state = TrackerState.empty
        state.draftStore = "Only verified recovery"
        try StatePersistence(directory: directory).save(state)
        let primary = directory.appendingPathComponent("tracker-state.json")
        let recovery = directory.appendingPathComponent("tracker-state.recovery")
        try FileManager.default.copyItem(at: primary, to: recovery)
        try FileManager.default.removeItem(at: primary)

        let failing = StatePersistence(
            directory: directory,
            fileManager: RecoveryMoveFailingFileManager()
        )
        XCTAssertThrowsError(try failing.load())
        XCTAssertFalse(FileManager.default.fileExists(atPath: primary.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: recovery.path))

        let retried = try StatePersistence(directory: directory).load()
        XCTAssertTrue(retried.recoveredBackup)
        XCTAssertEqual(retried.state, state)
        XCTAssertTrue(FileManager.default.fileExists(atPath: primary.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: recovery.path))
    }

    func testInterruptedVerifiedBackupStagingCanRecoverMissingPrimary() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var state = TrackerState.empty
        state.draftStore = "Verified staging"
        try persistence.save(state)
        let primary = directory.appendingPathComponent("tracker-state.json")
        let staging = directory.appendingPathComponent("tracker-state.snapshot-staging-fixture")
        try FileManager.default.copyItem(at: primary, to: staging)
        try FileManager.default.removeItem(at: primary)
        let recovered = try persistence.load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertEqual(recovered.state, state)
        XCTAssertFalse(FileManager.default.fileExists(atPath: staging.path))
    }

    func testFailureBeforePrimaryCommitPreservesCommittedState() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var original = TrackerState.empty
        original.draftStore = "Original"
        try StatePersistence(directory: directory).save(original)
        var candidate = original
        candidate.draftStore = "Candidate"
        let failing = StatePersistence(directory: directory) { checkpoint in
            if checkpoint == .backupsRotated { throw InjectedFailure.expected }
        }
        XCTAssertThrowsError(try failing.save(candidate))
        XCTAssertEqual(try StatePersistence(directory: directory).load().state, original)
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).contains { $0.hasPrefix("tracker-state.backup-") })
    }

    func testFailureAfterPendingValidationLeavesFreshInstallClean() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var candidate = TrackerState.empty
        candidate.draftStore = "Uncommitted"
        let failing = StatePersistence(directory: directory) { checkpoint in
            if checkpoint == .pendingValidated { throw InjectedFailure.expected }
        }
        XCTAssertThrowsError(try failing.save(candidate))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), [])
        XCTAssertEqual(try StatePersistence(directory: directory).load().state, .empty)
    }

    func testFailureReportedAfterPrimaryCommitReconcilesAsSuccess() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var original = TrackerState.empty
        original.draftStore = "Original"
        try StatePersistence(directory: directory).save(original)
        var candidate = original
        candidate.draftStore = "Committed candidate"
        let postCommitFailure = StatePersistence(directory: directory) { checkpoint in
            if checkpoint == .primaryCommitted { throw InjectedFailure.expected }
        }
        XCTAssertNoThrow(try postCommitFailure.save(candidate))
        XCTAssertEqual(try StatePersistence(directory: directory).load().state, candidate)
    }

    func testCorruptPrimaryAfterReplacementPreservesVerifiedPrecommitSnapshot() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var original = TrackerState.empty
        original.draftStore = "Verified precommit state"
        try StatePersistence(directory: directory).save(original)
        var candidate = original
        candidate.draftStore = "Replacement"
        let corruptAfterCommit = StatePersistence(directory: directory) { checkpoint in
            if checkpoint == .primaryCommitted {
                try Data("post-replacement corruption".utf8).write(
                    to: directory.appendingPathComponent("tracker-state.json"),
                    options: .atomic
                )
                throw InjectedFailure.expected
            }
        }
        XCTAssertThrowsError(try corruptAfterCommit.save(candidate))
        let recovered = try StatePersistence(directory: directory).load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertEqual(recovered.state, original)
    }

    func testFailedRecoveryStagingLeavesBackupRecoverable() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var first = TrackerState.empty
        first.draftStore = "Recover me"
        try persistence.save(first)
        var second = first
        second.draftStore = "Later"
        try persistence.save(second)
        try Data("damaged".utf8).write(to: directory.appendingPathComponent("tracker-state.json"), options: .atomic)
        let interrupted = StatePersistence(directory: directory) { checkpoint in
            if checkpoint == .recoveryStaged { throw InjectedFailure.expected }
        }
        XCTAssertThrowsError(try interrupted.load())
        XCTAssertEqual(try persistence.load().state.draftStore, "Recover me")
    }

    func testFailureReportedAfterRecoveryCommitReconcilesAsSuccess() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var first = TrackerState.empty
        first.draftStore = "Recovered"
        try persistence.save(first)
        var second = first
        second.draftStore = "Later"
        try persistence.save(second)
        try Data("damaged".utf8).write(to: directory.appendingPathComponent("tracker-state.json"), options: .atomic)
        let postCommitFailure = StatePersistence(directory: directory) { checkpoint in
            if checkpoint == .recoveryCommitted { throw InjectedFailure.expected }
        }
        let recovered = try postCommitFailure.load()
        XCTAssertTrue(recovered.recoveredBackup)
        XCTAssertEqual(recovered.state.draftStore, "Recovered")
    }

    func testErasureLeavesNoRecoverySnapshot() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        var sensitive = TrackerState.empty
        sensitive.draftStore = "Sensitive market"
        try persistence.save(sensitive)
        sensitive.draftStore = "Sensitive market two"
        try persistence.save(sensitive)
        try persistence.eraseTrackerData()
        let names = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        XCTAssertFalse(names.contains { $0.contains("backup") })
        XCTAssertFalse(names.contains { $0.contains("erase-intent") })
        XCTAssertEqual(try persistence.load().state, .empty)
        try Data("damaged".utf8).write(to: directory.appendingPathComponent("tracker-state.json"), options: .atomic)
        XCTAssertThrowsError(try persistence.load())
    }

    func testErasureIntentRecoversEveryInterruptedDeletionBoundary() throws {
        for failureIndex in 1...6 {
            let directory = try temporaryDirectory()
            defer { try? FileManager.default.removeItem(at: directory) }
            let setup = StatePersistence(directory: directory)
            for index in 0...6 {
                var sensitive = TrackerState.empty
                sensitive.draftStore = "Sensitive generation \(index)"
                try setup.save(sensitive)
            }
            let artifacts = try FileManager.default.contentsOfDirectory(atPath: directory.path)
                .filter { $0.hasPrefix("tracker-state") }
            XCTAssertEqual(artifacts.count, 6)

            var retained = TrackerState.empty
            retained.language = .spanish
            retained.program = .pan
            retained.acceptedLegalVersion = "2026-08-07-v1"
            retained.onboardingComplete = true
            var removals = 0
            let interrupted = StatePersistence(directory: directory) { checkpoint in
                guard checkpoint == .erasureArtifactRemoved else { return }
                removals += 1
                if removals == failureIndex { throw InjectedFailure.expected }
            }
            XCTAssertThrowsError(try interrupted.eraseTrackerData(retaining: retained))
            XCTAssertTrue(interrupted.hasPendingErasureIntent())

            let recovered = try StatePersistence(directory: directory).load()
            XCTAssertEqual(recovered.state, retained)
            let remaining = try FileManager.default.contentsOfDirectory(atPath: directory.path)
                .filter { $0.hasPrefix("tracker-state") }
            XCTAssertEqual(remaining, ["tracker-state.json"])
        }
    }

    func testErasureIntentSurvivesBeforeDeletionAndAfterRetainedCommit() throws {
        for failureCheckpoint in [PersistenceCheckpoint.erasureIntentCommitted, .erasurePrimaryCommitted] {
            let directory = try temporaryDirectory()
            defer { try? FileManager.default.removeItem(at: directory) }
            var sensitive = TrackerState.empty
            sensitive.draftStore = "Sensitive"
            try StatePersistence(directory: directory).save(sensitive)
            var retained = TrackerState.empty
            retained.language = .spanish
            retained.program = .pan
            retained.acceptedLegalVersion = "2026-08-07-v1"
            retained.onboardingComplete = true
            let interrupted = StatePersistence(directory: directory) { checkpoint in
                if checkpoint == failureCheckpoint { throw InjectedFailure.expected }
            }

            XCTAssertThrowsError(try interrupted.eraseTrackerData(retaining: retained))
            XCTAssertTrue(interrupted.hasPendingErasureIntent())
            let intentValues = try directory.appendingPathComponent("tracker-state.erase-intent")
                .resourceValues(forKeys: [.isExcludedFromBackupKey])
            XCTAssertEqual(intentValues.isExcludedFromBackup, true)
            XCTAssertEqual(try StatePersistence(directory: directory).load().state, retained)
            XCTAssertFalse(interrupted.hasPendingErasureIntent())
        }
    }

    func testStateFilesAreExcludedFromDeviceBackup() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory)
        try persistence.save(.empty)
        var second = TrackerState.empty
        second.draftStore = "Backup"
        try persistence.save(second)
        let backupName = try XCTUnwrap(FileManager.default.contentsOfDirectory(atPath: directory.path)
            .first { $0.hasPrefix("tracker-state.backup-") })
        for name in ["tracker-state.json", backupName] {
            let values = try directory.appendingPathComponent(name).resourceValues(forKeys: [.isExcludedFromBackupKey])
            XCTAssertEqual(values.isExcludedFromBackup, true, "\(name) must remain local-only")
        }
    }

    func testSemanticallyInvalidButChecksummedStateFailsClosed() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        var invalid = TrackerState.empty
        invalid.cards = [BenefitCard(name: "Broken", balanceCents: -1, colorIndex: -1)]
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let payload = try encoder.encode(invalid)
        let digest = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        let envelope = StateEnvelope(formatVersion: 1, payload: payload, sha256: digest)
        try encoder.encode(envelope).write(to: directory.appendingPathComponent("tracker-state.json"), options: .atomic)
        XCTAssertThrowsError(try StatePersistence(directory: directory).load())
    }
}

@MainActor
final class TrackerStoreTests: XCTestCase {
    private enum SaveFailure: Error { case expected }

    private func makeStore() throws -> (TrackerStore, URL) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return (TrackerStore(persistence: StatePersistence(directory: directory)), directory)
    }

    func testPurchaseDeductionAndSingleRefundAreTransactional() throws {
        let (store, directory) = try makeStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        XCTAssertTrue(store.addCard(name: "Family", balanceCents: 10_000))
        XCTAssertTrue(store.addItem(name: "Rice", quantity: 2, unitPriceCents: 500, eligibility: .eligible))
        XCTAssertTrue(store.addItem(name: "Soap", quantity: 1, unitPriceCents: 300, eligibility: .notEligible))
        store.updateStore("Market")
        XCTAssertTrue(store.completePurchase(now: Date(timeIntervalSince1970: 100)))
        XCTAssertEqual(store.activeCard?.balanceCents, 9_000)
        XCTAssertEqual(store.state.purchases.count, 1)

        let purchaseID = try XCTUnwrap(store.state.purchases.first?.id)
        XCTAssertTrue(store.deletePurchase(purchaseID, refund: true))
        XCTAssertEqual(store.activeCard?.balanceCents, 10_000)
        XCTAssertFalse(store.deletePurchase(purchaseID, refund: true))
        XCTAssertEqual(store.activeCard?.balanceCents, 10_000)
    }

    func testPastPurchaseDoesNotChangeWhenLearnedClassificationChanges() throws {
        let (store, directory) = try makeStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        XCTAssertTrue(store.addCard(name: "Card", balanceCents: 5_000))
        XCTAssertTrue(store.addItem(name: "Bread", quantity: 1, unitPriceCents: 300, eligibility: .eligible))
        store.updateStore("Store")
        XCTAssertTrue(store.completePurchase())
        XCTAssertTrue(store.addItem(name: "Bread", quantity: 1, unitPriceCents: 300, eligibility: .notEligible))
        XCTAssertEqual(store.state.purchases.first?.items.first?.eligibility, .eligible)
    }

    func testBenefitReceiptCannotBeReversedTwice() throws {
        let (store, directory) = try makeStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        XCTAssertTrue(store.addCard(name: "Card", balanceCents: 1_000))
        let cardID = try XCTUnwrap(store.activeCard?.id)
        XCTAssertTrue(store.recordBenefits(cardID: cardID, amountCents: 500))
        let adjustmentID = try XCTUnwrap(store.state.benefitAdjustments.first?.id)
        XCTAssertTrue(store.reverseBenefit(adjustmentID))
        XCTAssertFalse(store.reverseBenefit(adjustmentID))
        XCTAssertEqual(store.activeCard?.balanceCents, 1_000)
    }

    func testRefundFailsWithoutDeletingWhenOriginalCardIsGone() throws {
        let (store, directory) = try makeStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        XCTAssertTrue(store.addCard(name: "Card", balanceCents: 5_000))
        XCTAssertTrue(store.addItem(name: "Rice", quantity: 1, unitPriceCents: 500, eligibility: .eligible))
        store.updateStore("Store")
        XCTAssertTrue(store.completePurchase())
        let cardID = try XCTUnwrap(store.activeCard?.id)
        let purchaseID = try XCTUnwrap(store.state.purchases.first?.id)
        store.deleteCard(cardID)

        XCTAssertFalse(store.deletePurchase(purchaseID, refund: true))
        XCTAssertNotNil(store.state.purchases.first(where: { $0.id == purchaseID }))
        XCTAssertTrue(store.deletePurchase(purchaseID, refund: false))
    }

    func testInterstitialCadenceCountsClosedDetailsAndHonorsCooldown() throws {
        let (store, directory) = try makeStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        let start = Date(timeIntervalSince1970: 10_000)

        XCTAssertFalse(store.registerHistoryDetailClosed(now: start))
        XCTAssertFalse(store.registerHistoryDetailClosed(now: start.addingTimeInterval(1)))
        XCTAssertTrue(store.registerHistoryDetailClosed(now: start.addingTimeInterval(2)))
        XCTAssertFalse(store.registerHistoryDetailClosed(now: start.addingTimeInterval(3)))
        XCTAssertFalse(store.registerHistoryDetailClosed(now: start.addingTimeInterval(4)))
        XCTAssertFalse(store.registerHistoryDetailClosed(now: start.addingTimeInterval(5)))
        XCTAssertFalse(store.registerHistoryDetailClosed(now: start.addingTimeInterval(1_899)))
        XCTAssertFalse(store.registerHistoryDetailClosed(now: start.addingTimeInterval(1_900)))
        XCTAssertTrue(store.registerHistoryDetailClosed(now: start.addingTimeInterval(1_901)))
    }

    func testStoreErasurePurgesBackupsAndKeepsOnlySettings() async throws {
        let (store, directory) = try makeStore()
        defer { try? FileManager.default.removeItem(at: directory) }
        store.finishOnboarding(language: .spanish, program: .pan)
        XCTAssertTrue(store.addCard(name: "Familia", balanceCents: 10_000))
        XCTAssertTrue(store.addItem(name: "Arroz", quantity: 1, unitPriceCents: 500, eligibility: .eligible))
        store.updateStore("Mercado")
        XCTAssertTrue(store.completePurchase())
        await store.eraseTrackerDataKeepingSettings()

        XCTAssertTrue(store.state.cards.isEmpty)
        XCTAssertTrue(store.state.purchases.isEmpty)
        XCTAssertEqual(store.state.language, .spanish)
        XCTAssertEqual(store.state.program, .pan)
        let reloaded = try StatePersistence(directory: directory).load().state
        XCTAssertEqual(reloaded, store.state)
        XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: directory.path).contains { $0.contains("backup") })
    }

    func testSpanishOnboardingSaveFailureIsPresentedInSpanish() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = StatePersistence(directory: directory) { checkpoint in
            if checkpoint == .pendingValidated { throw SaveFailure.expected }
        }
        let store = TrackerStore(persistence: persistence)
        store.finishOnboarding(language: .spanish, program: .pan)
        XCTAssertEqual(store.alertMessage, "No se pudo guardar el cambio local.")
        XCTAssertFalse(store.state.onboardingComplete)
    }
}

final class ExportTests: XCTestCase {
    private enum StoredZipParseError: Error { case malformed }

    private let purchase = Purchase(
        store: "Market",
        cardID: UUID(),
        cardName: "Family",
        completedAt: Date(timeIntervalSince1970: 100),
        items: [GroceryItem(name: "Rice & beans", quantity: 2, unitPriceCents: 499, eligibility: .eligible)],
        deductedEligibleCents: 998
    )

    func testXLSXIsARealZipPackage() throws {
        let url = try ExportService.makeXLSX(purchases: [purchase], language: .english)
        defer { try? FileManager.default.removeItem(at: url) }
        let data = try Data(contentsOf: url)
        XCTAssertEqual(Array(data.prefix(4)), [0x50, 0x4b, 0x03, 0x04])
        let entries = try storedEntries(in: data)
        let expected = [
            "[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "docProps/app.xml",
            "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"
        ]
        XCTAssertEqual(Set(entries.keys), Set(expected))
        for path in expected where path.hasSuffix(".xml") || path.hasSuffix(".rels") {
            let parser = XMLParser(data: try XCTUnwrap(entries[path]))
            XCTAssertTrue(parser.parse(), "Invalid XML at \(path)")
        }
        XCTAssertTrue(String(decoding: try XCTUnwrap(entries["xl/styles.xml"]), as: UTF8.self).contains("cellStyle name=\"Normal\""))
        let rootRelationships = String(decoding: try XCTUnwrap(entries["_rels/.rels"]), as: UTF8.self)
        let workbookRelationships = String(decoding: try XCTUnwrap(entries["xl/_rels/workbook.xml.rels"]), as: UTF8.self)
        XCTAssertTrue(rootRelationships.contains("Target=\"xl/workbook.xml\""))
        XCTAssertTrue(workbookRelationships.contains("Target=\"worksheets/sheet1.xml\""))
        XCTAssertTrue(workbookRelationships.contains("Target=\"styles.xml\""))
    }

    func testPDFHasPDFSignature() throws {
        let url = try ExportService.makePDF(purchases: [purchase], language: .english)
        defer { try? FileManager.default.removeItem(at: url) }
        let data = try Data(contentsOf: url)
        XCTAssertEqual(String(decoding: data.prefix(5), as: UTF8.self), "%PDF-")
    }

    func testSpanishXLSXHasLocalizedMetadataAndTypedDates() throws {
        let report = ExportReportContext(title: "Informe personalizado", start: purchase.completedAt, end: purchase.completedAt)
        let url = try ExportService.makeXLSX(purchases: [purchase], language: .spanish, report: report)
        defer { try? FileManager.default.removeItem(at: url) }
        let entries = try storedEntries(in: Data(contentsOf: url))
        let workbook = String(decoding: try XCTUnwrap(entries["xl/workbook.xml"]), as: UTF8.self)
        let worksheet = String(decoding: try XCTUnwrap(entries["xl/worksheets/sheet1.xml"]), as: UTF8.self)
        let properties = String(decoding: try XCTUnwrap(entries["docProps/core.xml"]), as: UTF8.self)
        XCTAssertTrue(workbook.contains("name=\"Compras\""))
        for header in ["Fecha", "Tienda", "Tarjeta", "Artículo", "Cantidad", "Clasificación", "Precio unitario", "Total de línea"] {
            XCTAssertTrue(worksheet.contains(header))
        }
        XCTAssertTrue(worksheet.contains("s=\"2\"><v>"), "Dates must be numeric Excel cells")
        XCTAssertFalse(worksheet.contains("1970-01-01"), "Dates must not be UTC text")
        XCTAssertTrue(properties.contains("Informe personalizado"))
    }

    func testXLSXFiltersForbiddenXMLControlScalars() throws {
        var controlPurchase = purchase
        controlPurchase.store = "Mar\u{000B}ket"
        controlPurchase.cardName = "Fam\u{0000}ily"
        controlPurchase.items[0].name = "Rice\u{000C} & beans"
        let report = ExportReportContext(title: "Control\u{0001} test", start: nil, end: nil)
        let url = try ExportService.makeXLSX(
            purchases: [controlPurchase],
            language: .english,
            report: report
        )
        defer { try? FileManager.default.removeItem(at: url) }
        let entries = try storedEntries(in: Data(contentsOf: url))
        for path in ["xl/worksheets/sheet1.xml", "docProps/core.xml"] {
            let data = try XCTUnwrap(entries[path])
            let parser = XMLParser(data: data)
            XCTAssertTrue(parser.parse(), "Filtered XML must parse at \(path)")
            for forbidden: UInt8 in [0x00, 0x01, 0x0B, 0x0C] {
                XCTAssertFalse(data.contains(forbidden))
            }
        }
    }

    func testLongDarkModePDFUsesMultipleValidPages() throws {
        let longItems = (0..<90).map { index in
            GroceryItem(
                name: "Artículo largo \(index) " + String(repeating: "x", count: 55),
                quantity: 1,
                unitPriceCents: 199,
                eligibility: Eligibility.allCases[index % Eligibility.allCases.count]
            )
        }
        let longPurchase = Purchase(
            store: String(repeating: "Mercado muy largo ", count: 5),
            cardID: UUID(),
            cardName: "Tarjeta familiar con nombre largo",
            completedAt: Date(),
            items: longItems,
            deductedEligibleCents: longItems.reduce(0) { $0 + $1.eligibleCents }
        )
        var generatedURL: URL?
        var generatedError: Error?
        UITraitCollection(userInterfaceStyle: .dark).performAsCurrent {
            do {
                generatedURL = try ExportService.makePDF(
                    purchases: [longPurchase],
                    language: .spanish,
                    report: ExportReportContext(title: "Informe personalizado", start: Date(), end: Date())
                )
            } catch {
                generatedError = error
            }
        }
        if let generatedError { throw generatedError }
        let url = try XCTUnwrap(generatedURL)
        defer { try? FileManager.default.removeItem(at: url) }
        let document = try XCTUnwrap(CGPDFDocument(url as CFURL))
        XCTAssertGreaterThan(document.numberOfPages, 1)
        XCTAssertGreaterThan(try Data(contentsOf: url).count, 5_000)
    }

    func testTemporaryReportsAreRemovedExplicitly() throws {
        let pdf = try ExportService.makePDF(purchases: [purchase], language: .english)
        let xlsx = try ExportService.makeXLSX(purchases: [purchase], language: .english)
        XCTAssertTrue(FileManager.default.fileExists(atPath: pdf.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: xlsx.path))
        XCTAssertEqual(try pdf.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        XCTAssertEqual(try xlsx.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        try ExportService.removeTemporaryReports()
        XCTAssertFalse(FileManager.default.fileExists(atPath: pdf.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: xlsx.path))
    }

    func testInvalidationDrainsWriterAndDeletesLateSensitiveExport() async throws {
        let coordinator = ExportCoordinator()
        let started = expectation(description: "writer started")
        let release = DispatchSemaphore(value: 0)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("grocery-benefits-report-race-\(UUID().uuidString).pdf")
        defer { try? FileManager.default.removeItem(at: url) }

        let exportTask = Task {
            await coordinator.perform(expectedDataGeneration: 0) {
                started.fulfill()
                release.wait()
                do {
                    try Data("sensitive export".utf8).write(to: url, options: .atomic)
                    return .success(url)
                } catch {
                    return .failure(error.localizedDescription)
                }
            }
        }
        await fulfillment(of: [started], timeout: 2)
        let drainTask = Task { await coordinator.closeAndDrain() }
        while await coordinator.currentGenerationForTesting() == 0 {
            await Task.yield()
        }
        release.signal()
        await drainTask.value

        let outcome = await exportTask.value
        if case .cancelled = outcome {
            // Expected: the erased generation must never be offered for sharing.
        } else {
            XCTFail("An invalidated export must report cancellation.")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    func testOldExportGenerationIsRejectedAfterCoordinatorReopens() async {
        let coordinator = ExportCoordinator()
        await coordinator.closeAndDrain()
        await coordinator.reopen(acceptingDataGeneration: 1)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("grocery-benefits-report-stale-\(UUID().uuidString).pdf")
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = await coordinator.perform(expectedDataGeneration: 0) {
            try? Data("stale sensitive export".utf8).write(to: url, options: .atomic)
            return .success(url)
        }
        if case .cancelled = outcome {
            // Expected: a request queued before erasure cannot join the reopened generation.
        } else {
            XCTFail("A stale export generation must be rejected.")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    private func storedEntries(in archive: Data) throws -> [String: Data] {
        func value<T: FixedWidthInteger>(_ type: T.Type, at offset: Int) throws -> T {
            guard offset >= 0, offset + MemoryLayout<T>.size <= archive.count else { throw StoredZipParseError.malformed }
            return archive.subdata(in: offset..<(offset + MemoryLayout<T>.size)).withUnsafeBytes {
                $0.loadUnaligned(as: T.self).littleEndian
            }
        }
        var entries: [String: Data] = [:]
        var offset = 0
        while offset + 4 <= archive.count {
            let signature: UInt32 = try value(UInt32.self, at: offset)
            if signature == 0x02014b50 || signature == 0x06054b50 { break }
            guard signature == 0x04034b50 else { throw StoredZipParseError.malformed }
            let method: UInt16 = try value(UInt16.self, at: offset + 8)
            let size: UInt32 = try value(UInt32.self, at: offset + 18)
            let nameLength: UInt16 = try value(UInt16.self, at: offset + 26)
            let extraLength: UInt16 = try value(UInt16.self, at: offset + 28)
            guard method == 0 else { throw StoredZipParseError.malformed }
            let nameStart = offset + 30
            let nameEnd = nameStart + Int(nameLength)
            let dataStart = nameEnd + Int(extraLength)
            let dataEnd = dataStart + Int(size)
            guard nameEnd <= archive.count, dataEnd <= archive.count else { throw StoredZipParseError.malformed }
            let name = String(decoding: archive[nameStart..<nameEnd], as: UTF8.self)
            entries[name] = Data(archive[dataStart..<dataEnd])
            offset = dataEnd
        }
        guard !entries.isEmpty else { throw StoredZipParseError.malformed }
        return entries
    }
}
