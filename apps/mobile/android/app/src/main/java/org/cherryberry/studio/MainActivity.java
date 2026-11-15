package org.cherryberry.studio;

import android.content.ActivityNotFoundException;
import android.graphics.Bitmap;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;

/**
 * The launcher (https://localhost) is the only page that may reach Capacitor's plugin bridge. The server's page is remote:
 * it stays in the webview (there is no allowNavigation, which would also widen the bridge's allowed origins), exports reach
 * the share sheet through `window.cherryNative`, and `target=_blank` / `window.open` open the system browser.
 */
public class MainActivity extends BridgeActivity {

    static final long MAX_BYTES = 100L * 1024 * 1024;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = bridge.getWebView();

        // addJavascriptInterface objects reach every origin and frame. Capacitor uses one for androidBridge when
        // WebMessageListener is missing or rejects its origin rules, and the core CapacitorCookies / CapacitorHttp plugins
        // always add one (setCookie writes any domain's cookies, no enabled check). The launcher needs none of them and
        // native-bridge.js checks each with typeof; the origin-scoped androidBridge listener stays.
        webView.removeJavascriptInterface("androidBridge");
        webView.removeJavascriptInterface("CapacitorCookiesAndroidInterface");
        webView.removeJavascriptInterface("CapacitorHttpAndroidInterface");

        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    String scheme = url.getScheme();
                    // The chosen server is any http(s) origin; Capacitor would hand it to the system browser. New windows
                    // never get here (onCreateWindow below sends them out), and the bridge is origin-scoped, not URL-scoped.
                    if (("https".equals(scheme) || "http".equals(scheme)) && !isApp(url)) {
                        view.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); // before the page loads anything
                        return false;
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    // Mixed content is only for the launcher's health check of http:// servers.
                    view
                        .getSettings()
                        .setMixedContentMode(isApp(Uri.parse(url)) ? WebSettings.MIXED_CONTENT_ALWAYS_ALLOW : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
                }
            }
        );

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // "*" because self-hosted servers are any origin; the listener checks the scheme and frame itself.
            WebViewCompat.addWebMessageListener(webView, "cherryNative", Collections.singleton("*"), (view, message, origin, isMainFrame, reply) -> {
                String scheme = origin.getScheme();
                if (!isMainFrame || !("https".equals(scheme) || "http".equals(scheme)) || message.getData() == null) return;
                String data = message.getData();
                new Thread(() -> save(data)).start(); // decoding a large export shouldn't block the UI thread
            });
        }

        webView.getSettings().setSupportMultipleWindows(true);
        webView.setWebChromeClient(
            new BridgeWebChromeClient(bridge) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    // The new window's URL only shows up when it starts loading, so hand over a throwaway WebView and catch it there.
                    WebView probe = new WebView(view.getContext());
                    probe.setWebViewClient(
                        new WebViewClient() {
                            boolean done;

                            void handOff(WebView v, Uri url) {
                                if (done) return;
                                done = true;
                                v.stopLoading();
                                openExternal(url);
                                v.post(v::destroy);
                            }

                            @Override
                            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                                handOff(v, request.getUrl());
                                return true;
                            }

                            @Override
                            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                                handOff(v, Uri.parse(url)); // some WebView versions skip shouldOverrideUrlLoading for a new window's first load
                            }
                        }
                    );
                    ((WebView.WebViewTransport) resultMsg.obj).setWebView(probe);
                    resultMsg.sendToTarget();
                    return true;
                }
            }
        );
    }

    boolean isApp(Uri url) {
        return bridge.getScheme().equals(url.getScheme()) && bridge.getHost().equals(url.getHost()) && url.getPort() == -1;
    }

    void openExternal(Uri url) {
        String scheme = url.getScheme();
        if (!("https".equals(scheme) || "http".equals(scheme))) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException e) {
            Logger.warn("No browser for " + url);
        }
    }

    void save(String json) {
        try {
            JSONObject msg = new JSONObject(json);
            if (!"save".equals(msg.optString("type"))) return;
            String b64 = msg.getString("base64");
            if ((long) b64.length() * 3 / 4 > MAX_BYTES) {
                Logger.warn("Export too large to share");
                return;
            }
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            File dir = new File(getCacheDir(), "exports");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
            File file = new File(dir, safeName(msg.optString("filename")));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            String mime = msg.optString("mime");
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType(mime.matches("[\\w.+-]+/[\\w.+-]+") ? mime : "application/octet-stream")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, file.getName())));
        } catch (Exception e) {
            Logger.error("Export share failed", e);
        }
    }

    /** Basename only, no control characters, at most 200 UTF-8 bytes (filesystems allow 255) cut at a code point,
     * keeping a short extension; never empty or a dot name. */
    static String safeName(String name) {
        String base = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        base = base.replaceAll("[\\p{Cntrl}:*?\"<>|]", "_").trim();
        if (utf8(base) > 200) {
            int dot = base.lastIndexOf('.');
            String ext = dot > 0 && base.length() - dot <= 10 ? base.substring(dot) : "";
            String stem = base.substring(0, base.length() - ext.length());
            while (utf8(stem) + utf8(ext) > 200) stem = stem.substring(0, stem.offsetByCodePoints(stem.length(), -1));
            base = stem + ext;
        }
        return base.isEmpty() || base.matches("\\.+") ? "export" : base;
    }

    static int utf8(String s) {
        return s.getBytes(StandardCharsets.UTF_8).length;
    }
}
