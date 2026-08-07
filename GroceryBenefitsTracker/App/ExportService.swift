import Foundation
import UIKit

enum ExportError: LocalizedError, Sendable {
    case noPurchases(AppLanguage)
    case writeFailed(AppLanguage)

    var errorDescription: String? {
        switch self {
        case .noPurchases(let language):
            return language == .spanish ? "No hay compras disponibles para este informe." : "No purchases are available for this report."
        case .writeFailed(let language):
            return language == .spanish ? "No se pudo crear el archivo del informe." : "The report file could not be created."
        }
    }
}

struct ExportReportContext: Sendable {
    let title: String
    let start: Date?
    let end: Date?

    static func overall(language: AppLanguage, purchases: [Purchase]) -> ExportReportContext {
        ExportReportContext(
            title: language == .spanish ? "Informe total" : "Overall report",
            start: purchases.map(\.completedAt).min(),
            end: purchases.map(\.completedAt).max()
        )
    }
}

enum ExportFormat: Sendable {
    case pdf
    case xlsx
}

enum ExportOutcome: Sendable {
    case success(URL)
    case failure(String)
    case cancelled
}

actor ExportCoordinator {
    private var generation: UInt64 = 0
    private var accepting = true
    private var acceptedDataGeneration: UInt64 = 0
    private var active: [UUID: Task<ExportOutcome, Never>] = [:]

    func export(
        expectedDataGeneration: UInt64,
        format: ExportFormat,
        purchases: [Purchase],
        language: AppLanguage,
        report: ExportReportContext
    ) async -> ExportOutcome {
        await perform(expectedDataGeneration: expectedDataGeneration) {
            guard !Task.isCancelled else { return .cancelled }
            do {
                switch format {
                case .pdf:
                    return .success(try ExportService.makePDF(purchases: purchases, language: language, report: report))
                case .xlsx:
                    return .success(try ExportService.makeXLSX(purchases: purchases, language: language, report: report))
                }
            } catch {
                return .failure(error.localizedDescription)
            }
        }
    }

    func perform(
        expectedDataGeneration: UInt64,
        _ work: @escaping @Sendable () -> ExportOutcome
    ) async -> ExportOutcome {
        guard accepting, expectedDataGeneration == acceptedDataGeneration else {
            return .cancelled
        }
        let id = UUID()
        let startingGeneration = generation
        let task = Task.detached(priority: .userInitiated) {
            guard !Task.isCancelled else { return ExportOutcome.cancelled }
            return work()
        }
        active[id] = task
        let result = await task.value
        active[id] = nil
        guard generation == startingGeneration else {
            discard(result)
            return .cancelled
        }
        return result
    }

    func closeAndDrain() async {
        accepting = false
        generation &+= 1
        let outstanding = active
        for task in outstanding.values { task.cancel() }
        for (id, task) in outstanding {
            let result = await task.value
            discard(result)
            active[id] = nil
        }
    }

    func reopen(acceptingDataGeneration: UInt64) {
        acceptedDataGeneration = acceptingDataGeneration
        accepting = true
    }

    func currentGenerationForTesting() -> UInt64 {
        generation
    }

    private func discard(_ result: ExportOutcome) {
        if case .success(let url) = result {
            try? ExportService.removeTemporaryReport(at: url)
        }
    }
}

enum ExportService {
    private static let reportPrefix = "grocery-benefits-report-"

    static func makePDF(
        purchases: [Purchase],
        language: AppLanguage,
        report: ExportReportContext? = nil
    ) throws -> URL {
        guard !purchases.isEmpty else { throw ExportError.noPurchases(language) }
        let report = report ?? .overall(language: language, purchases: purchases)
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        let localize = Localizer(language: language)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: language == .spanish ? "es_PR" : "en_US")
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        let dateOnlyFormatter = DateFormatter()
        dateOnlyFormatter.locale = formatter.locale
        dateOnlyFormatter.dateStyle = .medium
        dateOnlyFormatter.timeStyle = .none

