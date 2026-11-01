import SwiftUI

struct SetupView: View {
    let title: String
    let detail: String
    let symbol: String
    let primaryTitle: String?
    let primaryAction: (() -> Void)?
    let secondaryTitle: String?
    let secondaryAction: (() -> Void)?
    let busy: Bool

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: symbol)
                .font(.system(size: 48, weight: .semibold))
                .foregroundStyle(.orange)
            Text(title).font(.largeTitle.bold())
            Text(detail)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
            if busy { ProgressView().controlSize(.large) }
            HStack {
                if let secondaryTitle, let secondaryAction {
                    Button(secondaryTitle, action: secondaryAction)
                }
                if let primaryTitle, let primaryAction {
                    Button(primaryTitle, action: primaryAction).buttonStyle(.borderedProminent)
                }
            }
        }
        .padding(48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial)
    }
}
