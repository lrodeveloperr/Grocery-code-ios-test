import Foundation

struct Localizer: Sendable {
    let language: AppLanguage

    func callAsFunction(_ key: String) -> String {
        let table = language == .spanish ? Self.spanish : Self.english
        return table[key] ?? Self.english[key] ?? key
    }

    func programName(_ program: BenefitProgram) -> String {
        switch program {
        case .snapEbt: return language == .spanish ? "SNAP / Tarjeta EBT" : "SNAP / EBT"
        case .pan: return language == .spanish ? "Programa de Asistencia Nutricional (PAN)" : "Nutrition Assistance Program (NAP/PAN)"
        }
    }

    func cardTerm(_ program: BenefitProgram) -> String {
        program == .pan
            ? (language == .spanish ? "Tarjeta de la Familia" : "Family Card")
            : (language == .spanish ? "Tarjeta EBT" : "EBT card")
    }

    func eligibility(_ value: Eligibility) -> String {
        switch value {
        case .eligible: return self("eligible")
        case .notEligible: return self("notEligible")
        case .unsure: return self("unsure")
        }
    }

    func dateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: language == .spanish ? "es_PR" : "en_US")
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    func dateOnly(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: language == .spanish ? "es_PR" : "en_US")
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    private static let english: [String: String] = [
        "appName": "Grocery Benefits Tracker",
        "privateTracker": "Private, local grocery planning",
        "continue": "Continue",
        "language": "Language",
        "program": "Program wording",
        "legalAccept": "I accept the Terms and Privacy Notice",
        "independent": "Independent manual tracker — not affiliated with or endorsed by any government agency, EBT processor, or retailer.",
        "basket": "Basket",
        "wallet": "Wallet",
        "history": "History",
        "reports": "Reports",
        "settings": "Settings",
        "store": "Store",
        "storePlaceholder": "Store name",
        "card": "Card",
        "noCard": "No card selected",
        "item": "Item",
        "itemPlaceholder": "Grocery item",
        "price": "Unit price",
        "quantity": "Quantity",
        "eligible": "Eligible",
        "notEligible": "Not eligible",
        "unsure": "Unsure",
        "addItem": "Add to basket",
        "clear": "Clear basket",
        "complete": "Complete purchase",
        "basketTotal": "Basket total",
        "eligibleTotal": "Eligible total",
        "balanceAfter": "Balance after eligible items",
        "cards": "Cards",
        "addCard": "Add local card",
        "cardName": "Card nickname",
        "openingBalance": "Tracked balance",
        "save": "Save",
        "cancel": "Cancel",
        "benefits": "Record benefits received",
        "amount": "Amount",
        "delete": "Delete",
        "copy": "Copy into basket",
        "search": "Search store, card or item",
        "noPurchases": "Completed purchases appear here immediately.",
        "monthly": "Monthly",
        "overall": "Overall",
        "custom": "Custom",
        "pdf": "Generate PDF",
        "xlsx": "Generate Excel",
        "testAd": "Google rewarded test-ad simulation",
        "earnReward": "Earn test reward",
        "qaOnly": "QA TEST MODE — no ad request or charge is made.",
        "languageSetting": "App language",
        "programSetting": "Program wording",
        "privacy": "Privacy Notice",
        "terms": "Terms and Conditions",
        "erase": "Erase tracker data",
        "about": "About this tracker",
        "noSecrets": "Never enter a card number, PIN, government login, or other secret.",
        "recoveryLocked": "Local data needs recovery",
        "recoveryHelp": "The app did not replace damaged data with an empty tracker. Reinstall only if you accept losing local records.",
        "done": "Done",
        "ok": "OK",
        "useCard": "Use card",
        "start": "Start",
        "end": "End",
        "filters": "Filters",
        "all": "All",
        "dateFilter": "Date",
        "cardFilter": "Card filter",
        "storeFilter": "Store filter",
        "eligibilityFilter": "Eligibility filter",
        "thisMonth": "This month",
        "customRange": "Custom range",
        "noMatches": "No purchases match these filters.",
        "reverse": "Reverse benefit receipt",
        "confirmReverse": "Reverse this benefit receipt and subtract it from the tracked balance?",
        "testAdLabel": "TEST AD",
        "testInterstitialLabel": "TEST INTERSTITIAL",
        "testBannerLabel": "TEST BANNER",
        "testCadence": "Appears only after every third closed purchase detail and is capped at once every 30 minutes.",
        "bannerAccessibility": "Local QA test banner. No network ad request.",
        "priceError": "Enter a valid price with no more than two decimal places.",
        "balanceError": "Enter a valid non-negative balance.",
        "amountError": "Enter a valid amount.",
        "deductionMessage": "will be deducted from the tracked card balance."
    ]

    private static let spanish: [String: String] = [
        "appName": "Control de Beneficios de Comestibles",
        "privateTracker": "Planificación privada y local de compras",
        "continue": "Continuar",
        "language": "Idioma",
        "program": "Terminología del programa",
        "legalAccept": "Acepto los Términos y el Aviso de privacidad",
        "independent": "Registro manual independiente; no está afiliado ni respaldado por una agencia gubernamental, procesador de EBT o comercio.",
        "basket": "Canasta",
        "wallet": "Billetera",
        "history": "Historial",
        "reports": "Informes",
        "settings": "Ajustes",
        "store": "Tienda",
        "storePlaceholder": "Nombre de la tienda",
        "card": "Tarjeta",
        "noCard": "Ninguna tarjeta seleccionada",
        "item": "Artículo",
        "itemPlaceholder": "Artículo de comestibles",
        "price": "Precio unitario",
        "quantity": "Cantidad",
        "eligible": "Elegible",
        "notEligible": "No elegible",
        "unsure": "No estoy seguro",
        "addItem": "Añadir a la canasta",
        "clear": "Vaciar canasta",
        "complete": "Completar compra",
        "basketTotal": "Total de la canasta",
        "eligibleTotal": "Total elegible",
        "balanceAfter": "Saldo después de artículos elegibles",
        "cards": "Tarjetas",
        "addCard": "Añadir tarjeta local",
        "cardName": "Apodo de la tarjeta",
        "openingBalance": "Saldo registrado",
        "save": "Guardar",
        "cancel": "Cancelar",
        "benefits": "Registrar beneficios recibidos",
        "amount": "Cantidad",
        "delete": "Eliminar",
        "copy": "Copiar a la canasta",
        "search": "Buscar tienda, tarjeta o artículo",
        "noPurchases": "Las compras completadas aparecen aquí de inmediato.",
        "monthly": "Mensual",
        "overall": "Total",
        "custom": "Personalizado",
        "pdf": "Generar PDF",
        "xlsx": "Generar Excel",
        "testAd": "Simulación de anuncio de prueba recompensado de Google",
        "earnReward": "Obtener recompensa de prueba",
        "qaOnly": "MODO DE PRUEBA QA: no se solicita un anuncio ni se realiza un cargo.",
        "languageSetting": "Idioma de la aplicación",
        "programSetting": "Terminología del programa",
        "privacy": "Aviso de privacidad",
        "terms": "Términos y condiciones",
        "erase": "Borrar datos del registro",
        "about": "Acerca de este registro",
        "noSecrets": "Nunca ingrese un número de tarjeta, PIN, acceso gubernamental u otro secreto.",
        "recoveryLocked": "Los datos locales necesitan recuperación",
        "recoveryHelp": "La aplicación no sustituyó datos dañados por un registro vacío. Reinstale solo si acepta perder los registros locales.",
        "done": "Listo",
        "ok": "Aceptar",
        "useCard": "Usar tarjeta",
        "start": "Inicio",
        "end": "Fin",
        "filters": "Filtros",
        "all": "Todos",
        "dateFilter": "Fecha",
        "cardFilter": "Filtro de tarjeta",
        "storeFilter": "Filtro de tienda",
        "eligibilityFilter": "Filtro de elegibilidad",
        "thisMonth": "Este mes",
        "customRange": "Rango personalizado",
        "noMatches": "Ninguna compra coincide con estos filtros.",
        "reverse": "Revertir recibo de beneficios",
        "confirmReverse": "¿Desea revertir este recibo de beneficios y restarlo del saldo registrado?",
        "testAdLabel": "ANUNCIO DE PRUEBA",
        "testInterstitialLabel": "INTERSTICIAL DE PRUEBA",
        "testBannerLabel": "BANNER DE PRUEBA",
        "testCadence": "Aparece solo después de cada tercer detalle de compra cerrado y como máximo una vez cada 30 minutos.",
        "bannerAccessibility": "Banner local de prueba QA. No se solicita un anuncio por la red.",
        "priceError": "Ingrese un precio válido con un máximo de dos decimales.",
        "balanceError": "Ingrese un saldo válido que no sea negativo.",
        "amountError": "Ingrese un importe válido.",
        "deductionMessage": "se descontará del saldo registrado de la tarjeta."
    ]
}
