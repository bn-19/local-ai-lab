import Foundation

enum RuntimePhase {
    case inspecting
    case needsInstall
    case installing
    case needsRelayConsent
    case starting
    case ready
    case stopped
    case stopping
    case failed(String)
}

struct WebSession: Identifiable, Equatable {
    let id = UUID()
    let token: String
}
