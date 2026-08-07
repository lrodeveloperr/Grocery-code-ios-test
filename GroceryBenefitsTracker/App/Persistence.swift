import CryptoKit
import Foundation

enum PersistenceError: LocalizedError {
    case invalidEnvelope
    case unrecoverable

    var errorDescription: String? {
        switch self {
        case .invalidEnvelope: return "The local data envelope failed integrity validation."
        case .unrecoverable: return "No valid local recovery snapshot was found."
        }
    }
}

struct StateEnvelope: Codable {
    let formatVersion: Int
    let payload: Data
    let sha256: String
}

struct PersistenceLoadResult {
    let state: TrackerState
    let recoveredBackup: Bool
}

enum PersistenceCheckpoint: Equatable {
    case pendingValidated
    case backupsRotated
    case primaryCommitted
    case recoveryStaged
    case recoveryCommitted
    case erasureIntentCommitted
    case erasureArtifactRemoved
    case erasurePrimaryCommitted
}

struct StatePersistence {
    let directory: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let now: () -> Date
    private let checkpoint: (PersistenceCheckpoint) throws -> Void

    init(
        directory: URL? = nil,
        fileManager: FileManager = .default,
        now: @escaping () -> Date = Date.init,
        checkpoint: @escaping (PersistenceCheckpoint) throws -> Void = { _ in }
    ) {
        self.fileManager = fileManager
        self.now = now
        self.checkpoint = checkpoint
        if let directory {
            self.directory = directory
        } else {
            let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.directory = base.appendingPathComponent("GroceryBenefitsTrackerQA", isDirectory: true)
        }
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
    }

    private var primaryURL: URL { directory.appendingPathComponent("tracker-state.json") }
    private var pendingURL: URL { directory.appendingPathComponent("tracker-state.pending") }
    private var recoveryURL: URL { directory.appendingPathComponent("tracker-state.recovery") }
    private var eraseIntentURL: URL { directory.appendingPathComponent("tracker-state.erase-intent") }

    private func newBackupURL() throws -> URL {
        let wallClockGeneration = max(6, Int64(now().timeIntervalSince1970 * 1_000_000))
        let existingMaximum = try backupCandidates()
            .compactMap(backupGeneration)
            .filter { $0 > 5 }
            .max()
        let generation: Int64
        if let existingMaximum {
            guard existingMaximum < Int64.max else { throw PersistenceError.invalidEnvelope }
            generation = max(wallClockGeneration, existingMaximum + 1)
        } else {
            generation = wallClockGeneration
        }
        return directory.appendingPathComponent("tracker-state.backup-\(generation)-\(UUID().uuidString).json")
    }

    private func newBackupStagingURL() -> URL {
        directory.appendingPathComponent("tracker-state.snapshot-staging-\(UUID().uuidString)")
    }

    func load() throws -> PersistenceLoadResult {
        try prepareDirectory()
        if fileManager.fileExists(atPath: eraseIntentURL.path) {
            let retained = try decodeState(from: eraseIntentURL)
            guard retained == settingsOnlyState(from: retained) else {
                throw PersistenceError.unrecoverable
            }
            try completeErasure(retaining: retained)
            return PersistenceLoadResult(state: retained, recoveredBackup: false)
        }
        let primaryExists = fileManager.fileExists(atPath: primaryURL.path)
        if primaryExists, let state = try? decodeState(from: primaryURL) {
            try? fileManager.removeItem(at: pendingURL)
            try? fileManager.removeItem(at: recoveryURL)
            try? removeBackupStagingFiles()
            return PersistenceLoadResult(state: state, recoveredBackup: false)
        }
        if !primaryExists {
            let trackerNames = try fileManager.contentsOfDirectory(atPath: directory.path)
                .filter { $0.hasPrefix("tracker-state") }
            if trackerNames == [pendingURL.lastPathComponent] {
                guard let state = try? decodeState(from: pendingURL) else {
                    try fileManager.removeItem(at: pendingURL)
                    return PersistenceLoadResult(state: .empty, recoveredBackup: false)
                }
                do {
                    try fileManager.moveItem(at: pendingURL, to: primaryURL)
                } catch {
                    guard (try? decodeState(from: primaryURL)) == state else { throw error }
                }
                try applyLocalOnlyProtection(to: primaryURL)
                guard (try? decodeState(from: primaryURL)) == state else {
                    throw PersistenceError.invalidEnvelope
                }
                return PersistenceLoadResult(state: state, recoveredBackup: false)
            }
        }
        var recoveryCandidates: [URL] = []
        if fileManager.fileExists(atPath: recoveryURL.path) { recoveryCandidates.append(recoveryURL) }
        recoveryCandidates += try backupStagingCandidates() + backupCandidates()
        for candidate in recoveryCandidates {
            guard let state = try? decodeState(from: candidate) else { continue }
            try restorePrimary(from: candidate, expected: state, preserveDamagedPrimary: primaryExists)
            try? removeBackupStagingFiles()
            return PersistenceLoadResult(state: state, recoveredBackup: true)
        }
        let trackerArtifacts = try fileManager.contentsOfDirectory(atPath: directory.path)
            .contains { $0.hasPrefix("tracker-state") }
        if !primaryExists, !trackerArtifacts {
            return PersistenceLoadResult(state: .empty, recoveredBackup: false)
        }
        throw PersistenceError.unrecoverable
    }

