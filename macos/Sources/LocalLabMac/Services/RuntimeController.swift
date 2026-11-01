import Foundation
import LocalLabCore
import Observation

@MainActor @Observable
final class RuntimeController {
    private(set) var phase: RuntimePhase = .inspecting
    private(set) var webSession: WebSession?
    private(set) var statusDetail = "Checking the local runtime…"

    private let paths: AppPaths
    private var activeProcess: ManagedProcess?
    private var activeRequiresLauncherCleanup = false
    private var generation = UUID()
    private var prepared = false
    private var cancelled = false

    init(paths: AppPaths? = nil) {
        if let paths { self.paths = paths }
        else {
            self.paths = (try? .live()) ?? AppPaths(
                applicationSupport: FileManager.default.homeDirectoryForCurrentUser
                    .appendingPathComponent("Library/Application Support/Local Lab", isDirectory: true)
            )
        }
    }

    func prepare() async {
        guard !prepared else { return }
        prepared = true
        await inspectAndContinue(automaticallyStart: true)
    }

    func installRuntime() async {
        generation = UUID(); cancelled = false
        phase = .installing
        statusDetail = "Installing verified runtime components and locked dependencies. Model weights are not downloaded."
        do {
            let bootstrap = try bootstrapDirectory()
            let script = bootstrap.appendingPathComponent("installer/macos/install.sh")
            guard FileManager.default.isExecutableFile(atPath: script.path) else { throw HostError.missingBootstrap }
            let helper = try helperURL()
            let log = paths.hostLogs.appendingPathComponent("bootstrap.log")
            let process = try ManagedProcess.launch(
                helper: helper,
                executable: URL(fileURLWithPath: "/bin/bash"),
                arguments: [script.path, "--dest", paths.runtimeRoot.path, "--no-launch"],
                currentDirectory: bootstrap,
                logURL: log,
                environment: ProcessInfo.processInfo.environment
            )
            activeProcess = process
            activeRequiresLauncherCleanup = false
            let result = await process.waitForExit()
            guard await retire(process, context: "bootstrap", requiresLauncherCleanup: false) else { return }
            if cancelled { await inspectAndContinue(automaticallyStart: false); return }
            guard result == 0 else { throw HostError.bootstrapFailed }
            await inspectAndContinue(automaticallyStart: true)
        } catch {
            activeProcess = nil
            fail(error)
        }
    }

    func startRuntime(authorizeRelay: Bool) async {
        let installation = RuntimeInspection.inspect(paths)
        guard case let .ready(node, relayReady) = installation else {
            await inspectAndContinue(automaticallyStart: false); return
        }
        guard relayReady || authorizeRelay else { phase = .needsRelayConsent; return }
        guard !FileManager.default.fileExists(atPath: paths.launcherSession.path) else {
            phase = .failed("An existing or interrupted launcher session is recorded. Local Lab did not signal it. Inspect the private launcher state or restart your Mac before retrying.")
            return
        }

        let operation = UUID(); generation = operation; cancelled = false
        let readyMarker = UUID().uuidString.lowercased()
        phase = .starting
        webSession = nil
        statusDetail = relayReady ? "Starting the local workspace…" : "Creating your Relay workspace, then starting local services…"
        do {
            let process = try ManagedProcess.launch(
                helper: try helperURL(),
                executable: node,
                arguments: RuntimeCommand.launcherArguments(launcher: paths.launcher, authorizeRelay: authorizeRelay, readyMarker: readyMarker),
                currentDirectory: paths.runtimeRoot,
                logURL: paths.hostLogs.appendingPathComponent("runtime-host.log"),
                environment: ProcessInfo.processInfo.environment
            )
            activeProcess = process
            activeRequiresLauncherCleanup = true
            Task { [weak self, weak process] in
                guard let process else { return }
                let status = await process.waitForExit()
                guard let self, self.generation == operation, !self.cancelled else { return }
                guard await self.retire(process, context: "runtime-exit", requiresLauncherCleanup: true) else { return }
                self.webSession = nil
                self.phase = .failed(status == 0 ? "Local services stopped." : "Local services stopped unexpectedly. Private logs are available in Application Support/Local Lab/Host Logs.")
            }
            try await waitForUI(process: process, operation: operation, readyMarker: readyMarker)
            guard generation == operation, !cancelled, process.isRunning else { return }
            let token = try RuntimeInspection.pairingToken(at: paths.pairingToken)
            webSession = WebSession(token: token)
            statusDetail = "Connected to services running only on this Mac."
            phase = .ready
        } catch {
            if generation == operation {
                if let process = activeProcess, !(await retire(process, context: "startup-failure", requiresLauncherCleanup: true)) { return }
                fail(error)
            }
        }
    }

    func cancelCurrentOperation() async {
        cancelled = true
        generation = UUID()
        statusDetail = "Cancelling safely…"
        if let process = activeProcess, !(await retire(process, context: "cancel", requiresLauncherCleanup: activeRequiresLauncherCleanup)) { return }
        webSession = nil
        await inspectAndContinue(automaticallyStart: false)
    }

    func stopRuntime() async {
        cancelled = true
        generation = UUID()
        phase = .stopping
        statusDetail = "Stopping this app's local services…"
        if let process = activeProcess, !(await retire(process, context: "stop", requiresLauncherCleanup: true)) { return }
        webSession = nil
        await inspectAndContinue(automaticallyStart: false)
    }

