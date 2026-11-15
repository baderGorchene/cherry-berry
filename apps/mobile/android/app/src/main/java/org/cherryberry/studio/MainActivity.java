package org.cherryberry.studio;

import android.content.ActivityNotFoundException;
import android.graphics.Bitmap;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.Logger;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Collections;
import org.json.JSONObject;

/**
 * Two things Capacitor doesn't do for the server's page (it is remote, so Capacitor's plugin bridge isn't injected there):
 * exports reach the share sheet through `window.cherryNative`, and `target=_blank` / `window.open` open the system browser.
 */
public class MainActivity extends BridgeActivity {

    static final long MAX_BYTES = 100L * 1024 * 1024;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = bridge.getWebView();

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

    /** Basename only, no control characters, at most 120 characters, never empty or a dot name. */
    static String safeName(String name) {
        String base = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        base = base.replaceAll("[\\p{Cntrl}:*?\"<>|]", "_").trim();
        if (base.length() > 120) {
            int dot = base.lastIndexOf('.');
            String ext = dot > 0 && base.length() - dot <= 10 ? base.substring(dot) : "";
            base = base.substring(0, 120 - ext.length()) + ext;
        }
        return base.isEmpty() || base.matches("\\.+") ? "export" : base;
    }
}
