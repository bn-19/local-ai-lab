import SwiftUI

@main
struct LocalLabMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var runtime: RuntimeController

    init() {
        let controller = RuntimeController()
        _runtime = State(initialValue: controller)
        LifecycleCoordinator.shared.shutdown = { [weak controller] in
            guard let controller else { return true }
            return await controller.shutdown()
        }
    }

    var body: some Scene {
        WindowGroup("Local Lab", id: "main") {
            ContentView(runtime: runtime)
        }
        .defaultSize(width: 1180, height: 820)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
    }
}