    func save(_ state: TrackerState) throws {
        try prepareDirectory()
        guard !fileManager.fileExists(atPath: eraseIntentURL.path) else {
            throw PersistenceError.unrecoverable
        }
        let bytes = try encodedEnvelope(for: state)

        var stagedBackup: URL?
        var createdBackup: URL?
        var createdBackupWasVerified = false
        do {
            try? fileManager.removeItem(at: pendingURL)
            try bytes.write(to: pendingURL, options: [.atomic])
            try applyLocalOnlyProtection(to: pendingURL)
            _ = try decodeState(from: pendingURL)
            try checkpoint(.pendingValidated)
            if fileManager.fileExists(atPath: primaryURL.path) {
                _ = try decodeState(from: primaryURL)
                let staging = newBackupStagingURL()
                let backup = try newBackupURL()
                stagedBackup = staging
                try fileManager.copyItem(at: primaryURL, to: staging)
                try applyLocalOnlyProtection(to: staging)
                _ = try decodeState(from: staging)
                try fileManager.moveItem(at: staging, to: backup)
                stagedBackup = nil
                createdBackup = backup
                _ = try decodeState(from: backup)
                createdBackupWasVerified = true
                try checkpoint(.backupsRotated)
                _ = try fileManager.replaceItemAt(primaryURL, withItemAt: pendingURL)
            } else {
                try fileManager.moveItem(at: pendingURL, to: primaryURL)
            }
            try checkpoint(.primaryCommitted)
            guard (try? decodeState(from: primaryURL)) == state else {
                throw PersistenceError.invalidEnvelope
            }
            try? pruneBackups()
        } catch {
            try? fileManager.removeItem(at: pendingURL)
            if let stagedBackup { try? fileManager.removeItem(at: stagedBackup) }
            if let createdBackup, !createdBackupWasVerified {
                try? fileManager.removeItem(at: createdBackup)
            }
            if (try? decodeState(from: primaryURL)) == state {
                try? pruneBackups()
                return
            }
            try? pruneBackups()
            throw error
        }
    }

    func eraseTrackerData(retaining retained: TrackerState = .empty) throws {
        try prepareDirectory()
        guard retained == settingsOnlyState(from: retained) else {
            throw PersistenceError.invalidEnvelope
        }
        let bytes = try encodedEnvelope(for: retained)
        try bytes.write(to: eraseIntentURL, options: [.atomic])
        try applyLocalOnlyProtection(to: eraseIntentURL)
        guard (try? decodeState(from: eraseIntentURL)) == retained else {
            throw PersistenceError.invalidEnvelope
        }
        try checkpoint(.erasureIntentCommitted)
        try completeErasure(retaining: retained)
    }

    func hasPendingErasureIntent() -> Bool {
        fileManager.fileExists(atPath: eraseIntentURL.path)
    }

    private func restorePrimary(from candidate: URL, expected state: TrackerState, preserveDamagedPrimary: Bool) throws {
        if candidate.standardizedFileURL != recoveryURL.standardizedFileURL {
            try? fileManager.removeItem(at: recoveryURL)
            try fileManager.copyItem(at: candidate, to: recoveryURL)
            try applyLocalOnlyProtection(to: recoveryURL)
        }
        guard (try? decodeState(from: recoveryURL)) == state else {
            try? fileManager.removeItem(at: recoveryURL)
            throw PersistenceError.invalidEnvelope
        }
        try checkpoint(.recoveryStaged)
        if preserveDamagedPrimary {
            let corrupt = directory.appendingPathComponent("tracker-state.corrupt-\(UUID().uuidString).json")
            try? fileManager.copyItem(at: primaryURL, to: corrupt)
            try? applyLocalOnlyProtection(to: corrupt)
        }
        do {
            if fileManager.fileExists(atPath: primaryURL.path) {
                _ = try fileManager.replaceItemAt(primaryURL, withItemAt: recoveryURL)
            } else {
                try fileManager.moveItem(at: recoveryURL, to: primaryURL)
            }
            try checkpoint(.recoveryCommitted)
        } catch {
            guard (try? decodeState(from: primaryURL)) == state else {
                // A pre-commit failure must leave the verified recovery stage intact.
                throw error
            }
            try? fileManager.removeItem(at: recoveryURL)
        }
        guard (try? decodeState(from: primaryURL)) == state else {
            throw PersistenceError.invalidEnvelope
        }
    }

