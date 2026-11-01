import Foundation

public enum InstallationState: Equatable, Sendable {
    case absent
    case ready(node: URL, relayReady: Bool)
    case incomplete(String)
}

public enum RuntimeInspection {
    public static func inspect(_ paths: AppPaths, fileManager: FileManager = .default) -> InstallationState {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: paths.runtimeRoot.path, isDirectory: &isDirectory) else { return .absent }
        guard isDirectory.boolValue else { return .incomplete("The Local Lab runtime location is not a folder.") }
        guard fileManager.fileExists(atPath: paths.launcher.path) else {
            return .incomplete("The existing runtime is incomplete. Your files were preserved; choose a different Application Support location or recover this installation manually.")
        }
        guard let value = try? String(contentsOf: paths.nodePathRecord, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            return .incomplete("The existing runtime does not contain its Node runtime record. Nothing was replaced.")
        }
        let node = URL(fileURLWithPath: value)
        guard fileManager.isExecutableFile(atPath: node.path) else {
            return .incomplete("The existing runtime's Node executable is unavailable. Nothing was replaced.")
        }
        return .ready(node: node, relayReady: relayReady(at: paths.relayConfiguration))
    }

    public static func relayReady(at url: URL) -> Bool {
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["workspaceKey"] is String else { return false }
        return ["planner", "evaluator", "trainer"].allSatisfy { name in
            guard let identity = object[name] as? [String: Any] else { return false }
            return identity["token"] is String
        }
    }

    public static func pairingToken(at url: URL) throws -> String {
        let token = try String(contentsOf: url, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        guard token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw RuntimeError.invalidPairingToken
        }
        return token
    }
}

public enum RuntimeError: LocalizedError, Equatable {
    case invalidPairingToken

    public var errorDescription: String? {
        switch self {
        case .invalidPairingToken: "The local companion produced an invalid pairing token."
        }
    }
}
