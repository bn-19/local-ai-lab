import AppKit
import LocalLabCore
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct LocalWorkspaceView: NSViewRepresentable {
    let session: WebSession

    func makeCoordinator() -> Coordinator { Coordinator(token: session.token) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.pairingScript(token: session.token), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isInspectable = false
        webView.load(URLRequest(url: TrustedNavigation.app, cachePolicy: .reloadIgnoringLocalCacheData))
        return webView
    }

    private static func pairingScript(token: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [token]),
              let json = String(data: data, encoding: .utf8) else { return "" }
        return """
        (() => {
          const token = \(json)[0];
          window.addEventListener('local-lab-web-ready', () => {
            const trusted = location.protocol === 'http:' && location.hostname === '127.0.0.1' &&
              location.port === '4173' && (location.pathname === '/app' || location.pathname === '/app/' || location.pathname.startsWith('/app/'));
            if (!trusted) return;
            const input = document.getElementById('pair-token');
            const form = document.getElementById('pair-form');
            if (!input || !form) return;
            input.value = token;
            form.requestSubmit();
          }, { once: true });
        })();
        """
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.token = session.token
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var token: String
        init(token: String) { self.token = token }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.targetFrame?.isMainFrame != false,
                  TrustedNavigation.allows(navigationAction.request.url) else {
                decisionHandler(.cancel); return
            }
            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            decisionHandler(TrustedNavigation.allows(navigationResponse.response.url) ? .allow : .cancel)
        }

        func webView(
            _ webView: WKWebView,
            runOpenPanelWith parameters: WKOpenPanelParameters,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping ([URL]?) -> Void
        ) {
            guard TrustedNavigation.allows(frame.request.url) else { completionHandler(nil); return }
            let panel = NSOpenPanel()
            panel.canChooseDirectories = false
            panel.canChooseFiles = true
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.allowedContentTypes = [.commaSeparatedText, .plainText, .pdf, .image]
            panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? { nil }
    }
}