    func retry() async {
        if let process = activeProcess, !(await retire(process, context: "retry", requiresLauncherCleanup: activeRequiresLauncherCleanup)) { return }
        await inspectAndContinue(automaticallyStart: true)
    }
    func shutdown() async -> Bool {
        cancelled = true; generation = UUID()
        guard let process = activeProcess else { return true }
        return await retire(process, context: "application-termination", requiresLauncherCleanup: activeRequiresLauncherCleanup)
    }

    private func retire(_ process: ManagedProcess, context: String, requiresLauncherCleanup: Bool) async -> Bool {
        let result = await process.stop()
        if result.succeeded && (!requiresLauncherCleanup || !FileManager.default.fileExists(atPath: paths.launcherSession.path)) {
            if activeProcess === process { activeProcess = nil }
            activeRequiresLauncherCleanup = false
            try? FileManager.default.removeItem(at: cleanupRecoveryURL)
            return true
        }
        recordCleanupFailure(result, group: process.processIdentifier, context: context, launcherStateRemains: requiresLauncherCleanup && FileManager.default.fileExists(atPath: paths.launcherSession.path))
        phase = .failed("Local Lab could not confirm that every owned process stopped. No other process was signalled. Private diagnostic-only recovery details were retained; quit other work and restart your Mac before retrying.")
        return false
    }

    private var cleanupRecoveryURL: URL { paths.hostLogs.appendingPathComponent("cleanup-failed.json") }

    private func recordCleanupFailure(_ result: ProcessCleanupResult, group: pid_t, context: String, launcherStateRemains: Bool) {
        try? FileManager.default.createDirectory(
            at: paths.hostLogs,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let payload: [String: Any] = [
            "state": "cleanup-failed",
            "diagnosticOnly": true,
            "context": context,
            "ownedGroup": group,
            "unresolvedGroups": result.unresolvedGroups,
            "launcherStateRemains": launcherStateRemains,
            "errors": result.issues.map { ["group": $0.group, "operation": $0.operation, "code": $0.code] },
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys]) else { return }
        FileManager.default.createFile(atPath: cleanupRecoveryURL.path, contents: data, attributes: [.posixPermissions: 0o600])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: cleanupRecoveryURL.path)
    }

    private func inspectAndContinue(automaticallyStart: Bool) async {
        switch RuntimeInspection.inspect(paths) {
        case .absent:
            phase = .needsInstall
            statusDetail = "Local Lab installs its runtime in your Application Support folder."
        case let .incomplete(message):
            phase = .failed(message)
        case let .ready(_, relayReady):
            if !relayReady {
                phase = .needsRelayConsent
                statusDetail = "Local work stays on this Mac. Relay receives coordination metadata after you approve workspace creation."
            } else if automaticallyStart {
                await startRuntime(authorizeRelay: false)
            } else {
                phase = .stopped
                statusDetail = "Runtime installed. Start Local Lab when you're ready."
            }
        }
    }

    private func waitForUI(process: ManagedProcess, operation: UUID, readyMarker: String) async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 1
        configuration.timeoutIntervalForResource = 2
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let deadline = ContinuousClock.now + .seconds(90)
        while ContinuousClock.now < deadline {
            guard generation == operation, !cancelled else { throw CancellationError() }
            guard process.isRunning else { throw HostError.runtimeExited }
            guard let data = try? Data(contentsOf: paths.nativeReady),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["marker"] as? String == readyMarker else {
                try await Task.sleep(for: .milliseconds(250)); continue
            }
            var request = URLRequest(url: TrustedNavigation.app)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            if let (_, response) = try? await session.data(for: request),
               (response as? HTTPURLResponse)?.statusCode == 200 { return }
            try await Task.sleep(for: .milliseconds(250))
        }
        throw HostError.startupTimedOut
    }

    private func bootstrapDirectory() throws -> URL {
        guard let resource = Bundle.module.resourceURL else { throw HostError.missingBootstrap }
        let candidates = [resource.appendingPathComponent("Resources/Bootstrap"), resource.appendingPathComponent("Bootstrap")]
        guard let found = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            throw HostError.missingBootstrap
        }
        return found
    }

    private func helperURL() throws -> URL {
        let packaged = Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/LocalLabProcessHelper")
        guard FileManager.default.isExecutableFile(atPath: packaged.path) else { throw HostError.missingHelper }
        return packaged
    }

    private func fail(_ error: Error) {
        if error is CancellationError { return }
        phase = .failed((error as? LocalizedError)?.errorDescription ?? "Local Lab could not complete the operation.")
    }
}

private enum HostError: LocalizedError {
    case missingBootstrap, missingHelper, bootstrapFailed, runtimeExited, startupTimedOut
    var errorDescription: String? {
        switch self {
        case .missingBootstrap: "This development build does not contain a verified bootstrap payload. Build a packaged candidate from an exact commit."
        case .missingHelper: "The app bundle is missing its process helper. Reinstall Local Lab."
        case .bootstrapFailed: "Runtime installation failed. Existing files were preserved. Check the private bootstrap log in Application Support/Local Lab/Host Logs and retry."
        case .runtimeExited: "Local services exited before the workspace became ready. Check the private runtime logs."
        case .startupTimedOut: "Local services did not become ready within 90 seconds. They were stopped safely; check the private runtime logs and retry."
        }
    }
}
