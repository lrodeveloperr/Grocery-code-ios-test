import Combine
import Foundation

@MainActor
final class TrackerStore: ObservableObject {
    @Published private(set) var state: TrackerState
    @Published var alertMessage: String?
    @Published private(set) var isLocked = false
    @Published private(set) var recoveryMessage: String?
    @Published private(set) var isErasing = false

    private let persistence: StatePersistence
    private let exportCoordinator: ExportCoordinator
    private var deferredSaveTask: Task<Void, Never>?
    private var dataGeneration: UInt64 = 0

    init(
        persistence: StatePersistence = StatePersistence(),
        exportCoordinator: ExportCoordinator = ExportCoordinator()
    ) {
        self.persistence = persistence
        self.exportCoordinator = exportCoordinator
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-qa-ui-test-reset") {
            try? persistence.eraseTrackerData()
        }
        #endif
        try? ExportService.removeTemporaryReports()
        do {
            let result = try persistence.load()
            state = result.state
            recoveryMessage = result.recoveredBackup
                ? (result.state.language == .spanish ? "Se restauró una copia local válida." : "A valid local backup was restored.")
                : nil
        } catch {
            state = .empty
            isLocked = true
            recoveryMessage = error.localizedDescription
        }
    }

    var activeCard: BenefitCard? {
        guard let id = state.activeCardID else { return nil }
        return state.cards.first { $0.id == id }
    }

    var basketTotals: BasketTotals { BasketTotals(items: state.basket) }

    @discardableResult
    private func commit(_ mutation: (inout TrackerState) throws -> Void) -> Bool {
        guard !isLocked, !isErasing else { return false }
        deferredSaveTask?.cancel()
        deferredSaveTask = nil
        var candidate = state
        do {
            try mutation(&candidate)
            try persistence.save(candidate)
            state = candidate
            return true
        } catch {
            alertMessage = localizedError(error, language: candidate.language)
            return false
        }
    }

    func dismissRecoveryMessage() {
        recoveryMessage = nil
    }

    func finishOnboarding(language: AppLanguage, program: BenefitProgram) {
        _ = commit {
            $0.language = language
            $0.program = program
            $0.acceptedLegalVersion = "2026-08-07-v1"
            $0.onboardingComplete = true
        }
    }

    func setLanguage(_ language: AppLanguage) {
        _ = commit { $0.language = language }
    }

    func setProgram(_ program: BenefitProgram) {
        _ = commit { $0.program = program }
    }

    func updateStore(_ store: String) {
        guard !isLocked, !isErasing else { return }
        var value = store.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        if value.count > 80 { value = String(value.prefix(80)) }
        state.draftStore = value
        deferredSaveTask?.cancel()
        deferredSaveTask = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 600_000_000) } catch { return }
            guard !Task.isCancelled, let self else { return }
            self.deferredSaveTask = nil
            do {
                try self.persistence.save(self.state)
            } catch {
                self.alertMessage = self.localizedError(error)
            }
        }
    }

    func flushDeferredChanges() {
        guard deferredSaveTask != nil, !isLocked, !isErasing else { return }
        deferredSaveTask?.cancel()
        deferredSaveTask = nil
        do {
            try persistence.save(state)
        } catch {
            alertMessage = localizedError(error)
        }
    }

    func selectCard(_ id: UUID?) {
        _ = commit { candidate in
            candidate.activeCardID = candidate.cards.contains { $0.id == id } ? id : nil
        }
    }

    func addCard(name rawName: String, balanceCents: Int) -> Bool {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 40, (0...Money.maximumCents).contains(balanceCents) else {
            alertMessage = text("Enter a nickname and a valid non-negative balance.", "Ingrese un apodo y un saldo válido que no sea negativo.")
            return false
        }
        guard !state.cards.contains(where: { $0.name.normalizedItemKey == name.normalizedItemKey }) else {
            alertMessage = text("Use a different card nickname.", "Use un apodo diferente para la tarjeta.")
            return false
        }
        guard state.cards.count < 20 else {
            alertMessage = text("This QA build supports up to 20 local cards.", "Esta versión QA admite hasta 20 tarjetas locales.")
            return false
        }
        return commit { candidate in
            let card = BenefitCard(name: name, balanceCents: balanceCents, colorIndex: candidate.cards.count % 5)
            candidate.cards.append(card)
            candidate.activeCardID = card.id
        }
    }

    func deleteCard(_ id: UUID) {
        _ = commit { candidate in
            candidate.cards.removeAll { $0.id == id }
            if candidate.activeCardID == id { candidate.activeCardID = candidate.cards.first?.id }
        }
    }

    func recordBenefits(cardID: UUID, amountCents: Int) -> Bool {
        guard amountCents > 0 else {
            alertMessage = text("Enter an amount greater than zero.", "Ingrese un importe mayor que cero.")
            return false
        }
        guard state.benefitAdjustments.count < 20_000 else {
            alertMessage = text("The local benefit history limit was reached.", "Se alcanzó el límite del historial local de beneficios.")
            return false
        }
        return commit { candidate in
            guard let index = candidate.cards.firstIndex(where: { $0.id == cardID }) else {
                throw TrackerError.cardMissing
            }
            let newBalance = candidate.cards[index].balanceCents + amountCents
            guard newBalance <= Money.maximumCents else { throw TrackerError.amountTooLarge }
            candidate.cards[index].balanceCents = newBalance
            candidate.benefitAdjustments.insert(
                BenefitAdjustment(
                    cardID: cardID,
                    cardName: candidate.cards[index].name,
                    amountCents: amountCents,
                    createdAt: Date(),
                    kind: .receipt,
                    reversesAdjustmentID: nil
                ),
                at: 0
            )
        }
    }

    func reverseBenefit(_ adjustmentID: UUID) -> Bool {
        guard state.benefitAdjustments.count < 20_000 else {
            alertMessage = text("The local benefit history limit was reached.", "Se alcanzó el límite del historial local de beneficios.")
            return false
        }
        return commit { candidate in
            guard let adjustment = candidate.benefitAdjustments.first(where: { $0.id == adjustmentID && $0.kind == .receipt }) else {
                throw TrackerError.adjustmentMissing
            }
            guard !candidate.benefitAdjustments.contains(where: { $0.reversesAdjustmentID == adjustmentID }) else {
                throw TrackerError.alreadyReversed
            }
            guard let cardIndex = candidate.cards.firstIndex(where: { $0.id == adjustment.cardID }) else {
                throw TrackerError.cardMissing
            }
            guard candidate.cards[cardIndex].balanceCents >= adjustment.amountCents else {
                throw TrackerError.insufficientBalanceForReversal
            }
            candidate.cards[cardIndex].balanceCents -= adjustment.amountCents
            candidate.benefitAdjustments.insert(
                BenefitAdjustment(
                    cardID: adjustment.cardID,
                    cardName: adjustment.cardName,
                    amountCents: -adjustment.amountCents,
                    createdAt: Date(),
                    kind: .reversal,
                    reversesAdjustmentID: adjustmentID
                ),
                at: 0
            )
        }
    }

    func addItem(name rawName: String, quantity: Int, unitPriceCents: Int, eligibility: Eligibility) -> Bool {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80 else {
            alertMessage = text("Enter an item name of 80 characters or fewer.", "Ingrese un artículo de 80 caracteres o menos.")
            return false
        }
        guard (1...99).contains(quantity),
              (1...Money.maximumCents).contains(unitPriceCents),
              unitPriceCents <= Money.maximumCents / quantity,
              state.basket.count < 200 else {
            alertMessage = text("Enter a valid quantity and unit price.", "Ingrese una cantidad y un precio unitario válidos.")
            return false
        }
        let itemKey = name.normalizedItemKey
        guard state.learnedEligibility[itemKey] != nil || state.learnedEligibility.count < 20_000 else {
            alertMessage = text("The local classification limit was reached.", "Se alcanzó el límite de clasificaciones locales.")
            return false
        }
        return commit { candidate in
            candidate.basket.append(
                GroceryItem(name: name, quantity: quantity, unitPriceCents: unitPriceCents, eligibility: eligibility)
            )
            candidate.learnedEligibility[name.normalizedItemKey] = eligibility
        }
    }

    func learnedEligibility(for name: String) -> Eligibility? {
        state.learnedEligibility[name.normalizedItemKey]
    }

    func changeEligibility(itemID: UUID, to eligibility: Eligibility) {
        _ = commit { candidate in
            guard let selected = candidate.basket.first(where: { $0.id == itemID }) else { return }
            let key = selected.name.normalizedItemKey
            for index in candidate.basket.indices where candidate.basket[index].name.normalizedItemKey == key {
                candidate.basket[index].eligibility = eligibility
            }
            candidate.learnedEligibility[key] = eligibility
        }
    }

    func removeItem(_ id: UUID) {
        _ = commit { $0.basket.removeAll { $0.id == id } }
    }

    func clearBasket() {
        _ = commit {
            $0.basket.removeAll()
            $0.draftStore = ""
        }
    }

    func completePurchase(now: Date = Date()) -> Bool {
        let store = state.draftStore.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !store.isEmpty else {
            alertMessage = text("Enter the store name.", "Ingrese el nombre de la tienda.")
            return false
        }
        guard !state.basket.isEmpty else {
            alertMessage = text("Add at least one grocery item.", "Añada al menos un artículo de comestibles.")
            return false
        }
        guard let card = activeCard else {
            alertMessage = text("Add or select a card first.", "Primero añada o seleccione una tarjeta.")
            return false
        }
        let totals = basketTotals
        guard totals.eligible <= card.balanceCents else {
            alertMessage = text("Eligible items exceed the tracked card balance.", "Los artículos elegibles superan el saldo registrado de la tarjeta.")
            return false
        }
        let historicalItemCount = state.purchases.reduce(0) { $0 + $1.items.count }
        guard state.purchases.count < 10_000,
              historicalItemCount + state.basket.count <= 20_000 else {
            alertMessage = text("The local purchase-history limit was reached. Export records before deleting older purchases.", "Se alcanzó el límite del historial local de compras. Exporte los registros antes de eliminar compras anteriores.")
            return false
        }
        let saved = commit { candidate in
            guard let cardIndex = candidate.cards.firstIndex(where: { $0.id == card.id }) else {
                throw TrackerError.cardMissing
            }
            candidate.cards[cardIndex].balanceCents -= totals.eligible
            let purchase = Purchase(
                store: store,
                cardID: card.id,
                cardName: card.name,
                completedAt: now,
                items: candidate.basket,
                deductedEligibleCents: totals.eligible
            )
            candidate.purchases.insert(purchase, at: 0)
            if !candidate.savedStores.contains(where: { $0.normalizedItemKey == store.normalizedItemKey }) {
                candidate.savedStores.append(store)
                candidate.savedStores.sort { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
            }
            candidate.basket.removeAll()
            candidate.draftStore = ""
        }
        if saved { alertMessage = text("Purchase saved. Your balance is updated.", "Compra guardada. Su saldo se actualizó.") }
        return saved
    }

    func deletePurchase(_ id: UUID, refund: Bool) -> Bool {
        commit { candidate in
            guard let index = candidate.purchases.firstIndex(where: { $0.id == id }) else {
                throw TrackerError.purchaseMissing
            }
            let purchase = candidate.purchases[index]
            if refund {
                guard let cardID = purchase.cardID,
                      let cardIndex = candidate.cards.firstIndex(where: { $0.id == cardID }) else {
                    throw TrackerError.cardMissingForRefund
                }
                let restored = candidate.cards[cardIndex].balanceCents + purchase.deductedEligibleCents
                guard restored <= Money.maximumCents else { throw TrackerError.amountTooLarge }
                candidate.cards[cardIndex].balanceCents = restored
            }
            candidate.purchases.remove(at: index)
        }
    }

    func copyPurchaseToBasket(_ id: UUID) -> Bool {
        commit { candidate in
            guard let purchase = candidate.purchases.first(where: { $0.id == id }) else {
                throw TrackerError.purchaseMissing
            }
            candidate.basket = purchase.items.map {
                GroceryItem(name: $0.name, quantity: $0.quantity, unitPriceCents: $0.unitPriceCents, eligibility: $0.eligibility)
            }
            candidate.draftStore = purchase.store
            if let cardID = purchase.cardID, candidate.cards.contains(where: { $0.id == cardID }) {
                candidate.activeCardID = cardID
            }
        }
    }

    func registerHistoryDetailClosed(now: Date = Date()) -> Bool {
        var shouldShow = false
        let saved = commit { candidate in
            candidate.historyDetailViews += 1
            let cooldownPassed = candidate.lastInterstitialAt.map { now.timeIntervalSince($0) >= 1_800 } ?? true
            if candidate.historyDetailViews.isMultiple(of: 3), cooldownPassed {
                candidate.lastInterstitialAt = now
                shouldShow = true
            }
        }
        return saved && shouldShow
    }

    func purchases(from start: Date? = nil, through end: Date? = nil) -> [Purchase] {
        state.purchases.filter { purchase in
            if let start, purchase.completedAt < start { return false }
            if let end, purchase.completedAt > end { return false }
            return true
        }
    }

    func export(
        format: ExportFormat,
        purchases: [Purchase],
        language: AppLanguage,
        report: ExportReportContext
    ) async -> ExportOutcome {
        guard !isLocked, !isErasing else { return .cancelled }
        let expectedDataGeneration = dataGeneration
        let result = await exportCoordinator.export(
            expectedDataGeneration: expectedDataGeneration,
            format: format,
            purchases: purchases,
            language: language,
            report: report
        )
        guard expectedDataGeneration == dataGeneration, !isErasing, !isLocked else {
            if case .success(let url) = result {
                try? ExportService.removeTemporaryReport(at: url)
            }
            return .cancelled
        }
        return result
    }

    func eraseTrackerDataKeepingSettings() async {
        guard !isLocked, !isErasing else { return }
        isErasing = true
        defer { isErasing = false }
        dataGeneration &+= 1
        deferredSaveTask?.cancel()
        deferredSaveTask = nil

        let language = state.language
        let program = state.program
        let legal = state.acceptedLegalVersion
        let onboarded = state.onboardingComplete
        var retained = TrackerState.empty
        retained.language = language
        retained.program = program
        retained.acceptedLegalVersion = legal
        retained.onboardingComplete = onboarded

        await exportCoordinator.closeAndDrain()
        var cleanupFailed = false
        do { try ExportService.removeTemporaryReports() } catch { cleanupFailed = true }
        do {
            try persistence.eraseTrackerData(retaining: retained)
        } catch {
            if persistence.hasPendingErasureIntent() {
                state = retained
                isLocked = true
                recoveryMessage = language == .spanish
                    ? "La intención de borrado se guardó. Reinicie la aplicación para completar la limpieza."
                    : "The erase intent was secured. Restart the app to finish cleanup."
            } else {
                await exportCoordinator.reopen(acceptingDataGeneration: dataGeneration)
            }
            alertMessage = localizedError(error)
            return
        }
        state = retained
        await exportCoordinator.reopen(acceptingDataGeneration: dataGeneration)
        alertMessage = cleanupFailed
            ? (language == .spanish
               ? "Se borraron los datos del registro, pero no se pudo eliminar un informe temporal."
               : "Tracker data was erased, but a temporary report could not be removed.")
            : (language == .spanish ? "Se borraron los datos del registro." : "Tracker data was erased.")
    }

    private func text(_ english: String, _ spanish: String) -> String {
        state.language == .spanish ? spanish : english
    }

    private func localizedError(_ error: Error, language: AppLanguage? = nil) -> String {
        guard (language ?? state.language) == .spanish else { return error.localizedDescription }
        switch error {
        case TrackerError.cardMissing: return "La tarjeta local seleccionada ya no existe."
        case TrackerError.cardMissingForRefund: return "No se puede restaurar el saldo porque la tarjeta local original ya no existe."
        case TrackerError.purchaseMissing: return "La compra guardada ya no existe."
        case TrackerError.adjustmentMissing: return "El recibo de beneficios ya no existe."
        case TrackerError.alreadyReversed: return "Este recibo de beneficios ya fue revertido."
        case TrackerError.insufficientBalanceForReversal: return "El saldo registrado es demasiado bajo para revertir ese recibo."
        case TrackerError.amountTooLarge: return "El importe resultante está fuera del rango permitido."
        case PersistenceError.invalidEnvelope: return "Los datos locales no superaron la validación de integridad."
        case PersistenceError.unrecoverable: return "No se encontró una copia local válida para la recuperación."
        default: return "No se pudo guardar el cambio local."
        }
    }
}

