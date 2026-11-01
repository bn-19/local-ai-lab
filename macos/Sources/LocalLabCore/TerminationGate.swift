import Foundation

@MainActor
public final class TerminationGate {
    public private(set) var isPending = false

    public init() {}

    // Only the first request starts cleanup. Later requests remain deferred and
    // are resolved by that same cleanup result.
    public func beginRequest() -> Bool {
        guard !isPending else { return false }
        isPending = true
        return true
    }

    public func resolve(allowed: Bool) {
        if !allowed { isPending = false }
    }
}
