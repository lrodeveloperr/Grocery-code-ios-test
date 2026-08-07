import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var store: TrackerStore

    var body: some View {
        let l = Localizer(language: store.state.language)
        Group {
            if store.isLocked {
                RecoveryLockedView()
            } else if !store.state.onboardingComplete {
                OnboardingView()
            } else {
                MainTabView()
            }
        }
        .alert(l("appName"), isPresented: Binding(
            get: { store.alertMessage != nil },
            set: { if !$0 { store.alertMessage = nil } }
        )) {
            Button(l("ok")) { store.alertMessage = nil }
        } message: {
            Text(store.alertMessage ?? "")
        }
        .environment(\.locale, Locale(identifier: store.state.language == .spanish ? "es_PR" : "en_US"))
    }
}

struct RecoveryLockedView: View {
    @EnvironmentObject private var store: TrackerStore

    var body: some View {
        let l = Localizer(language: store.state.language)
        VStack(spacing: 18) {
            Image(systemName: "externaldrive.badge.exclamationmark")
                .font(.system(size: 52))
                .foregroundStyle(EligibilityPalette.foreground(.unsure))
            Text(l("recoveryLocked")).font(.title2.bold())
            Text(l("recoveryHelp"))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            if let detail = store.recoveryMessage {
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(28)
    }
}

struct OnboardingView: View {
    @EnvironmentObject private var store: TrackerStore
    @State private var language: AppLanguage = .english
    @State private var program: BenefitProgram = .snapEbt
    @State private var accepted = false
    @State private var legalPage: LegalPage?

    var body: some View {
        let l = Localizer(language: language)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 22).fill(AppTheme.mint)
                            Image(systemName: "basket.fill")
                                .font(.system(size: 44, weight: .semibold))
                                .foregroundStyle(AppTheme.green)
                        }
                        .frame(width: 86, height: 86)
                        Text(l("appName")).font(.largeTitle.bold()).foregroundStyle(AppTheme.ink)
                        Text(l("privateTracker")).font(.title3).foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Label(l("language"), systemImage: "globe")
                            .font(.headline)
                        Picker(l("language"), selection: $language) {
                            Text("English").tag(AppLanguage.english)
                            Text("Español (Puerto Rico)").tag(AppLanguage.spanish)
                        }
                        .pickerStyle(.segmented)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Label(l("program"), systemImage: "rectangle.and.hand.point.up.left")
                            .font(.headline)
                        ForEach(BenefitProgram.allCases) { value in
                            Button {
                                program = value
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: program == value ? "checkmark.circle.fill" : "circle")
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(l.programName(value)).font(.headline)
                                        Text(value == .pan
                                             ? (language == .spanish ? "Puerto Rico: PAN y Tarjeta de la Familia" : "Puerto Rico wording")
                                             : (language == .spanish ? "50 estados y Washington D.C." : "50 states and Washington, D.C."))
                                            .font(.caption).foregroundStyle(AppTheme.secondaryOnTint)
                                    }
                                    Spacer()
                                }
                                .padding(14)
                                .background(program == value ? AppTheme.mint : Color(uiColor: .secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text(l("independent")).font(.footnote).foregroundStyle(.secondary)
                        Text(l("noSecrets")).font(.footnote.bold()).foregroundStyle(.secondary)
                        Toggle(l("legalAccept"), isOn: $accepted)
                        HStack {
                            Button(l("terms")) { legalPage = .terms }
                            Spacer()
                            Button(l("privacy")) { legalPage = .privacy }
                        }
                        .font(.subheadline)
                    }
                    .padding(16)
                    .background(Color(uiColor: .secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    Button {
                        store.finishOnboarding(language: language, program: program)
                    } label: {
                        Text(l("continue")).frame(maxWidth: .infinity).padding(.vertical, 5)
                    }
                    .appProminentButtonStyle()
                    .controlSize(.large)
                    .disabled(!accepted)
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .sheet(item: $legalPage) { page in
            LegalTextView(page: page, language: language)
        }
    }
}

enum LegalPage: String, Identifiable {
    case terms, privacy
    var id: String { rawValue }
}

struct LegalTextView: View {
    @Environment(\.dismiss) private var dismiss
    let page: LegalPage
    let language: AppLanguage

    var body: some View {
        let l = Localizer(language: language)
        NavigationStack {
            ScrollView {
                Text(text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
            }
            .navigationTitle(page == .terms ? l("terms") : l("privacy"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(l("done")) { dismiss() }
                }
            }
        }
    }

    private var text: String {
        if language == .spanish {
            return page == .privacy ? Self.privacySpanish : Self.termsSpanish
        }
        return page == .privacy ? Self.privacyEnglish : Self.termsEnglish
    }

    private static let privacyEnglish = """
    Privacy Notice — QA version 1.0.0

    Grocery Benefits Tracker stores the cards you nickname, manually entered balances, grocery items, stores, classifications, purchases, benefit adjustments, and settings only in this application’s protected local storage. The publisher does not operate an account system, custom backend, analytics database, or cloud backup for this QA build.

    Do not enter a card number, PIN, government username, password, or other secret. This app does not need them. Exports leave the app only when you deliberately open the iOS share sheet and choose a destination. The receiving app or service then applies its own privacy practices.

    QA ad surfaces are local simulations. They do not contact an ad network, request an advertising identifier, or profile you. Deleting tracker data removes cards, balances, basket entries, purchases, and benefit activity from this installation while retaining language, program wording, and legal acceptance. Uninstalling removes the app’s local data.

    Support: lrodeveloperr@gmail.com
    Operator: Lateef Razaq-Oyetola, Ontario, Canada
    """

    private static let termsEnglish = """
    Terms and Conditions — QA version 1.0.0

    Grocery Benefits Tracker is an independent manual budgeting tool. It is not affiliated with, endorsed by, sponsored by, or operated by USDA, any state or territorial agency, an EBT processor, a retailer, Apple, or Google.

    The app does not connect to a benefit account, display an official balance, add or transfer benefits, determine official eligibility, process a grocery payment, or guarantee a retailer decision. Eligible, Not eligible, and Unsure are your planning labels, not legal advice. Program rules, retailer systems, receipts, and official records always control.

    You are responsible for entering, reviewing, correcting, exporting, and protecting your information. Keep an independent record when loss would matter. QA ad and purchase simulations cannot charge money. Continued use means you accept these terms.
    """

    private static let privacySpanish = """
    Aviso de privacidad — versión QA 1.0.0

    Control de Beneficios de Comestibles guarda solamente en el almacenamiento local protegido de esta aplicación los apodos de tarjetas, saldos ingresados manualmente, artículos, tiendas, clasificaciones, compras, ajustes y preferencias. El editor no opera cuentas, servidor propio, base de datos analítica ni copia de seguridad en la nube para esta versión QA.

    No ingrese un número de tarjeta, PIN, usuario o contraseña gubernamental ni otro secreto. Las exportaciones salen de la aplicación únicamente cuando usted abre la hoja de compartir de iOS y elige un destino. La aplicación o servicio receptor aplica sus propias prácticas de privacidad.

    Los anuncios QA son simulaciones locales: no contactan una red publicitaria, no solicitan un identificador publicitario y no crean perfiles. Al borrar los datos se eliminan tarjetas, saldos, canasta, compras y actividad de beneficios de esta instalación; se conservan idioma, terminología y aceptación legal. Desinstalar elimina los datos locales.

    Soporte: lrodeveloperr@gmail.com
    Operador: Lateef Razaq-Oyetola, Ontario, Canadá
    """

    private static let termsSpanish = """
    Términos y condiciones — versión QA 1.0.0

    Control de Beneficios de Comestibles es una herramienta independiente de presupuesto manual. No está afiliada, respaldada, patrocinada ni operada por USDA, ninguna agencia estatal o territorial, procesador de EBT, comercio, Apple o Google.

    La aplicación no se conecta a una cuenta de beneficios, no muestra un saldo oficial, no añade ni transfiere beneficios, no determina elegibilidad oficial, no procesa pagos ni garantiza decisiones del comercio. Elegible, No elegible y No estoy seguro son etiquetas de planificación del usuario, no asesoramiento legal. Siempre prevalecen las reglas del programa, sistemas del comercio, recibos y registros oficiales.

    Usted es responsable de ingresar, revisar, corregir, exportar y proteger su información. Mantenga un registro independiente cuando una pérdida sea importante. Las simulaciones QA no pueden cobrar dinero. El uso continuado significa que acepta estos términos.
    """
}

struct MainTabView: View {
    @EnvironmentObject private var store: TrackerStore

    var body: some View {
        let l = Localizer(language: store.state.language)
        let recoveryForeground = EligibilityPalette.foreground(.unsure)
        TabView {
            NavigationStack { BasketView() }
                .tabItem { Label(l("basket"), systemImage: "basket") }
            NavigationStack { WalletView() }
                .tabItem { Label(l("wallet"), systemImage: "wallet.pass") }
            NavigationStack { HistoryView() }
                .tabItem { Label(l("history"), systemImage: "clock.arrow.circlepath") }
            NavigationStack { ReportsView() }
                .tabItem { Label(l("reports"), systemImage: "chart.bar.doc.horizontal") }
            NavigationStack { SettingsView() }
                .tabItem { Label(l("settings"), systemImage: "gearshape") }
        }
        .overlay(alignment: .top) {
            if let recovery = store.recoveryMessage {
                HStack(spacing: 10) {
                    Text(recovery).font(.caption.bold())
                    Button {
                        store.dismissRecoveryMessage()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .accessibilityLabel(l("done"))
                }
                .foregroundStyle(recoveryForeground)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(recoveryForeground.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))
                .padding(.top, 6)
                .accessibilityElement(children: .contain)
            }
        }
    }
}

struct BasketView: View {
    @EnvironmentObject private var store: TrackerStore
    @State private var itemName = ""
    @State private var priceText = ""
    @State private var quantity = 1
    @State private var eligibility: Eligibility = .eligible
    @State private var confirmComplete = false
    @State private var confirmClear = false

    var body: some View {
        let l = Localizer(language: store.state.language)
        List {
            Section {
                TextField(l("storePlaceholder"), text: Binding(
                    get: { store.state.draftStore },
                    set: { store.updateStore($0) }
                ))
                .textInputAutocapitalization(.words)
                .onSubmit { store.flushDeferredChanges() }
                if !store.state.savedStores.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(store.state.savedStores, id: \.self) { saved in
                                Button(saved) { store.updateStore(saved) }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                            }
                        }
                    }
                }
                Picker(l("card"), selection: Binding(
                    get: { store.state.activeCardID },
                    set: { store.selectCard($0) }
                )) {
                    Text(l("noCard")).tag(UUID?.none)
                    ForEach(store.state.cards) { card in
                        Text("\(card.name) — \(Money.format(card.balanceCents, language: store.state.language))")
                            .tag(Optional(card.id))
                    }
                }
            } header: {
                Text(l("store"))
            }

            Section {
                TextField(l("itemPlaceholder"), text: $itemName)
                    .textInputAutocapitalization(.sentences)
                    .onChange(of: itemName) { value in
                        if let learned = store.learnedEligibility(for: value) { eligibility = learned }
                    }
                let savedNames = store.state.purchases.flatMap(\.items).map(\.name)
                let suggestions = Catalog.suggestions(for: itemName, language: store.state.language, savedNames: savedNames)
                if !suggestions.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(suggestions, id: \.self) { suggestion in
                                Button(suggestion) {
                                    itemName = suggestion
                                    eligibility = store.learnedEligibility(for: suggestion) ?? eligibility
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }
                        }
                    }
                }
                HStack {
                    TextField("$0.00", text: $priceText)
                        .keyboardType(.decimalPad)
                        .accessibilityLabel(l("price"))
                    Stepper("\(l("quantity")): \(quantity)", value: $quantity, in: 1...99)
                }
                Picker(l("eligible"), selection: $eligibility) {
                    ForEach(Eligibility.allCases) { value in
                        Text(l.eligibility(value)).tag(value)
                    }
                }
                .pickerStyle(.segmented)
                Button {
                    guard let cents = Money.parseCents(priceText) else {
                        store.alertMessage = l("priceError")
                        return
                    }
                    if store.addItem(name: itemName, quantity: quantity, unitPriceCents: cents, eligibility: eligibility) {
                        itemName = ""
                        priceText = ""
                        quantity = 1
                    }
                } label: {
                    Label(l("addItem"), systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .appProminentButtonStyle()
            } header: {
                Text(l("item"))
            }

            if !store.state.basket.isEmpty {
                Section {
                    ForEach(store.state.basket) { item in
                        BasketItemRow(item: item)
                            .swipeActions {
                                Button(role: .destructive) { store.removeItem(item.id) } label: {
                                    Label(l("delete"), systemImage: "trash")
                                }
                            }
                    }
                } header: {
                    Text("\(l("basket")) (\(store.state.basket.count))")
                }
                Section {
                    TotalsPanel()
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    Button {
                        confirmComplete = true
                    } label: {
                        Label(l("complete"), systemImage: "checkmark.seal.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .appProminentButtonStyle()
                    .controlSize(.large)
                    Button(role: .destructive) { confirmClear = true } label: {
                        Text(l("clear")).frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .navigationTitle(l("basket"))
        .confirmationDialog(l("complete"), isPresented: $confirmComplete, titleVisibility: .visible) {
            Button(l("complete")) { _ = store.completePurchase() }
            Button(l("cancel"), role: .cancel) { }
        } message: {
            Text("\(Money.format(store.basketTotals.eligible, language: store.state.language)) \(l("deductionMessage"))")
        }
        .confirmationDialog(l("clear"), isPresented: $confirmClear, titleVisibility: .visible) {
            Button(l("clear"), role: .destructive) { store.clearBasket() }
            Button(l("cancel"), role: .cancel) { }
        }
    }
}

struct BasketItemRow: View {
    @EnvironmentObject private var store: TrackerStore
    let item: GroceryItem

    var body: some View {
        let l = Localizer(language: store.state.language)
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.name).font(.headline)
                Spacer()
                Text(Money.format(item.totalCents, language: store.state.language)).bold()
            }
            HStack {
                Text("\(item.quantity) × \(Money.format(item.unitPriceCents, language: store.state.language))")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                Menu {
                    ForEach(Eligibility.allCases) { value in
                        Button(l.eligibility(value)) { store.changeEligibility(itemID: item.id, to: value) }
                    }
                } label: {
                    EligibilityBadge(value: item.eligibility, language: store.state.language)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct EligibilityBadge: View {
    let value: Eligibility
    let language: AppLanguage

    var body: some View {
        let l = Localizer(language: language)
        let foreground = EligibilityPalette.foreground(value)
        Text(l.eligibility(value))
            .font(.caption.bold())
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(foreground.opacity(0.15), in: Capsule())
            .foregroundStyle(foreground)
    }
}

enum EligibilityPalette {
    static func foreground(_ value: Eligibility) -> Color {
        Color(uiColor: UIColor { traits in
            uiColor(value, style: traits.userInterfaceStyle)
        })
    }

    static func uiColor(_ value: Eligibility, style: UIUserInterfaceStyle) -> UIColor {
        if style == .dark {
            switch value {
            case .eligible: return UIColor(red: 0.55, green: 0.95, blue: 0.72, alpha: 1)
            case .notEligible: return UIColor(red: 1.00, green: 0.65, blue: 0.68, alpha: 1)
            case .unsure: return UIColor(red: 1.00, green: 0.78, blue: 0.48, alpha: 1)
            }
        }
        switch value {
        case .eligible: return UIColor(red: 0.02, green: 0.25, blue: 0.14, alpha: 1)
        case .notEligible: return UIColor(red: 0.48, green: 0.06, blue: 0.08, alpha: 1)
        case .unsure: return UIColor(red: 0.38, green: 0.20, blue: 0.00, alpha: 1)
        }
    }
}

struct TotalsPanel: View {
    @EnvironmentObject private var store: TrackerStore

    var body: some View {
        let l = Localizer(language: store.state.language)
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(l("basketTotal")).font(.caption).foregroundStyle(AppTheme.secondaryOnTint)
                    Text(Money.format(store.basketTotals.total, language: store.state.language)).font(.title2.bold())
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(l("eligibleTotal")).font(.caption).foregroundStyle(AppTheme.secondaryOnTint)
                    Text(Money.format(store.basketTotals.eligible, language: store.state.language)).font(.title2.bold()).foregroundStyle(AppTheme.green)
                }
            }
            if let card = store.activeCard {
                Divider()
                HStack {
                    Text(l("balanceAfter"))
                    Spacer()
                    Text(Money.format(card.balanceCents - store.basketTotals.eligible, language: store.state.language))
                        .bold()
                        .foregroundStyle(card.balanceCents >= store.basketTotals.eligible
                                         ? AppTheme.green
                                         : EligibilityPalette.foreground(.notEligible))
                }
            }
        }
        .padding(16)
        .background(AppTheme.mint, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct WalletView: View {
    @EnvironmentObject private var store: TrackerStore
    @State private var showingAdd = false
    @State private var benefitCard: BenefitCard?
    @State private var deleteCard: BenefitCard?
    @State private var reverseAdjustment: BenefitAdjustment?

    var body: some View {
        let l = Localizer(language: store.state.language)
        let reversedReceiptIDs = Set(store.state.benefitAdjustments.compactMap(\.reversesAdjustmentID))
        ScrollView {
            LazyVStack(spacing: 14) {
                if store.state.cards.isEmpty {
                    EmptyState(icon: "creditcard", title: l("addCard"), message: l("noSecrets"))
                }
                ForEach(store.state.cards) { card in
                    WalletCardView(card: card, isActive: store.state.activeCardID == card.id) {
                        store.selectCard(card.id)
                    } addBenefits: {
                        benefitCard = card
                    } delete: {
                        deleteCard = card
                    }
                }
                if !store.state.benefitAdjustments.isEmpty {
                    Text(languageText("Benefit activity", "Actividad de beneficios"))
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(store.state.benefitAdjustments) { adjustment in
                        HStack {
                            Image(systemName: adjustment.kind == .receipt ? "arrow.down.circle.fill" : "arrow.uturn.backward.circle.fill")
                                .foregroundStyle(EligibilityPalette.foreground(adjustment.kind == .receipt ? .eligible : .unsure))
                            VStack(alignment: .leading) {
                                Text(adjustment.cardName).font(.subheadline.bold())
                                Text(l.dateTime(adjustment.createdAt)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(Money.format(adjustment.amountCents, language: store.state.language)).bold()
                            if adjustment.kind == .receipt && !reversedReceiptIDs.contains(adjustment.id) {
                                Button { reverseAdjustment = adjustment } label: { Image(systemName: "arrow.uturn.backward") }
                                    .buttonStyle(.borderless)
                                    .accessibilityLabel(l("reverse"))
                            }
                        }
                        .padding(14)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                    }
                }
                TestBannerAd()
            }
            .padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(l("wallet"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAdd = true } label: { Label(l("addCard"), systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) { AddCardSheet() }
        .sheet(item: $benefitCard) { card in RecordBenefitsSheet(card: card) }
        .confirmationDialog(l("delete"), isPresented: Binding(
            get: { deleteCard != nil },
            set: { if !$0 { deleteCard = nil } }
        ), titleVisibility: .visible) {
            Button(l("delete"), role: .destructive) {
                if let id = deleteCard?.id { store.deleteCard(id) }
                deleteCard = nil
            }
            Button(l("cancel"), role: .cancel) { deleteCard = nil }
        } message: {
            Text(languageText("Past purchases keep the card nickname. The tracked balance will be removed.", "Las compras anteriores conservan el apodo. Se eliminará el saldo registrado."))
        }
        .confirmationDialog(l("reverse"), isPresented: Binding(
            get: { reverseAdjustment != nil },
            set: { if !$0 { reverseAdjustment = nil } }
        ), titleVisibility: .visible) {
            Button(l("reverse"), role: .destructive) {
                if let id = reverseAdjustment?.id { _ = store.reverseBenefit(id) }
                reverseAdjustment = nil
            }
            Button(l("cancel"), role: .cancel) { reverseAdjustment = nil }
        } message: {
            Text(l("confirmReverse"))
        }
    }

    private func languageText(_ english: String, _ spanish: String) -> String {
        store.state.language == .spanish ? spanish : english
    }
}

struct WalletCardView: View {
    @EnvironmentObject private var store: TrackerStore
    let card: BenefitCard
    let isActive: Bool
    let select: () -> Void
    let addBenefits: () -> Void
    let delete: () -> Void

    private let gradients: [[Color]] = [
        [Color(red: 0.03, green: 0.28, blue: 0.20), Color(red: 0.02, green: 0.20, blue: 0.15)],
        [Color(red: 0.05, green: 0.22, blue: 0.43), Color(red: 0.03, green: 0.15, blue: 0.31)],
        [Color(red: 0.18, green: 0.18, blue: 0.42), Color(red: 0.12, green: 0.12, blue: 0.31)],
        [Color(red: 0.02, green: 0.29, blue: 0.32), Color(red: 0.01, green: 0.20, blue: 0.23)],
        [Color(red: 0.31, green: 0.17, blue: 0.39), Color(red: 0.22, green: 0.11, blue: 0.29)]
    ]

    var body: some View {
        let l = Localizer(language: store.state.language)
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(l.cardTerm(store.state.program)).font(.caption).opacity(0.85)
                    Text(card.name).font(.title3.bold())
                }
                Spacer()
                if isActive { Image(systemName: "checkmark.circle.fill").font(.title2) }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(l("openingBalance")).font(.caption).opacity(0.85)
                Text(Money.format(card.balanceCents, language: store.state.language)).font(.largeTitle.bold()).monospacedDigit()
            }
            HStack {
                Button(action: select) { Label(isActive ? l("card") : l("useCard"), systemImage: "checkmark") }
                    .buttonStyle(.bordered)
                    .tint(.white)
                Button(action: addBenefits) { Label(l("benefits"), systemImage: "plus") }
                    .buttonStyle(.borderedProminent)
                    .tint(.white)
                    .foregroundStyle(cardColor)
                Spacer()
                Button(role: .destructive, action: delete) { Image(systemName: "trash") }
                    .buttonStyle(.bordered)
                    .tint(.white)
                    .accessibilityLabel(l("delete"))
            }
        }
        .foregroundStyle(.white)
        .padding(18)
        .background(
            LinearGradient(colors: cardGradient, startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 20)
        )
        .shadow(color: cardColor.opacity(0.25), radius: 12, y: 6)
        .accessibilityElement(children: .contain)
    }

    private var cardColor: Color {
        cardGradient[0]
    }

    private var cardGradient: [Color] {
        gradients[min(max(card.colorIndex, 0), gradients.count - 1)]
    }
}

struct AddCardSheet: View {
    @EnvironmentObject private var store: TrackerStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var balance = ""

    var body: some View {
        let l = Localizer(language: store.state.language)
        NavigationStack {
            Form {
                Section {
                    TextField(l("cardName"), text: $name)
                    TextField("$0.00", text: $balance)
                        .keyboardType(.decimalPad)
                        .accessibilityLabel(l("openingBalance"))
                } footer: {
                    Text(l("noSecrets"))
                }
            }
            .navigationTitle(l("addCard"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(l("cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(l("save")) {
                        guard let cents = Money.parseCents(balance) else {
                            store.alertMessage = l("balanceError")
                            return
                        }
                        if store.addCard(name: name, balanceCents: cents) { dismiss() }
                    }
                }
            }
        }
    }
}

struct RecordBenefitsSheet: View {
    @EnvironmentObject private var store: TrackerStore
    @Environment(\.dismiss) private var dismiss
    let card: BenefitCard
    @State private var amount = ""

    var body: some View {
        let l = Localizer(language: store.state.language)
        NavigationStack {
            Form {
                Section(card.name) {
                    Text(Money.format(card.balanceCents, language: store.state.language)).font(.title2.bold())
                    TextField(l("amount"), text: $amount).keyboardType(.decimalPad)
                }
            }
            .navigationTitle(l("benefits"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(l("cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(l("save")) {
                        guard let cents = Money.parseCents(amount) else {
                            store.alertMessage = l("amountError")
                            return
                        }
                        if store.recordBenefits(cardID: card.id, amountCents: cents) { dismiss() }
                    }
                }
            }
        }
    }
}

private enum HistoryDateFilter: String, CaseIterable, Identifiable {
    case all, thisMonth, custom
    var id: String { rawValue }
}

private struct HistoryOption: Identifiable {
    let id: String
    let label: String
}

struct HistoryView: View {
    @EnvironmentObject private var store: TrackerStore
    @State private var query = ""
    @State private var selected: Purchase?
    @State private var showInterstitial = false
    @State private var cardFilter = ""
    @State private var storeFilter = ""
    @State private var eligibilityFilter = ""
    @State private var dateFilter: HistoryDateFilter = .all
    @State private var dateStart = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var dateEnd = Date()

    private var cardOptions: [HistoryOption] {
        var seen = Set<String>()
        return store.state.purchases.compactMap { purchase in
            let key = purchase.cardID?.uuidString ?? "name:\(purchase.cardName.normalizedItemKey)"
            guard seen.insert(key).inserted else { return nil }
            return HistoryOption(id: key, label: purchase.cardName)
        }.sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    private var storeOptions: [HistoryOption] {
        var seen = Set<String>()
        return store.state.purchases.compactMap { purchase in
            let key = purchase.store.normalizedItemKey
            guard seen.insert(key).inserted else { return nil }
            return HistoryOption(id: key, label: purchase.store)
        }.sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    private var dateBounds: (start: Date, endExclusive: Date)? {
        let calendar = Calendar.current
        switch dateFilter {
        case .all:
            return nil
        case .thisMonth:
            guard let interval = calendar.dateInterval(of: .month, for: Date()) else { return nil }
            return (interval.start, interval.end)
        case .custom:
            guard let interval = DateRanges.inclusiveDays(dateStart, dateEnd, calendar: calendar) else { return nil }
            return (interval.start, interval.end)
        }
    }

    private var filtered: [Purchase] {
        let q = query.normalizedItemKey
        return store.state.purchases.filter { purchase in
            let matchesQuery = q.isEmpty
                || purchase.store.normalizedItemKey.contains(q)
                || purchase.cardName.normalizedItemKey.contains(q)
                || purchase.items.contains { $0.name.normalizedItemKey.contains(q) }
            let purchaseCardKey = purchase.cardID?.uuidString ?? "name:\(purchase.cardName.normalizedItemKey)"
            let matchesCard = cardFilter.isEmpty || purchaseCardKey == cardFilter
            let matchesStore = storeFilter.isEmpty || purchase.store.normalizedItemKey == storeFilter
            let matchesEligibility = eligibilityFilter.isEmpty
                || purchase.items.contains { $0.eligibility.rawValue == eligibilityFilter }
            let matchesDate = dateBounds.map {
                purchase.completedAt >= $0.start && purchase.completedAt < $0.endExclusive
            } ?? true
            return matchesQuery && matchesCard && matchesStore && matchesEligibility && matchesDate
        }
    }

    var body: some View {
        let l = Localizer(language: store.state.language)
        List {
            if !store.state.purchases.isEmpty {
                Section {
                    DisclosureGroup {
                        Picker(l("cardFilter"), selection: $cardFilter) {
                            Text(l("all")).tag("")
                            ForEach(cardOptions) { option in Text(option.label).tag(option.id) }
                        }
                        Picker(l("storeFilter"), selection: $storeFilter) {
                            Text(l("all")).tag("")
                            ForEach(storeOptions) { option in Text(option.label).tag(option.id) }
                        }
                        Picker(l("eligibilityFilter"), selection: $eligibilityFilter) {
                            Text(l("all")).tag("")
                            ForEach(Eligibility.allCases) { value in
                                Text(l.eligibility(value)).tag(value.rawValue)
                            }
                        }
                        Picker(l("dateFilter"), selection: $dateFilter) {
                            Text(l("all")).tag(HistoryDateFilter.all)
                            Text(l("thisMonth")).tag(HistoryDateFilter.thisMonth)
                            Text(l("customRange")).tag(HistoryDateFilter.custom)
                        }
                        if dateFilter == .custom {
                            DatePicker(l("start"), selection: $dateStart, displayedComponents: .date)
                            DatePicker(l("end"), selection: $dateEnd, displayedComponents: .date)
                        }
                    } label: {
                        Label(l("filters"), systemImage: "line.3.horizontal.decrease.circle")
                    }
                }
            }
            if store.state.purchases.isEmpty {
                EmptyState(icon: "clock", title: l("noPurchases"), message: "")
                    .listRowBackground(Color.clear)
            } else if filtered.isEmpty {
                EmptyState(icon: "line.3.horizontal.decrease.circle", title: l("noMatches"), message: "")
                    .listRowBackground(Color.clear)
            } else {
                ForEach(filtered) { purchase in
                    Button {
                        selected = purchase
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(purchase.store).font(.headline).foregroundStyle(.primary)
                                Spacer()
                                Text(Money.format(purchase.totalCents, language: store.state.language)).bold().foregroundStyle(.primary)
                            }
                            HStack {
                                Text(l.dateTime(purchase.completedAt))
                                Spacer()
                                Text("\(purchase.items.count) \(l("item").lowercased())")
                            }
                            .font(.caption).foregroundStyle(.secondary)
                            HStack {
                                EligibilityBadge(value: .eligible, language: store.state.language)
                                Text(Money.format(purchase.eligibleCents, language: store.state.language)).font(.caption.bold()).foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .searchable(text: $query, prompt: l("search"))
        .navigationTitle(l("history"))
        .sheet(item: $selected, onDismiss: {
            showInterstitial = store.registerHistoryDetailClosed()
        }) { purchase in
            PurchaseDetailView(purchase: purchase)
        }
        .fullScreenCover(isPresented: $showInterstitial) {
            TestInterstitialAd {
                showInterstitial = false
            }
        }
    }
}

struct PurchaseDetailView: View {
    @EnvironmentObject private var store: TrackerStore
    @Environment(\.dismiss) private var dismiss
    let purchase: Purchase
    @State private var showDelete = false

    var body: some View {
        let l = Localizer(language: store.state.language)
        NavigationStack {
            List {
                Section {
                    LabeledContent(l("store"), value: purchase.store)
                    LabeledContent(l("card"), value: purchase.cardName)
                    LabeledContent(l("basketTotal"), value: Money.format(purchase.totalCents, language: store.state.language))
                    LabeledContent(l("eligibleTotal"), value: Money.format(purchase.eligibleCents, language: store.state.language))
                }
                Section(l("item")) {
                    ForEach(purchase.items) { item in
                        BasketItemRowReadOnly(item: item)
                    }
                }
                Section {
                    Button {
                        if store.copyPurchaseToBasket(purchase.id) { dismiss() }
                    } label: { Label(l("copy"), systemImage: "doc.on.doc") }
                    Button(role: .destructive) { showDelete = true } label: { Label(l("delete"), systemImage: "trash") }
                }
            }
            .navigationTitle(l.dateOnly(purchase.completedAt))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(l("done")) { dismiss() } } }
            .confirmationDialog(l("delete"), isPresented: $showDelete, titleVisibility: .visible) {
                Button(languageText("Delete and restore balance", "Eliminar y restaurar saldo"), role: .destructive) {
                    if store.deletePurchase(purchase.id, refund: true) { dismiss() }
                }
                Button(languageText("Delete without balance change", "Eliminar sin cambiar el saldo"), role: .destructive) {
                    if store.deletePurchase(purchase.id, refund: false) { dismiss() }
                }
                Button(l("cancel"), role: .cancel) { }
            } message: {
                Text(languageText("The eligible amount can be returned only if the original local card still exists.", "El importe elegible solo puede devolverse si la tarjeta local original todavía existe."))
            }
        }
    }

    private func languageText(_ english: String, _ spanish: String) -> String {
        store.state.language == .spanish ? spanish : english
    }
}

struct BasketItemRowReadOnly: View {
    @EnvironmentObject private var store: TrackerStore
    let item: GroceryItem
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(item.name).font(.headline)
                Text("\(item.quantity) × \(Money.format(item.unitPriceCents, language: store.state.language))").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing) {
                Text(Money.format(item.totalCents, language: store.state.language)).bold()
                EligibilityBadge(value: item.eligibility, language: store.state.language)
            }
        }
    }
}

private enum ReportMode: String, CaseIterable, Identifiable {
    case monthly, overall, custom
    var id: String { rawValue }
}

private enum RewardPurpose: String, Identifiable {
    case monthlyUnlock, overallUnlock, pdfExport, xlsxExport
    var id: String { rawValue }
}

private struct SharePayload: Identifiable {
    let id = UUID()
    let url: URL
}

struct ReportsView: View {
    @EnvironmentObject private var store: TrackerStore
    @State private var mode: ReportMode = .monthly
    @State private var customStart = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var customEnd = Date()
    @State private var monthlyUnlocked = false
    @State private var overallRewards = 0
    @State private var rewardPurpose: RewardPurpose?
    @State private var pendingExport: ExportFormat?
    @State private var sharePayload: SharePayload?
    @State private var cleanupURL: URL?
    @State private var isExporting = false

    private var reportBounds: (start: Date, endExclusive: Date, displayEnd: Date)? {
        let calendar = Calendar.current
        switch mode {
        case .overall:
            return nil
        case .monthly:
            guard let interval = calendar.dateInterval(of: .month, for: Date()) else { return nil }
            return (interval.start, interval.end, Date())
        case .custom:
            guard let interval = DateRanges.inclusiveDays(customStart, customEnd, calendar: calendar) else { return nil }
            let displayEnd = calendar.date(byAdding: .day, value: -1, to: interval.end) ?? interval.start
            return (interval.start, interval.end, displayEnd)
        }
    }

    private var selectedPurchases: [Purchase] {
        guard let bounds = reportBounds else { return store.state.purchases }
        return store.state.purchases.filter {
            $0.completedAt >= bounds.start && $0.completedAt < bounds.endExclusive
        }
    }

    private var exportContext: ExportReportContext {
        let language = store.state.language
        switch mode {
        case .overall:
            return .overall(language: language, purchases: selectedPurchases)
        case .monthly:
            return ExportReportContext(
                title: language == .spanish ? "Informe mensual" : "Monthly report",
                start: reportBounds?.start,
                end: reportBounds?.displayEnd
            )
        case .custom:
            return ExportReportContext(
                title: language == .spanish ? "Informe personalizado" : "Custom report",
                start: reportBounds?.start,
                end: reportBounds?.displayEnd
            )
        }
    }

    private var canView: Bool {
        switch mode {
        case .monthly: return monthlyUnlocked
        case .overall: return overallRewards >= 2
        case .custom: return true
        }
    }

    var body: some View {
        let l = Localizer(language: store.state.language)
        ScrollView {
            VStack(spacing: 16) {
                Picker(l("reports"), selection: $mode) {
                    Text(l("monthly")).tag(ReportMode.monthly)
                    Text(l("overall")).tag(ReportMode.overall)
                    Text(l("custom")).tag(ReportMode.custom)
                }
                .pickerStyle(.segmented)

                if mode == .custom {
                    VStack {
                        DatePicker(l("start"), selection: $customStart, displayedComponents: .date)
                        DatePicker(l("end"), selection: $customEnd, displayedComponents: .date)
                    }
                    .padding(16)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                }

                if canView {
                    ReportSummaryCard(purchases: selectedPurchases)
                    if selectedPurchases.isEmpty {
                        EmptyState(icon: "doc.text.magnifyingglass", title: languageText("No purchases in this report", "No hay compras en este informe"), message: "")
                    } else {
                        VStack(spacing: 12) {
                            Button { rewardPurpose = .pdfExport } label: {
                                Label(l("pdf"), systemImage: "doc.richtext").frame(maxWidth: .infinity)
                            }
                            .appProminentButtonStyle()
                            .controlSize(.large)
                            .disabled(isExporting)
                            Button { rewardPurpose = .xlsxExport } label: {
                                Label(l("xlsx"), systemImage: "tablecells").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                            .disabled(isExporting)
                            if isExporting { ProgressView().accessibilityLabel(l("reports")) }
                            Text(languageText("Each export starts one local rewarded-ad simulation. If it cannot complete, no file is shared.", "Cada exportación inicia una simulación local de anuncio recompensado. Si no se completa, no se comparte ningún archivo."))
                                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        }
                    }
                } else {
                    VStack(spacing: 16) {
                        Image(systemName: "play.rectangle.fill").font(.system(size: 42)).foregroundStyle(AppTheme.green)
                        Text(mode == .overall
                             ? languageText("Two test rewards unlock this overall report until you leave.", "Dos recompensas de prueba desbloquean este informe total hasta que salga.")
                             : languageText("One test reward unlocks this monthly report until you leave.", "Una recompensa de prueba desbloquea este informe mensual hasta que salga."))
                            .multilineTextAlignment(.center)
                        if mode == .overall {
                            Text("\(overallRewards) / 2").font(.title2.bold()).monospacedDigit()
                        }
                        Button { rewardPurpose = mode == .overall ? .overallUnlock : .monthlyUnlock } label: {
                            Label(l("earnReward"), systemImage: "play.fill")
                        }
                        .appProminentButtonStyle()
                        .controlSize(.large)
                    }
                    .padding(28)
                    .frame(maxWidth: .infinity)
                    .background(AppTheme.mint, in: RoundedRectangle(cornerRadius: 20))
                }
            }
            .padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(l("reports"))
        .sheet(item: $rewardPurpose, onDismiss: {
            if let pendingExport {
                self.pendingExport = nil
                generate(pendingExport)
            }
        }) { purpose in
            RewardedTestAd {
                switch purpose {
                case .monthlyUnlock: monthlyUnlocked = true
                case .overallUnlock: overallRewards = min(2, overallRewards + 1)
                case .pdfExport: pendingExport = .pdf
                case .xlsxExport: pendingExport = .xlsx
                }
                rewardPurpose = nil
            } cancel: {
                pendingExport = nil
                rewardPurpose = nil
            }
        }
        .sheet(item: $sharePayload, onDismiss: {
            if let cleanupURL { try? ExportService.removeTemporaryReport(at: cleanupURL) }
            cleanupURL = nil
        }) { payload in ShareSheet(items: [payload.url]) }
    }

    private func generate(_ format: ExportFormat) {
        let purchases = selectedPurchases
        let language = store.state.language
        let report = exportContext
        Task { @MainActor in
            isExporting = true
            let result = await store.export(
                format: format,
                purchases: purchases,
                language: language,
                report: report
            )
            isExporting = false
            handleExport(result)
        }
    }

    private func handleExport(_ result: ExportOutcome) {
        switch result {
        case .success(let url):
            cleanupURL = url
            sharePayload = SharePayload(url: url)
        case .failure(let message):
            store.alertMessage = message
        case .cancelled:
            break
        }
    }

    private func languageText(_ english: String, _ spanish: String) -> String {
        store.state.language == .spanish ? spanish : english
    }
}

struct ReportSummaryCard: View {
    @EnvironmentObject private var store: TrackerStore
    let purchases: [Purchase]
    var body: some View {
        let l = Localizer(language: store.state.language)
        let total = purchases.reduce(0) { $0 + $1.totalCents }
        let eligible = purchases.reduce(0) { $0 + $1.eligibleCents }
        let notEligible = purchases.reduce(0) { $0 + $1.notEligibleCents }
        let unsure = purchases.reduce(0) { $0 + $1.unsureCents }
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading) {
                    Text("\(purchases.count)").font(.largeTitle.bold())
                    Text(languageText("Purchases", "Compras")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(Money.format(total, language: store.state.language)).font(.title.bold())
                    Text(l("basketTotal")).font(.caption).foregroundStyle(.secondary)
                }
            }
            Divider()
            Grid(horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow {
                    summary(l("eligible"), eligible, EligibilityPalette.foreground(.eligible))
                    summary(l("notEligible"), notEligible, EligibilityPalette.foreground(.notEligible))
                }
                GridRow {
                    summary(l("unsure"), unsure, EligibilityPalette.foreground(.unsure))
                    summary(languageText("Items", "Artículos"), purchases.flatMap(\.items).count, .primary, money: false)
                }
            }
        }
        .padding(18)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
    }

    private func summary(_ title: String, _ value: Int, _ color: Color, money: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(money ? Money.format(value, language: store.state.language) : "\(value)")
                .font(.headline).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func languageText(_ english: String, _ spanish: String) -> String {
        store.state.language == .spanish ? spanish : english
    }
}

struct RewardedTestAd: View {
    @EnvironmentObject private var store: TrackerStore
    let earned: () -> Void
    let cancel: () -> Void
    @State private var remaining = 3
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        let l = Localizer(language: store.state.language)
        let warningForeground = EligibilityPalette.foreground(.unsure)
        VStack(spacing: 22) {
            HStack {
                Text(l("testAdLabel"))
                    .font(.caption.bold())
                    .foregroundStyle(warningForeground)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(warningForeground.opacity(0.15), in: Capsule())
                Spacer()
                Button(action: cancel) { Image(systemName: "xmark.circle.fill").font(.title2) }
                    .accessibilityLabel(l("cancel"))
            }
            Spacer()
            Image(systemName: "play.rectangle.fill").font(.system(size: 72)).foregroundStyle(AppTheme.green)
            Text(l("testAd")).font(.title2.bold()).multilineTextAlignment(.center)
            Text(l("qaOnly")).foregroundStyle(.secondary).multilineTextAlignment(.center)
            ProgressView(value: Double(3 - remaining), total: 3)
            Text(remaining > 0 ? "\(remaining)" : "✓").font(.largeTitle.bold()).monospacedDigit()
            Button(l("earnReward"), action: earned)
                .appProminentButtonStyle()
                .controlSize(.large)
                .disabled(remaining > 0)
            Spacer()
        }
        .padding(24)
        .interactiveDismissDisabled()
        .onReceive(timer) { _ in if remaining > 0 { remaining -= 1 } }
    }
}

struct TestInterstitialAd: View {
    @EnvironmentObject private var store: TrackerStore
    let dismiss: () -> Void
    @State private var remaining = 3
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        let l = Localizer(language: store.state.language)
        let warningForeground = EligibilityPalette.foreground(.unsure)
        VStack(spacing: 20) {
            HStack {
                Text(l("testInterstitialLabel"))
                    .font(.caption.bold())
                    .foregroundStyle(warningForeground)
                    .padding(6)
                    .background(warningForeground.opacity(0.15), in: Capsule())
                Spacer()
            }
            Spacer()
            Image(systemName: "cart.fill.badge.plus").font(.system(size: 68)).foregroundStyle(AppTheme.green)
            Text(l("qaOnly")).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Text(remaining > 0 ? "\(remaining)" : "✓").font(.largeTitle.bold()).monospacedDigit()
            Button(l("continue"), action: dismiss)
                .appProminentButtonStyle().controlSize(.large).disabled(remaining > 0)
            Spacer()
            Text(l("testCadence"))
                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(24)
        .interactiveDismissDisabled()
        .onReceive(timer) { _ in if remaining > 0 { remaining -= 1 } }
    }
}

struct TestBannerAd: View {
    @EnvironmentObject private var store: TrackerStore
    var body: some View {
        let l = Localizer(language: store.state.language)
        VStack(spacing: 4) {
            Text(l("testBannerLabel")).font(.caption2.bold()).foregroundStyle(.secondary)
            Text(l("qaOnly")).font(.caption).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 54)
        .padding(10)
        .background(Color(uiColor: .tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.quaternary))
        .accessibilityLabel(l("bannerAccessibility"))
    }
}

struct SettingsView: View {
    @EnvironmentObject private var store: TrackerStore
    @State private var legalPage: LegalPage?
    @State private var confirmErase = false

    var body: some View {
        let l = Localizer(language: store.state.language)
        Form {
            Section {
                Picker(l("languageSetting"), selection: Binding(
                    get: { store.state.language },
                    set: { store.setLanguage($0) }
                )) {
                    Text("English").tag(AppLanguage.english)
                    Text("Español (Puerto Rico)").tag(AppLanguage.spanish)
                }
                Picker(l("programSetting"), selection: Binding(
                    get: { store.state.program },
                    set: { store.setProgram($0) }
                )) {
                    ForEach(BenefitProgram.allCases) { value in Text(l.programName(value)).tag(value) }
                }
            }
            Section {
                Button(l("privacy")) { legalPage = .privacy }
                Button(l("terms")) { legalPage = .terms }
            }
            Section {
                Text(l("independent"))
                Text(l("noSecrets")).bold()
                Text(store.state.language == .spanish ? "Versión 1.0.0 (QA)" : "Version 1.0.0 (QA)")
                Text(store.state.language == .spanish ? "Soporte: lrodeveloperr@gmail.com" : "Support: lrodeveloperr@gmail.com")
            } header: {
                Text(l("about"))
            }
            Section {
                Button(l("erase"), role: .destructive) { confirmErase = true }
                    .disabled(store.isErasing)
                if store.isErasing {
                    ProgressView()
                        .accessibilityLabel(l("erase"))
                }
            } footer: {
                Text(store.state.language == .spanish
                     ? "Borra tarjetas, saldos, canasta, compras y actividad. Conserva idioma, programa y aceptación legal."
                     : "Erases cards, balances, basket, purchases, and benefit activity. Keeps language, program, and legal acceptance.")
            }
        }
        .navigationTitle(l("settings"))
        .sheet(item: $legalPage) { page in LegalTextView(page: page, language: store.state.language) }
        .confirmationDialog(l("erase"), isPresented: $confirmErase, titleVisibility: .visible) {
            Button(l("erase"), role: .destructive) {
                Task { await store.eraseTrackerDataKeepingSettings() }
            }
            Button(l("cancel"), role: .cancel) { }
        }
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    let message: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 42)).foregroundStyle(.secondary)
            Text(title).font(.headline).multilineTextAlignment(.center)
            if !message.isEmpty { Text(message).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }
        }
        .frame(maxWidth: .infinity)
        .padding(30)
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) { }
}
