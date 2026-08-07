import Foundation

enum AppLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
    case english
    case spanish

    var id: String { rawValue }
}

enum BenefitProgram: String, Codable, CaseIterable, Identifiable, Sendable {
    case snapEbt
    case pan

    var id: String { rawValue }
}

enum Eligibility: String, Codable, CaseIterable, Identifiable, Sendable {
    case eligible
    case notEligible
    case unsure

    var id: String { rawValue }
}

struct BenefitCard: Codable, Identifiable, Equatable, Sendable {
    var id: UUID = UUID()
    var name: String
    var balanceCents: Int
    var colorIndex: Int = 0
}

struct GroceryItem: Codable, Identifiable, Equatable, Sendable {
    var id: UUID = UUID()
    var name: String
    var quantity: Int
    var unitPriceCents: Int
    var eligibility: Eligibility

    var totalCents: Int { quantity * unitPriceCents }
    var eligibleCents: Int { eligibility == .eligible ? totalCents : 0 }
    var notEligibleCents: Int { eligibility == .notEligible ? totalCents : 0 }
    var unsureCents: Int { eligibility == .unsure ? totalCents : 0 }
}

struct Purchase: Codable, Identifiable, Equatable, Sendable {
    var id: UUID = UUID()
    var store: String
    var cardID: UUID?
    var cardName: String
    var completedAt: Date
    var items: [GroceryItem]
    var deductedEligibleCents: Int

    var totalCents: Int { items.reduce(0) { $0 + $1.totalCents } }
    var eligibleCents: Int { items.reduce(0) { $0 + $1.eligibleCents } }
    var notEligibleCents: Int { items.reduce(0) { $0 + $1.notEligibleCents } }
    var unsureCents: Int { items.reduce(0) { $0 + $1.unsureCents } }
}

struct BenefitAdjustment: Codable, Identifiable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case receipt, reversal }

    var id: UUID = UUID()
    var cardID: UUID
    var cardName: String
    var amountCents: Int
    var createdAt: Date
    var kind: Kind
    var reversesAdjustmentID: UUID?
}

struct TrackerState: Codable, Equatable, Sendable {
    var schemaVersion: Int = 1
    var onboardingComplete = false
    var language: AppLanguage = .english
    var program: BenefitProgram = .snapEbt
    var acceptedLegalVersion: String?
    var cards: [BenefitCard] = []
    var activeCardID: UUID?
    var basket: [GroceryItem] = []
    var draftStore = ""
    var purchases: [Purchase] = []
    var benefitAdjustments: [BenefitAdjustment] = []
    var learnedEligibility: [String: Eligibility] = [:]
    var savedStores: [String] = []
    var historyDetailViews = 0
    var lastInterstitialAt: Date?

    static let empty = TrackerState()