    private func decodeState(from url: URL) throws -> TrackerState {
        let bytes = try Data(contentsOf: url)
        guard bytes.count <= 25_000_000 else { throw PersistenceError.invalidEnvelope }
        let envelope = try decoder.decode(StateEnvelope.self, from: bytes)
        guard envelope.formatVersion == 1 else { throw PersistenceError.invalidEnvelope }
        guard envelope.payload.count <= 18_000_000 else { throw PersistenceError.invalidEnvelope }
        let digest = SHA256.hash(data: envelope.payload).map { String(format: "%02x", $0) }.joined()
        guard digest == envelope.sha256 else { throw PersistenceError.invalidEnvelope }
        let state = try decoder.decode(TrackerState.self, from: envelope.payload)
        guard state.schemaVersion == 1 else { throw PersistenceError.invalidEnvelope }
        do {
            try state.validate()
        } catch {
            throw PersistenceError.invalidEnvelope
        }
        return state
    }

    private func encodedEnvelope(for state: TrackerState) throws -> Data {
        try state.validate()
        let payload = try encoder.encode(state)
        guard payload.count <= 18_000_000 else { throw PersistenceError.invalidEnvelope }
        let digest = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        let envelope = StateEnvelope(formatVersion: 1, payload: payload, sha256: digest)
        let bytes = try encoder.encode(envelope)
        guard bytes.count <= 25_000_000 else { throw PersistenceError.invalidEnvelope }
        return bytes
    }

    private func settingsOnlyState(from source: TrackerState) -> TrackerState {
        var retained = TrackerState.empty
        retained.language = source.language
        retained.program = source.program
        retained.acceptedLegalVersion = source.acceptedLegalVersion
        retained.onboardingComplete = source.onboardingComplete
        return retained
    }

    private func completeErasure(retaining retained: TrackerState) throws {
        let names = try fileManager.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasPrefix("tracker-state") && $0 != eraseIntentURL.lastPathComponent }
        for name in names {
            try fileManager.removeItem(at: directory.appendingPathComponent(name))
            try checkpoint(.erasureArtifactRemoved)
        }
        let leftovers = try fileManager.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasPrefix("tracker-state") && $0 != eraseIntentURL.lastPathComponent }
        guard leftovers.isEmpty else { throw PersistenceError.unrecoverable }

        let bytes = try encodedEnvelope(for: retained)
        try bytes.write(to: pendingURL, options: [.atomic])
        try applyLocalOnlyProtection(to: pendingURL)
        guard (try? decodeState(from: pendingURL)) == retained else {
            throw PersistenceError.invalidEnvelope
        }
        try fileManager.moveItem(at: pendingURL, to: primaryURL)
        try checkpoint(.erasurePrimaryCommitted)
        guard (try? decodeState(from: primaryURL)) == retained else {
            throw PersistenceError.invalidEnvelope
        }
        try fileManager.removeItem(at: eraseIntentURL)
    }

    private func backupCandidates() throws -> [URL] {
        let urls = try fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ).filter {
            $0.lastPathComponent.hasPrefix("tracker-state.backup-") && $0.pathExtension == "json"
        }
        return urls.sorted {
            let lhs = backupSortKey($0)
            let rhs = backupSortKey($1)
            if lhs == rhs { return $0.lastPathComponent > $1.lastPathComponent }
            return lhs > rhs
        }
    }

    private func backupStagingCandidates() throws -> [URL] {
        try fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ).filter { $0.lastPathComponent.hasPrefix("tracker-state.snapshot-staging-") }
    }

    private func removeBackupStagingFiles() throws {
        for url in try backupStagingCandidates() {
            try fileManager.removeItem(at: url)
        }
    }

    private func backupSortKey(_ url: URL) -> Int64 {
        guard let value = backupGeneration(url) else { return Int64.min }
        return value <= 5 ? -value : value
    }

    private func backupGeneration(_ url: URL) -> Int64? {
        let prefix = "tracker-state.backup-"
        let stem = url.deletingPathExtension().lastPathComponent
        let component = stem.dropFirst(prefix.count).split(separator: "-").first ?? ""
        return Int64(component)
    }

    private func pruneBackups() throws {
        for url in try backupCandidates().dropFirst(5) {
            try fileManager.removeItem(at: url)
        }
    }

    private func prepareDirectory() throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try applyLocalOnlyProtection(to: directory)
    }

    private func applyLocalOnlyProtection(to url: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableURL = url
        try mutableURL.setResourceValues(values)
        try? fileManager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
    }
}