        let data = renderer.pdfData { context in
            var y: CGFloat = 46
            let left: CGFloat = 42
            let right: CGFloat = 570
            let contentWidth = right - left

            func textHeight(_ value: String, width: CGFloat, font: UIFont) -> CGFloat {
                let paragraph = NSMutableParagraphStyle()
                paragraph.lineBreakMode = .byCharWrapping
                let rect = (value as NSString).boundingRect(
                    with: CGSize(width: width, height: .greatestFiniteMagnitude),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: [.font: font, .paragraphStyle: paragraph],
                    context: nil
                )
                return ceil(rect.height)
            }

            @discardableResult
            func drawText(
                _ value: String,
                x: CGFloat,
                width: CGFloat,
                font: UIFont,
                color: UIColor,
                alignment: NSTextAlignment = .left
            ) -> CGFloat {
                let paragraph = NSMutableParagraphStyle()
                paragraph.alignment = alignment
                paragraph.lineBreakMode = .byCharWrapping
                let height = textHeight(value, width: width, font: font)
                (value as NSString).draw(
                    with: CGRect(x: x, y: y, width: width, height: height),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: [.font: font, .foregroundColor: color, .paragraphStyle: paragraph],
                    context: nil
                )
                return height
            }

            func beginPage() {
                context.beginPage()
                UIColor.white.setFill()
                context.cgContext.fill(page)
                y = 46
                y += drawText(localize("appName"), x: left, width: contentWidth, font: .boldSystemFont(ofSize: 19), color: .black) + 5
                y += drawText(report.title, x: left, width: contentWidth, font: .boldSystemFont(ofSize: 13), color: UIColor(red: 0.05, green: 0.35, blue: 0.25, alpha: 1)) + 3
                if let start = report.start, let end = report.end {
                    let range = "\(dateOnlyFormatter.string(from: start)) – \(dateOnlyFormatter.string(from: end))"
                    y += drawText(range, x: left, width: contentWidth, font: .systemFont(ofSize: 10), color: .darkGray) + 3
                }
                y += drawText(
                    language == .spanish ? "Informe creado localmente en este dispositivo" : "Report created locally on this device",
                    x: left,
                    width: contentWidth,
                    font: .systemFont(ofSize: 9),
                    color: .darkGray
                ) + 16
            }
            func ensure(_ height: CGFloat) {
                if y + height > page.height - 48 { beginPage() }
            }
            beginPage()
            let total = purchases.reduce(0) { $0 + $1.totalCents }
            let eligible = purchases.reduce(0) { $0 + $1.eligibleCents }
            let notEligible = purchases.reduce(0) { $0 + $1.notEligibleCents }
            let unsure = purchases.reduce(0) { $0 + $1.unsureCents }
            y += drawText(
                "\(purchases.count) \(language == .spanish ? "compras" : "purchases")  •  \(localize("basketTotal")): \(Money.format(total, language: language))",
                x: left,
                width: contentWidth,
                font: .boldSystemFont(ofSize: 12),
                color: .black
            ) + 4
            y += drawText(
                "\(localize("eligible")): \(Money.format(eligible, language: language))  •  \(localize("notEligible")): \(Money.format(notEligible, language: language))  •  \(localize("unsure")): \(Money.format(unsure, language: language))",
                x: left,
                width: contentWidth,
                font: .systemFont(ofSize: 10),
                color: .darkGray
            ) + 18

            for purchase in purchases.sorted(by: { $0.completedAt > $1.completedAt }) {
                let storeHeight = textHeight(purchase.store, width: 330, font: .boldSystemFont(ofSize: 14))
                let dateHeight = textHeight(formatter.string(from: purchase.completedAt), width: 180, font: .systemFont(ofSize: 10))
                let metadata = "\(localize("card")): \(purchase.cardName)  •  \(localize("basketTotal")): \(Money.format(purchase.totalCents, language: language))"
                let metadataHeight = textHeight(metadata, width: contentWidth, font: .systemFont(ofSize: 10))
                ensure(max(storeHeight, dateHeight) + metadataHeight + 30)
                let headingY = y
                _ = drawText(purchase.store, x: left, width: 330, font: .boldSystemFont(ofSize: 14), color: .black)
                y = headingY
                _ = drawText(formatter.string(from: purchase.completedAt), x: 390, width: 180, font: .systemFont(ofSize: 10), color: .darkGray, alignment: .right)
                y = headingY + max(storeHeight, dateHeight) + 4
                y += drawText(metadata, x: left, width: contentWidth, font: .systemFont(ofSize: 10), color: .darkGray) + 8
                for item in purchase.items {
                    let leftValue = "\(item.quantity) × \(item.name)"
                    let rightValue = "\(localize.eligibility(item.eligibility))  \(Money.format(item.totalCents, language: language))"
                    let leftHeight = textHeight(leftValue, width: 285, font: .systemFont(ofSize: 10))
                    let rightHeight = textHeight(rightValue, width: 190, font: .systemFont(ofSize: 10))
                    let rowHeight = max(leftHeight, rightHeight)
                    ensure(rowHeight + 7)
                    let rowY = y
                    _ = drawText(leftValue, x: 56, width: 285, font: .systemFont(ofSize: 10), color: .black)
                    y = rowY
                    _ = drawText(rightValue, x: 370, width: 190, font: .systemFont(ofSize: 10), color: .black, alignment: .right)
                    y = rowY + rowHeight + 7
                }
                ensure(20)
                y += 6
                let line = UIBezierPath()
                line.move(to: CGPoint(x: left, y: y))
                line.addLine(to: CGPoint(x: right, y: y))
                UIColor.lightGray.setStroke()
                line.lineWidth = 0.5
                line.stroke()
                y += 14
            }
        }
        let url = temporaryURL(extension: "pdf")
        do {
            try data.write(to: url, options: [.atomic])
            try applyLocalOnlyProtection(to: url)
            return url
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw ExportError.writeFailed(language)
        }
    }

    static func makeXLSX(
        purchases: [Purchase],
        language: AppLanguage,
        report: ExportReportContext? = nil
    ) throws -> URL {
        guard !purchases.isEmpty else { throw ExportError.noPurchases(language) }
        let report = report ?? .overall(language: language, purchases: purchases)
        let localize = Localizer(language: language)
        let headers = language == .spanish
            ? ["Fecha", "Tienda", "Tarjeta", "Artículo", "Cantidad", "Clasificación", "Precio unitario", "Total de línea"]
            : ["Date", "Store", "Card", "Item", "Quantity", "Classification", "Unit price", "Line total"]
        var rows: [[Cell]] = [
            headers.map(Cell.text)
        ]
        for purchase in purchases.sorted(by: { $0.completedAt > $1.completedAt }) {
            for item in purchase.items {
                rows.append([
                    .date(purchase.completedAt),
                    .text(purchase.store),
                    .text(purchase.cardName),
                    .text(item.name),
                    .number(Double(item.quantity), style: 0),
                    .text(localize.eligibility(item.eligibility)),
                    .number(Double(item.unitPriceCents) / 100.0, style: 1),
                    .number(Double(item.totalCents) / 100.0, style: 1)
                ])
            }
        }

        let files: [(String, Data)] = [
            ("[Content_Types].xml", xmlData(contentTypes)),
            ("_rels/.rels", xmlData(rootRelationships)),
            ("docProps/core.xml", xmlData(coreProperties(language: language, title: report.title))),
            ("docProps/app.xml", xmlData(appProperties(language: language))),
            ("xl/workbook.xml", xmlData(workbook(language: language))),
            ("xl/_rels/workbook.xml.rels", xmlData(workbookRelationships)),
            ("xl/styles.xml", xmlData(styles)),
            ("xl/worksheets/sheet1.xml", xmlData(worksheet(rows)))
        ]
        var archive = StoredZip()
        for (path, data) in files { archive.add(path: path, data: data) }
        let url = temporaryURL(extension: "xlsx")
        do {
            try archive.finalize().write(to: url, options: [.atomic])
            try applyLocalOnlyProtection(to: url)
            return url
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw ExportError.writeFailed(language)
        }
    }

    static func removeTemporaryReport(at url: URL) throws {
        let candidate = url.standardizedFileURL
        let temporaryDirectory = FileManager.default.temporaryDirectory.standardizedFileURL
        let allowedExtension = candidate.pathExtension == "pdf" || candidate.pathExtension == "xlsx"
        guard candidate.deletingLastPathComponent() == temporaryDirectory,
              candidate.lastPathComponent.hasPrefix(reportPrefix),
              allowedExtension else { return }
        if FileManager.default.fileExists(atPath: candidate.path) {
            try FileManager.default.removeItem(at: candidate)
        }
    }

    static func removeTemporaryReports() throws {
        let temporaryDirectory = FileManager.default.temporaryDirectory
        var firstError: Error?
        for url in try FileManager.default.contentsOfDirectory(
            at: temporaryDirectory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) where url.lastPathComponent.hasPrefix(reportPrefix)
            && (url.pathExtension == "pdf" || url.pathExtension == "xlsx") {
            do {
                try removeTemporaryReport(at: url)
            } catch {
                if firstError == nil { firstError = error }
            }
        }
        if let firstError { throw firstError }
    }

    private static func temporaryURL(extension fileExtension: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("\(reportPrefix)\(UUID().uuidString)")
            .appendingPathExtension(fileExtension)
    }

    private static func applyLocalOnlyProtection(to url: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableURL = url
        try mutableURL.setResourceValues(values)
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: url.path
        )
    }

    private enum Cell {
        case text(String)
        case number(Double, style: Int)
        case date(Date)
    }

    private static func worksheet(_ rows: [[Cell]]) -> String {
        let body = rows.enumerated().map { rowIndex, cells in
            let columns = cells.enumerated().map { columnIndex, cell -> String in
                let reference = "\(columnName(columnIndex + 1))\(rowIndex + 1)"
                switch cell {
                case .text(let value):
                    return #"<c r="\#(reference)" t="inlineStr"><is><t xml:space="preserve">\#(escape(value))</t></is></c>"#
                case .number(let value, let style):
                    return #"<c r="\#(reference)" s="\#(style)"><v>\#(String(format: "%.2f", value))</v></c>"#
                case .date(let value):
                    let serial = excelSerial(for: value)
                    return #"<c r="\#(reference)" s="2"><v>\#(String(format: "%.10f", serial))</v></c>"#
                }
            }.joined()
            return "<row r=\"\(rowIndex + 1)\">\(columns)</row>"
        }.joined()
        return #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="4" width="22" customWidth="1"/><col min="5" max="8" width="16" customWidth="1"/></cols><sheetData>\#(body)</sheetData></worksheet>"#
    }

    private static func columnName(_ index: Int) -> String {
        var number = index
        var result = ""
        while number > 0 {
            number -= 1
            result = String(UnicodeScalar(65 + number % 26)!) + result
            number /= 26
        }
        return result
    }

    private static func excelSerial(for date: Date) -> Double {
        var localCalendar = Calendar(identifier: .gregorian)
        localCalendar.timeZone = .current
        let components = localCalendar.dateComponents([.year, .month, .day, .hour, .minute, .second, .nanosecond], from: date)
        var neutralCalendar = Calendar(identifier: .gregorian)
        neutralCalendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let neutralDate = neutralCalendar.date(from: components) ?? date
        return neutralDate.timeIntervalSince1970 / 86_400.0 + 25_569.0
    }

    private static func escape(_ value: String) -> String {
        var sanitized = ""
        for scalar in value.unicodeScalars {
            let code = scalar.value
            let isXML10Scalar = code == 0x09 || code == 0x0A || code == 0x0D
                || (0x20...0xD7FF).contains(code)
                || (0xE000...0xFFFD).contains(code)
                || (0x10000...0x10FFFF).contains(code)
            if isXML10Scalar { sanitized.unicodeScalars.append(scalar) }
        }
        return sanitized.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }

    private static func xmlData(_ value: String) -> Data { Data(value.utf8) }

    private static let contentTypes = #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>"#
    private static let rootRelationships = #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>"#
    private static func workbook(language: AppLanguage) -> String {
        let sheet = language == .spanish ? "Compras" : "Purchases"
        return #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="\#(sheet)" sheetId="1" r:id="rId1"/></sheets></workbook>"#
    }
    private static let workbookRelationships = #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#
    private static let styles = #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="$#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>"#
    private static func coreProperties(language: AppLanguage, title: String) -> String {
        let creator = language == .spanish ? "Control de Beneficios de Comestibles" : "Grocery Benefits Tracker"
        return #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>\#(escape(title))</dc:title><dc:creator>\#(escape(creator))</dc:creator></cp:coreProperties>"#
    }
    private static func appProperties(language: AppLanguage) -> String {
        let application = language == .spanish ? "Control de Beneficios de Comestibles" : "Grocery Benefits Tracker"
        return #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>\#(application)</Application></Properties>"#
    }
}

