import UIKit
import WebKit
import Capacitor

/// The launcher (capacitor://localhost) is the only page that may reach Capacitor's plugin bridge. The chosen server's
/// page is remote: it stays in this webview and gets `cherryNative` for exports, the iOS twin of Android's MainActivity.
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        guard let bridge = bridge as? CapacitorBridge else { return }
        let content = bridge.webViewDelegationHandler.contentController
        // Capacitor's "bridge" handler runs plugin calls from any origin and frame; put an origin check in front of it.
        content.removeScriptMessageHandler(forName: "bridge")
        content.add(AppOriginOnly(inner: bridge.webViewDelegationHandler, app: bridge.config.localURL), name: "bridge")
        content.add(ExportHandler(controller: self), name: "cherryNative")
        bridge.registerPluginInstance(ServerNavigation())
    }
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
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == app.scheme, origin.host == app.host, origin.port == (app.port ?? 0) else { return }
        inner?.userContentController(controller, didReceive: message)
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

    /// Basename only, no control characters, at most 120 characters, never empty or a dot name (as MainActivity.safeName).
    static func safeName(_ name: String) -> String {
        var base = name.components(separatedBy: CharacterSet(charactersIn: "/\\")).last ?? ""
        base = base.replacingOccurrences(of: "[\\p{Cc}:*?\"<>|]", with: "_", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        if base.count > 120 {
            var ext = ""
            if let dot = base.lastIndex(of: "."), dot > base.startIndex, base.distance(from: dot, to: base.endIndex) <= 10 {
                ext = String(base[dot...])
            }
            base = String(base.prefix(120 - ext.count)) + ext
        }
        return base.isEmpty || base.allSatisfy({ $0 == "." }) ? "export" : base
    }
}
