import Foundation

public enum RuntimeCommand {
    public static func launcherArguments(launcher: URL, authorizeRelay: Bool, readyMarker: String) -> [String] {
        [launcher.path, "start", "--no-open", "--native-ready", readyMarker] + (authorizeRelay ? ["--relay-consent"] : [])
    }
}
