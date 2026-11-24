import Foundation

public struct AppPaths: Sendable, Equatable {
    public let applicationSupport: URL

    public init(applicationSupport: URL) {
        self.applicationSupport = applicationSupport
    }

    public static func live(fileManager: FileManager = .default) throws -> AppPaths {
        // Explicit developer isolation. Never repoint an existing installation during testing.
        if let isolated = ProcessInfo.processInfo.environment["LOCAL_LAB_DEVELOPMENT_SUPPORT"] {
            guard isolated.hasPrefix("/"), isolated.count > 1 else {
                throw NSError(domain: "LocalLabPaths", code: 1, userInfo: [NSLocalizedDescriptionKey: "Development support path must be absolute."])
            }
            return AppPaths(applicationSupport: URL(fileURLWithPath: isolated, isDirectory: true))
        }
        let base = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return AppPaths(applicationSupport: base.appendingPathComponent("Local Lab", isDirectory: true))
    }

    public var runtimeRoot: URL { applicationSupport.appendingPathComponent("Runtime", isDirectory: true) }
    public var hostLogs: URL { applicationSupport.appendingPathComponent("Host Logs", isDirectory: true) }
    public var pairingToken: URL { runtimeRoot.appendingPathComponent(".local-lab/pairing-token") }
    public var relayConfiguration: URL { runtimeRoot.appendingPathComponent(".local-lab/relay.json") }
    public var nodePathRecord: URL { runtimeRoot.appendingPathComponent(".local-lab/installer/node-path") }
    public var launcher: URL { runtimeRoot.appendingPathComponent("installer/launcher.mjs") }
    public var launcherSession: URL { runtimeRoot.appendingPathComponent(".local-lab/launcher/session.json") }
    public var nativeReady: URL { runtimeRoot.appendingPathComponent(".local-lab/launcher/native-ready.json") }
}
