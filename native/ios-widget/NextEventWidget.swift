import SwiftUI
import WidgetKit

private struct CalendarItem: Decodable {
    let title: String
    let subtitle: String
    let from: Double
    let until: Double

    var start: Date { Date(timeIntervalSince1970: from / 1000) }
    var end: Date { Date(timeIntervalSince1970: until / 1000) }
}

private struct NextEntry: TimelineEntry {
    let date: Date
    let item: CalendarItem?
}

private struct NextProvider: TimelineProvider {
    private func load() -> [CalendarItem] {
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.app.maeilon.calendar")?.appendingPathComponent("next-events.json"),
              let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder().decode([CalendarItem].self, from: data) else { return [] }
        return items.filter { $0.end > $0.start }.sorted { $0.start < $1.start }
    }

    private func entry(at date: Date, from items: [CalendarItem]) -> NextEntry {
        NextEntry(date: date, item: items.first { $0.end > date })
    }

    func placeholder(in context: Context) -> NextEntry {
        let now = Date()
        return NextEntry(date: now, item: CalendarItem(title: "다음 일정", subtitle: "예정", from: now.timeIntervalSince1970 * 1000 + 600000, until: now.timeIntervalSince1970 * 1000 + 4200000))
    }

    func getSnapshot(in context: Context, completion: @escaping (NextEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry(at: Date(), from: load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextEntry>) -> Void) {
        let now = Date()
        let items = load().filter { $0.end > now }
        let dates = Set(items.flatMap { [$0.start, $0.end] }).filter { $0 > now }.sorted()
        let batch = Array(dates.prefix(60))
        let entries = ([now] + batch).map { entry(at: $0, from: items) }
        let policy: TimelineReloadPolicy = dates.count > batch.count ? .atEnd : .never
        completion(Timeline(entries: entries, policy: policy))
    }
}

private struct NextView: View {
    let entry: NextEntry

    private var contents: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let item = entry.item {
                Text(item.start <= entry.date ? "진행 중" : "다음 일정").font(.caption2)
                Text(item.title).font(.headline).lineLimit(1).privacySensitive()
                Text(item.subtitle).font(.caption).lineLimit(1).privacySensitive()
            } else {
                Text("매일의 온도").font(.caption2)
                Text("예정된 일정 없음").font(.headline)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            contents.containerBackground(for: .widget) { Color.clear }
        } else {
            contents
        }
    }
}

@main
struct NextEventWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DailyTemperatureNextEvent", provider: NextProvider()) { entry in
            NextView(entry: entry)
        }
        .configurationDisplayName("매일의 온도 · 다음 일정")
        .description("잠금화면에서 현재 또는 다음 일정을 확인해요.")
        .supportedFamilies([.accessoryRectangular])
    }
}
