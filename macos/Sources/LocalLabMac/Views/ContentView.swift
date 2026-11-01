import SwiftUI

struct ContentView: View {
    @Bindable var runtime: RuntimeController

    var body: some View {
        Group {
            switch runtime.phase {
            case .inspecting:
                setup("Preparing Local Lab", "magnifyingglass", busy: true)
            case .needsInstall:
                SetupView(
                    title: "Install the local runtime",
                    detail: "Local Lab will verify and install its app source, Node dependencies, and Ollama runtime in your Application Support folder. No model weights are downloaded. Existing folders are never overwritten.",
                    symbol: "internaldrive",
                    primaryTitle: "Install Runtime",
                    primaryAction: { Task { await runtime.installRuntime() } },
                    secondaryTitle: nil, secondaryAction: nil, busy: false
                )
            case .installing:
                setup("Installing local components", "arrow.down.circle", busy: true, cancel: true)
            case .needsRelayConsent:
                SetupView(
                    title: "Create your Relay workspace?",
                    detail: "This creates a workspace and Planner, Evaluator, and Trainer identities in Agent Relay. CSV contents, model weights, and private answers stay on this Mac. You can retry safely if setup is interrupted.",
                    symbol: "person.3.sequence",
                    primaryTitle: "Create Workspace and Start",
                    primaryAction: { Task { await runtime.startRuntime(authorizeRelay: true) } },
                    secondaryTitle: nil, secondaryAction: nil, busy: false
                )
            case .starting:
                setup("Starting your local workspace", "bolt.horizontal.circle", busy: true, cancel: true)
            case .ready:
                if let session = runtime.webSession {
                    LocalWorkspaceView(session: session).id(session.id)
                } else { setup("Pairing securely", "lock", busy: true) }
            case .stopped:
                SetupView(
                    title: "Local Lab is stopped",
                    detail: runtime.statusDetail,
                    symbol: "stop.circle",
                    primaryTitle: "Start Local Lab",
                    primaryAction: { Task { await runtime.startRuntime(authorizeRelay: false) } },
                    secondaryTitle: nil, secondaryAction: nil, busy: false
                )
            case .stopping:
                setup("Stopping local services", "stop.circle", busy: true)
            case let .failed(message):
                SetupView(
                    title: "Local Lab needs attention",
                    detail: message,
                    symbol: "exclamationmark.triangle",
                    primaryTitle: "Retry",
                    primaryAction: { Task { await runtime.retry() } },
                    secondaryTitle: nil, secondaryAction: nil, busy: false
                )
            }
        }
        .frame(minWidth: 960, minHeight: 680)
        .task { await runtime.prepare() }
        .toolbar {
            if case .ready = runtime.phase {
                Button("Stop Local Services", systemImage: "stop.fill") { Task { await runtime.stopRuntime() } }
            }
        }
    }

    private func setup(_ title: String, _ symbol: String, busy: Bool, cancel: Bool = false) -> some View {
        SetupView(
            title: title,
            detail: runtime.statusDetail,
            symbol: symbol,
            primaryTitle: nil, primaryAction: nil,
            secondaryTitle: cancel ? "Cancel" : nil,
            secondaryAction: cancel ? { Task { await runtime.cancelCurrentOperation() } } : nil,
            busy: busy
        )
    }
}