private struct StoredZip {
    private struct Entry {
        let path: Data
        let data: Data
        let crc: UInt32
        let offset: UInt32
    }

    private var output = Data()
    private var entries: [Entry] = []

    mutating func add(path: String, data: Data) {
        let name = Data(path.utf8)
        let checksum = CRC32.checksum(data)
        let offset = UInt32(output.count)
        output.appendLE(UInt32(0x04034b50))
        output.appendLE(UInt16(20))
        output.appendLE(UInt16(0x0800))
        output.appendLE(UInt16(0))
        output.appendLE(UInt16(0))
        output.appendLE(UInt16(0x0021))
        output.appendLE(checksum)
        output.appendLE(UInt32(data.count))
        output.appendLE(UInt32(data.count))
        output.appendLE(UInt16(name.count))
        output.appendLE(UInt16(0))
        output.append(name)
        output.append(data)
        entries.append(Entry(path: name, data: data, crc: checksum, offset: offset))
    }

    mutating func finalize() -> Data {
        let centralOffset = UInt32(output.count)
        for entry in entries {
            output.appendLE(UInt32(0x02014b50))
            output.appendLE(UInt16(20))
            output.appendLE(UInt16(20))
            output.appendLE(UInt16(0x0800))
            output.appendLE(UInt16(0))
            output.appendLE(UInt16(0))
            output.appendLE(UInt16(0x0021))
            output.appendLE(entry.crc)
            output.appendLE(UInt32(entry.data.count))
            output.appendLE(UInt32(entry.data.count))
            output.appendLE(UInt16(entry.path.count))
            output.appendLE(UInt16(0))
            output.appendLE(UInt16(0))
            output.appendLE(UInt16(0))
            output.appendLE(UInt16(0))
            output.appendLE(UInt32(0))
            output.appendLE(entry.offset)
            output.append(entry.path)
        }
        let centralSize = UInt32(output.count) - centralOffset
        output.appendLE(UInt32(0x06054b50))
        output.appendLE(UInt16(0))
        output.appendLE(UInt16(0))
        output.appendLE(UInt16(entries.count))
        output.appendLE(UInt16(entries.count))
        output.appendLE(centralSize)
        output.appendLE(centralOffset)
        output.appendLE(UInt16(0))
        return output
    }
}

private enum CRC32 {
    private static let table: [UInt32] = (0..<256).map { value in
        var crc = UInt32(value)
        for _ in 0..<8 { crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1 }
        return crc
    }

    static func checksum(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xffffffff
        for byte in data { crc = (crc >> 8) ^ table[Int((crc ^ UInt32(byte)) & 0xff)] }
        return crc ^ 0xffffffff
    }
}

private extension Data {
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
        var little = value.littleEndian
        Swift.withUnsafeBytes(of: &little) { append(contentsOf: $0) }
    }
}
