import AppKit

@MainActor
final class LifecycleCoordinator {
    static let shared = LifecycleCoordinator()
    var shutdown: (() async -> Bool)?
    private(set) var terminationPending = false

    func beginTermination() -> Bool {
        if terminationPending { return false }
        terminationPending = true
        return true
    }
    func finishTermination(allowed: Bool) { if !allowed { terminationPending = false } }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let coordinator = LifecycleCoordinator.shared
        guard coordinator.beginTermination(), let shutdown = coordinator.shutdown else { return .terminateNow }
        Task { @MainActor in
            let allowed = await shutdown()
            coordinator.finishTermination(allowed: allowed)
            sender.reply(toApplicationShouldTerminate: allowed)
        }
        return .terminateLater
    }
}
