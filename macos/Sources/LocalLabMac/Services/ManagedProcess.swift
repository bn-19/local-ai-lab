import Darwin
import Foundation
import LocalLabCore

@MainActor
final class ManagedProcess {
    private let process: Process
    private let log: FileHandle
    private var status: Int32?
    private var retired = false
    private var waiters: [CheckedContinuation<Int32, Never>] = []

    private init(process: Process, log: FileHandle) {
        self.process = process
        self.log = log
        process.terminationHandler = { [weak self] process in
            Task { @MainActor in self?.didTerminate(process.terminationStatus) }
        }
    }

    var isRunning: Bool { process.isRunning }
    var processIdentifier: pid_t { process.processIdentifier }

    static func launch(
        helper: URL,
        executable: URL,
        arguments: [String],
        currentDirectory: URL,
        logURL: URL,
        environment: [String: String]? = nil
    ) throws -> ManagedProcess {
        try FileManager.default.createDirectory(
            at: logURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        if !FileManager.default.fileExists(atPath: logURL.path) {
            FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600])
        }
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: logURL.path)
        let log = try FileHandle(forWritingTo: logURL)
        try log.seekToEnd()

        let process = Process()
        process.executableURL = helper
        process.arguments = [executable.path] + arguments
        process.currentDirectoryURL = currentDirectory
        process.environment = environment
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = log
        process.standardError = log
        let managed = ManagedProcess(process: process, log: log)
        do { try process.run() }
        catch { try? log.close(); throw error }
        return managed
    }

    func waitForExit() async -> Int32 {
        if let status { return status }
        return await withCheckedContinuation { waiters.append($0) }
    }

    func stop() async -> ProcessCleanupResult {
        if retired { return ProcessCleanupResult(unresolvedGroups: [], issues: []) }
        let result = await ProcessGroupCleanup.stop(groups: [process.processIdentifier])
        if result.succeeded { retired = true }
        return result
    }

    private func didTerminate(_ value: Int32) {
        guard status == nil else { return }
        status = value
        try? log.close()
        let continuations = waiters
        waiters.removeAll()
        continuations.forEach { $0.resume(returning: value) }
    }
}
