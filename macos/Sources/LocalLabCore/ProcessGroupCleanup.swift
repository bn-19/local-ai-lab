import Darwin
import Foundation

public struct ProcessCleanupIssue: Codable, Equatable, Sendable {
    public let group: pid_t
    public let operation: String
    public let code: Int32
}

public struct ProcessCleanupResult: Equatable, Sendable {
    public let unresolvedGroups: [pid_t]
    public let issues: [ProcessCleanupIssue]
    public init(unresolvedGroups: [pid_t], issues: [ProcessCleanupIssue]) {
        self.unresolvedGroups = unresolvedGroups
        self.issues = issues
    }
    public var succeeded: Bool { unresolvedGroups.isEmpty }
}

public enum ProcessGroupCleanup {
    public typealias Signal = @Sendable (_ target: pid_t, _ signal: Int32) -> Int32

    public static func stop(
        groups: [pid_t],
        grace: Duration = .seconds(8),
        killWait: Duration = .seconds(2),
        signal: @escaping Signal = { Darwin.kill($0, $1) }
    ) async -> ProcessCleanupResult {
        let groups = Array(Set(groups.filter { $0 > 0 })).sorted()
        var issues: [ProcessCleanupIssue] = []

        func apply(_ value: Int32, operation: String, to targets: [pid_t]) {
            for group in targets where signal(-group, value) != 0 && errno != ESRCH {
                let issue = ProcessCleanupIssue(group: group, operation: operation, code: errno)
                if !issues.contains(issue) { issues.append(issue) }
            }
        }
        func unresolved() -> [pid_t] {
            groups.filter { group in
                if signal(-group, 0) == 0 { return true }
                if errno == ESRCH { return false }
                let issue = ProcessCleanupIssue(group: group, operation: "probe", code: errno)
                if !issues.contains(issue) { issues.append(issue) }
                return true
            }
        }
        func waitForExit(_ duration: Duration) async -> [pid_t] {
            let deadline = ContinuousClock.now + duration
            var remaining = unresolved()
            while !remaining.isEmpty && ContinuousClock.now < deadline {
                try? await Task.sleep(for: .milliseconds(25))
                remaining = unresolved()
            }
            return remaining
        }

        apply(SIGTERM, operation: "SIGTERM", to: groups)
        var remaining = await waitForExit(grace)
        if !remaining.isEmpty {
            apply(SIGKILL, operation: "SIGKILL", to: remaining)
            remaining = await waitForExit(killWait)
        }
        return ProcessCleanupResult(unresolvedGroups: remaining, issues: issues)
    }
}