enum TrackerError: LocalizedError {
    case cardMissing
    case cardMissingForRefund
    case purchaseMissing
    case adjustmentMissing
    case alreadyReversed
    case insufficientBalanceForReversal
    case amountTooLarge

    var errorDescription: String? {
        switch self {
        case .cardMissing: return "The selected local card no longer exists."
        case .cardMissingForRefund: return "The balance cannot be restored because the original local card no longer exists."
        case .purchaseMissing: return "The saved purchase no longer exists."
        case .adjustmentMissing: return "The benefit receipt no longer exists."
        case .alreadyReversed: return "This benefit receipt was already reversed."
        case .insufficientBalanceForReversal: return "The tracked balance is too low to reverse that receipt."
        case .amountTooLarge: return "The resulting amount is outside the supported range."
        }
    }
}

enum Catalog {
    static let english: [String] = [
        "Apples", "Bananas", "Oranges", "Grapes", "Strawberries", "Blueberries", "Raspberries", "Blackberries", "Pears", "Peaches",
        "Plums", "Pineapple", "Mangoes", "Watermelon", "Cantaloupe", "Lemons", "Limes", "Avocados", "Tomatoes", "Potatoes",
        "Sweet potatoes", "Onions", "Garlic", "Carrots", "Celery", "Broccoli", "Cauliflower", "Cabbage", "Lettuce", "Spinach",
        "Kale", "Green beans", "Peas", "Corn", "Bell peppers", "Cucumbers", "Zucchini", "Mushrooms", "Fresh herbs", "Frozen vegetables",
        "Frozen fruit", "White rice", "Brown rice", "Pasta", "Spaghetti", "Macaroni", "Flour", "Cornmeal", "Oatmeal", "Breakfast cereal",
        "Granola", "Pancake mix", "Bread", "Whole wheat bread", "Hamburger buns", "Hot dog buns", "Tortillas", "Bagels", "English muffins", "Crackers",
        "Peanut butter", "Almond butter", "Jam", "Honey", "Canned beans", "Black beans", "Kidney beans", "Chickpeas", "Lentils", "Canned tomatoes",
        "Tomato sauce", "Canned corn", "Canned peas", "Canned tuna", "Canned salmon", "Canned chicken", "Soup", "Broth", "Salsa", "Pasta sauce",
        "Eggs", "Milk", "Lactose-free milk", "Soy milk", "Almond milk", "Oat milk", "Yogurt", "Greek yogurt", "Cheddar cheese", "Mozzarella cheese",
        "Cream cheese", "Butter", "Margarine", "Cottage cheese", "Sour cream", "Chicken breast", "Chicken thighs", "Whole chicken", "Ground turkey", "Turkey breast",
        "Ground beef", "Beef roast", "Stew beef", "Pork chops", "Pork loin", "Bacon", "Sausage", "Hot dogs", "Ham", "Fresh fish",
        "Frozen fish", "Shrimp", "Tofu", "Tempeh", "Dried beans", "Nuts", "Walnuts", "Almonds", "Sunflower seeds", "Pumpkin seeds",
        "Raisins", "Dried cranberries", "Popcorn", "Pretzels", "Rice cakes", "Potato chips", "Fruit cups", "Applesauce", "Baby food", "Infant cereal",
        "Infant formula", "Coffee", "Tea", "Bottled water", "Sparkling water", "Fruit juice", "Vegetable juice", "Cocoa powder", "Sugar", "Brown sugar",
        "Salt", "Black pepper", "Cooking oil", "Olive oil", "Vinegar", "Mayonnaise", "Mustard", "Ketchup", "Soy sauce", "Spices"
    ]

    static let puertoRicoSpanish: [String] = [
        "Arroz blanco", "Arroz integral", "Habichuelas", "Gandules", "Harina de maíz", "Avena", "Pan sobao", "Pan integral", "Tortillas", "Pasta",
        "Leche", "Leche sin lactosa", "Huevos", "Queso", "Yogur", "Pollo", "Carne molida", "Cerdo", "Pescado", "Atún enlatado",
        "Plátanos", "Guineos", "Yuca", "Yautía", "Batata", "Papas", "Tomates", "Cebollas", "Ajo", "Pimientos",
        "Lechuga", "Repollo", "Zanahorias", "Aguacates", "Manzanas", "Naranjas", "Mangos", "Piña", "Uvas", "Fresas"
    ]

    static func suggestions(for query: String, language: AppLanguage, savedNames: [String]) -> [String] {
        let q = query.normalizedItemKey
        guard q.count >= 2 else { return [] }
        let source = savedNames + (language == .spanish ? puertoRicoSpanish + english : english)
        var seen = Set<String>()
        return source.filter {
            let key = $0.normalizedItemKey
            return key.contains(q) && seen.insert(key).inserted
        }.prefix(6).map { $0 }
    }
}
