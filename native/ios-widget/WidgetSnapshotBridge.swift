import Foundation
import WidgetKit

enum WidgetSnapshotBridge {
    private static var observer: NSObjectProtocol?
    private static var lastSnapshot: String?

    static func start() {
        guard observer == nil else { return }
        observer = NotificationCenter.default.addObserver(forName: UserDefaults.didChangeNotification, object: nil, queue: .main) { _ in
            publish()
        }
        publish()
    }

    private static func publish() {
        let snapshot = UserDefaults.standard.string(forKey: "CapacitorStorage.widget.next") ?? "[]"
        guard snapshot != lastSnapshot,
              let folder = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.app.maeilon.calendar") else { return }
        do {
            let data = Data(snapshot.utf8)
            try data.write(to: folder.appendingPathComponent("next-events.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            lastSnapshot = snapshot
            WidgetCenter.shared.reloadTimelines(ofKind: "DailyTemperatureNextEvent")
        } catch {
            NSLog("Could not publish the calendar widget snapshot: %@", error.localizedDescription)
        }
    }
}
