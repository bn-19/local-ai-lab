import Foundation

public enum TrustedNavigation {
    public static let origin = URL(string: "http://127.0.0.1:4173")!
    public static let app = URL(string: "http://127.0.0.1:4173/app/")!

    public static func allows(_ url: URL?) -> Bool {
        guard let url,
              url.scheme == "http",
              url.host == "127.0.0.1",
              url.port == 4173 else { return false }
        let path = url.path
        return path == "/app" || path == "/app/" || path.hasPrefix("/app/")
    }
}
