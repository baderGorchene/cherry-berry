import UIKit
import WebKit
import Capacitor

/// The launcher (capacitor://localhost) is the only page that may reach Capacitor's plugin bridge. The chosen server's
/// page is remote: it stays in this webview and gets `cherryNative` for exports, the iOS twin of Android's MainActivity.
class AppViewController: CAPBridgeViewController {
    private var uiGuard: CookiePromptGuard? // WKWebView holds its uiDelegate weakly

    override func capacitorDidLoad() {
        guard let bridge = bridge as? CapacitorBridge else { return }
        let handler = bridge.webViewDelegationHandler
        let app = bridge.config.localURL
        // Capacitor's "bridge" handler runs plugin calls from any origin and frame; put an origin check in front of it.
        handler.contentController.removeScriptMessageHandler(forName: "bridge")
        handler.contentController.add(AppOriginOnly(inner: handler, app: app), name: "bridge")
        handler.contentController.add(ExportHandler(controller: self), name: "cherryNative")
        bridge.registerPluginInstance(ServerNavigation())
        // CapacitorCookies also listens on prompt() with no origin check; screen that too.
        uiGuard = CookiePromptGuard(inner: handler, app: app)
        webView?.uiDelegate = uiGuard
    }
}

/// True for the app origin's (capacitor://localhost) main frame.
func isAppMainFrame(_ frame: WKFrameInfo, _ app: URL) -> Bool {
    let origin = frame.securityOrigin
    return frame.isMainFrame && origin.protocol == app.scheme && origin.host == app.host && origin.port == (app.port ?? 0)
}

/// Forwards script messages to Capacitor only from the app origin's main frame.
final class AppOriginOnly: NSObject, WKScriptMessageHandler {
    weak var inner: WKScriptMessageHandler?
    let app: URL

    init(inner: WKScriptMessageHandler, app: URL) {
        self.inner = inner
        self.app = app
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard isAppMainFrame(message.frameInfo, app) else { return }
        inner?.userContentController(controller, didReceive: message)
    }
}

/// Capacitor's WKUIDelegate, except a `{"type":"CapacitorCookies.…"}` prompt from any other frame or origin gets nil.
/// Every other WKUIDelegate call (alert, confirm, other prompts, new windows to Safari, permissions) is forwarded as is.
final class CookiePromptGuard: NSObject, WKUIDelegate {
    weak var inner: WebViewDelegationHandler?
    let app: URL

    init(inner: WebViewDelegationHandler, app: URL) {
        self.inner = inner
        self.app = app
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (inner?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        inner
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        if !isAppMainFrame(frame, app),
           let payload = (try? JSONSerialization.jsonObject(with: Data(prompt.utf8), options: .fragmentsAllowed)) as? [String: Any],
           (payload["type"] as? String)?.hasPrefix("CapacitorCookies.") == true {
            completionHandler(nil)
            return
        }
        guard let inner = inner else { return completionHandler(nil) }
        inner.webView(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText,
                      initiatedByFrame: frame, completionHandler: completionHandler)
    }
}

/// The chosen server is any http(s) origin. Without allowNavigation Capacitor would open it in Safari, so same-window
/// loads stay here; new windows (no target frame) still fall through to Capacitor, which opens them in Safari.
class ServerNavigation: CAPPlugin, CAPBridgedPlugin {
    let identifier = "ServerNavigation"
    let jsName = "ServerNavigation"
    let pluginMethods: [CAPPluginMethod] = []

    override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        let scheme = navigationAction.request.url?.scheme?.lowercased()
        guard navigationAction.targetFrame != nil, scheme == "https" || scheme == "http" else { return nil }
        return NSNumber(value: false)
    }
}

/// `{type:"save", filename, mime, base64}` from an http(s) main frame: write a temp file, open the share sheet.
final class ExportHandler: NSObject, WKScriptMessageHandler {
    static let maxBytes = 100 * 1024 * 1024
    weak var controller: UIViewController?

    init(controller: UIViewController) {
        self.controller = controller
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let scheme = message.frameInfo.securityOrigin.protocol
        guard message.frameInfo.isMainFrame, scheme == "https" || scheme == "http", let json = message.body as? String else { return }
        DispatchQueue.global(qos: .userInitiated).async { self.save(json) } // decoding a large export shouldn't block the UI
    }

    func save(_ json: String) {
        guard let msg = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any],
              msg["type"] as? String == "save", let b64 = msg["base64"] as? String else { return }
        guard b64.utf8.count * 3 / 4 <= Self.maxBytes, let bytes = Data(base64Encoded: b64) else {
            NSLog("Export too large or not base64")
            return
        }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("exports", isDirectory: true)
        let file = dir.appendingPathComponent(Self.safeName(msg["filename"] as? String ?? ""))
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try bytes.write(to: file)
        } catch {
            NSLog("Export share failed: \(error)")
            return
        }
        DispatchQueue.main.async {
            guard let view = self.controller?.view else { return }
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view // iPad presents it as a popover
            sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
            sheet.popoverPresentationController?.permittedArrowDirections = []
            self.controller?.present(sheet, animated: true)
        }
    }

    /// Basename only, no control characters, at most 200 UTF-8 bytes (filesystems allow 255) cut at a character,
    /// keeping a short extension; never empty or a dot name (as MainActivity.safeName).
    static func safeName(_ name: String) -> String {
        var base = name.components(separatedBy: CharacterSet(charactersIn: "/\\")).last ?? ""
        base = base.replacingOccurrences(of: "[\\p{Cc}:*?\"<>|]", with: "_", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        if base.utf8.count > 200 {
            var ext = ""
            if let dot = base.lastIndex(of: "."), dot > base.startIndex, base.distance(from: dot, to: base.endIndex) <= 10 {
                ext = String(base[dot...])
            }
            var stem = String(base.dropLast(ext.count))
            while stem.utf8.count + ext.utf8.count > 200 { stem.removeLast() }
            base = stem + ext
        }
        return base.isEmpty || base.allSatisfy({ $0 == "." }) ? "export" : base
    }
}
