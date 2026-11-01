import AppKit
import LocalLabCore

@MainActor
final class LifecycleCoordinator {
    static let shared = LifecycleCoordinator()
    var shutdown: (() async -> Bool)?
    let terminationGate = TerminationGate()
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let coordinator = LifecycleCoordinator.shared
        guard coordinator.terminationGate.beginRequest() else { return .terminateLater }
        guard let shutdown = coordinator.shutdown else { return .terminateNow }
        Task { @MainActor in
            let allowed = await shutdown()
            coordinator.terminationGate.resolve(allowed: allowed)
            sender.reply(toApplicationShouldTerminate: allowed)
        }
        return .terminateLater
    }
}
