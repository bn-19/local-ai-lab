import Darwin
import Foundation
import LocalLabCore

private enum CheckFailure: Error, CustomStringConvertible {
    case failed(String)
    var description: String { if case let .failed(message) = self { return message }; return "check failed" }
}

private final class SignalFixture: @unchecked Sendable {
    private let lock = NSLock()
    private var gone: Set<pid_t> = []
    private(set) var calls: [(pid_t, Int32)] = []
    func call(_ target: pid_t, _ value: Int32) -> Int32 {
        lock.lock(); defer { lock.unlock() }
        calls.append((target, value))
        let group = -target
        if group == 101 { errno = EPERM; return -1 }
        if value == SIGTERM || value == SIGKILL { gone.insert(group); return 0 }
        if gone.contains(group) { errno = ESRCH; return -1 }
        return 0
    }
}

@main
struct LocalLabHeadlessChecks {
    static func main() async throws {
        try check(TrustedNavigation.allows(URL(string: "http://127.0.0.1:4173/app")), "trusted /app path rejected")
        try check(TrustedNavigation.allows(URL(string: "http://127.0.0.1:4173/app/assets/main.js")), "trusted child path rejected")
        try check(!TrustedNavigation.allows(URL(string: "http://localhost:4173/app/")), "lookalike host allowed")
        try check(!TrustedNavigation.allows(URL(string: "http://127.0.0.1:4173/application")), "lookalike path allowed")

        let marker = "00000000-0000-0000-0000-000000000000"
        let arguments = RuntimeCommand.launcherArguments(launcher: URL(fileURLWithPath: "/tmp/launcher.mjs"), authorizeRelay: true, readyMarker: marker)
        try check(Array(arguments.suffix(3)) == ["--native-ready", marker, "--relay-consent"], "explicit consent/ready arguments missing")

        let injected = SignalFixture()
        let cleanup = await ProcessGroupCleanup.stop(
            groups: [101, 202], grace: .milliseconds(20), killWait: .milliseconds(20),
            signal: { [injected] target, value in injected.call(target, value) }
        )
        try check(cleanup.unresolvedGroups == [101], "injected EPERM did not fail closed")
        try check(injected.calls.contains { $0.0 == -202 && $0.1 == SIGTERM }, "EPERM skipped another owned group")

        let termination = await MainActor.run { TerminationGate() }
        try await MainActor.run {
            try check(termination.beginRequest(), "first quit request did not begin cleanup")
            try check(!termination.beginRequest(), "second quit request bypassed pending cleanup")
            try check(termination.isPending, "second quit request cleared pending cleanup")
            termination.resolve(allowed: false)
            try check(!termination.isPending, "failed cleanup did not release the cancelled termination request")
            try check(termination.beginRequest(), "a later quit could not retry cleanup")
        }

        guard CommandLine.arguments.count == 2 else { throw CheckFailure.failed("pass LocalLabProcessHelper path") }
        try await checkRealOrphan(helper: URL(fileURLWithPath: CommandLine.arguments[1]))
        try checkRuntimeInspection()
        print("Local Lab headless checks passed (navigation, consent, runtime inspection, double-quit gate, injected cleanup, real orphan cleanup).")
    }

    private static func checkRealOrphan(helper: URL) async throws {
        try check(FileManager.default.isExecutableFile(atPath: helper.path), "process helper is not executable")
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let pidFile = directory.appendingPathComponent("descendant-pid")
        let process = Process()
        process.executableURL = helper
        process.arguments = ["/bin/sh", "-c", "sleep 5 & echo $! > \"$1\"; exit 0", "fixture", pidFile.path]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run(); process.waitUntilExit()
        let child = try await waitForPID(in: pidFile)
        try check(kill(child, 0) == 0, "orphan fixture did not start")
        let result = await ProcessGroupCleanup.stop(groups: [process.processIdentifier])
        try check(result.succeeded, "owned orphan group was not confirmed stopped: \(result)")
        try check(kill(child, 0) == -1 && errno == ESRCH, "owned orphan descendant remains")
    }

    private static func checkRuntimeInspection() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let paths = AppPaths(applicationSupport: directory)
        try check(RuntimeInspection.inspect(paths) == .absent, "fresh support directory is not absent")
        try FileManager.default.createDirectory(at: paths.launcher.deletingLastPathComponent(), withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: paths.launcher.path, contents: Data())
        let node = paths.runtimeRoot.appendingPathComponent("node")
        FileManager.default.createFile(atPath: node.path, contents: Data("#!/bin/sh\n".utf8), attributes: [.posixPermissions: 0o700])
        try FileManager.default.createDirectory(at: paths.nodePathRecord.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(node.path.utf8).write(to: paths.nodePathRecord)
        try check(RuntimeInspection.inspect(paths) == .ready(node: node, relayReady: false), "valid runtime was not recognized")
    }

    private static func waitForPID(in file: URL) async throws -> pid_t {
        for _ in 0..<100 {
            if let value = try? String(contentsOf: file, encoding: .utf8), let pid = pid_t(value.trimmingCharacters(in: .whitespacesAndNewlines)) { return pid }
            try await Task.sleep(for: .milliseconds(20))
        }
        throw CheckFailure.failed("orphan fixture did not publish its PID")
    }

    private static func check(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw CheckFailure.failed(message) }
    }
}