    func validate() throws {
        guard schemaVersion == 1,
              cards.count <= 20,
              basket.count <= 200,
              purchases.count <= 10_000,
              purchases.reduce(0) { $0 + $1.items.count } <= 20_000,
              benefitAdjustments.count <= 20_000,
              learnedEligibility.count <= 20_000,
              savedStores.count <= 10_000,
              historyDetailViews >= 0,
              draftStore.count <= 80,
              !onboardingComplete || acceptedLegalVersion != nil else {
            throw StateValidationError.invalidState
        }

        guard Set(cards.map(\.id)).count == cards.count,
              Set(cards.map { $0.name.normalizedItemKey }).count == cards.count,
              cards.allSatisfy({
                  let name = $0.name.trimmingCharacters(in: .whitespacesAndNewlines)
                  return !name.isEmpty && name.count <= 40
                      && (0...Money.maximumCents).contains($0.balanceCents)
                      && (0..<5).contains($0.colorIndex)
              }) else {
            throw StateValidationError.invalidState
        }
        if let activeCardID {
            guard cards.contains(where: { $0.id == activeCardID }) else {
                throw StateValidationError.invalidState
            }
        }

        guard validateItems(basket),
              Set(basket.map(\.id)).count == basket.count,
              Set(purchases.map(\.id)).count == purchases.count,
              purchases.allSatisfy({ purchase in
                  let store = purchase.store.trimmingCharacters(in: .whitespacesAndNewlines)
                  let cardName = purchase.cardName.trimmingCharacters(in: .whitespacesAndNewlines)
                  return !store.isEmpty && store.count <= 80
                      && !cardName.isEmpty && cardName.count <= 40
                      && !purchase.items.isEmpty && purchase.items.count <= 200
                      && validateItems(purchase.items)
                      && Set(purchase.items.map(\.id)).count == purchase.items.count
                      && purchase.deductedEligibleCents == purchase.items.reduce(0) { $0 + $1.eligibleCents }
                      && (0...Money.maximumCents).contains(purchase.deductedEligibleCents)
              }) else {
            throw StateValidationError.invalidState
        }

        let adjustmentIDs = Set(benefitAdjustments.map(\.id))
        guard adjustmentIDs.count == benefitAdjustments.count,
              benefitAdjustments.allSatisfy({
                  !$0.cardName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                      && $0.cardName.count <= 40
                      && $0.amountCents != 0
                      && (-Money.maximumCents...Money.maximumCents).contains($0.amountCents)
              }) else {
            throw StateValidationError.invalidState
        }
        let receipts = Dictionary(uniqueKeysWithValues: benefitAdjustments
            .filter { $0.kind == .receipt }
            .map { ($0.id, $0) })
        var reversedReceiptIDs = Set<UUID>()
        for adjustment in benefitAdjustments {
            switch adjustment.kind {
            case .receipt:
                guard adjustment.amountCents > 0, adjustment.reversesAdjustmentID == nil else {
                    throw StateValidationError.invalidState
                }
            case .reversal:
                guard adjustment.amountCents < 0,
                      let receiptID = adjustment.reversesAdjustmentID,
                      let receipt = receipts[receiptID],
                      receipt.cardID == adjustment.cardID,
                      receipt.amountCents == -adjustment.amountCents,
                      reversedReceiptIDs.insert(receiptID).inserted else {
                    throw StateValidationError.invalidState
                }
            }
        }

        guard learnedEligibility.keys.allSatisfy({ !$0.isEmpty && $0.count <= 80 }),
              savedStores.allSatisfy({
                  let value = $0.trimmingCharacters(in: .whitespacesAndNewlines)
                  return !value.isEmpty && value.count <= 80
              }),
              Set(savedStores.map(\.normalizedItemKey)).count == savedStores.count else {
            throw StateValidationError.invalidState
        }
    }

    private func validateItems(_ items: [GroceryItem]) -> Bool {
        items.allSatisfy { item in
            let name = item.name.trimmingCharacters(in: .whitespacesAndNewlines)
            return !name.isEmpty && name.count <= 80
                && (1...99).contains(item.quantity)
                && (1...Money.maximumCents).contains(item.unitPriceCents)
                && item.unitPriceCents <= Money.maximumCents / item.quantity
        }
    }
}

enum StateValidationError: Error {
    case invalidState
}

struct BasketTotals: Equatable, Sendable {
    let total: Int
    let eligible: Int
    let notEligible: Int
    let unsure: Int

    init(items: [GroceryItem]) {
        total = items.reduce(0) { $0 + $1.totalCents }
        eligible = items.reduce(0) { $0 + $1.eligibleCents }
        notEligible = items.reduce(0) { $0 + $1.notEligibleCents }
        unsure = items.reduce(0) { $0 + $1.unsureCents }
    }
}

enum Money {
    static let maximumCents = 99_999_999

    static func parseCents(_ raw: String) -> Int? {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: "US", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: " ", with: "")
        if value.contains(",") && !value.contains(".") {
            value = value.replacingOccurrences(of: ",", with: ".")
        } else {
            value = value.replacingOccurrences(of: ",", with: "")
        }
        guard !value.isEmpty,
              value.range(of: #"^\d{1,8}(\.\d{0,2})?$"#, options: .regularExpression) != nil else {
            return nil
        }
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard let whole = Int(parts[0]) else { return nil }
        let fractional: Int
        if parts.count == 1 || parts[1].isEmpty {
            fractional = 0
        } else if parts[1].count == 1 {
            fractional = (Int(parts[1]) ?? 0) * 10
        } else {
            fractional = Int(parts[1]) ?? 0
        }
        let cents = whole * 100 + fractional
        return cents <= maximumCents ? cents : nil
    }

    static func format(_ cents: Int, language: AppLanguage = .english) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.locale = Locale(identifier: language == .spanish ? "es_PR" : "en_US")
        return formatter.string(from: NSNumber(value: Double(cents) / 100.0)) ?? "$0.00"
    }
}

enum DateRanges {
    static func inclusiveDays(_ first: Date, _ second: Date, calendar: Calendar = .current) -> DateInterval? {
        let lower = min(first, second)
        let upper = max(first, second)
        let start = calendar.startOfDay(for: lower)
        guard let end = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: upper)) else {
            return nil
        }
        return DateInterval(start: start, end: end)
    }
}

extension String {
    var normalizedItemKey: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(
                options: [.caseInsensitive, .diacriticInsensitive],
                locale: Locale(identifier: "en_US_POSIX")
            )
            .lowercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }
}
