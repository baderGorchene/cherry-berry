use tauri::{webview::NewWindowResponse, Url, WebviewWindowBuilder};

/// The bundled launcher page: `http://tauri.localhost` on Windows, `tauri://localhost` on macOS/Linux.
pub fn is_launcher(url: &Url) -> bool {
    match (url.scheme(), url.host_str()) {
        ("http" | "https", Some("tauri.localhost")) | ("tauri", Some("localhost")) => true,
        _ => false,
    }
}

/// The window moves between the launcher and whichever server the launcher picks. `blob:` is allowed so
/// `<a download href="blob:...">` exports work; a blob URL carries its creator's origin, so it grants nothing.
pub fn allows_navigation(url: &Url) -> bool {
    is_launcher(url) || matches!(url.scheme(), "http" | "https" | "blob")
}

/// The webview's default user agent plus `CherryBerryDesktop/<version>`. A custom user agent replaces the
/// whole string, so this rebuilds each platform's default (WebView2 from its runtime version; WebKit's is frozen).
fn user_agent() -> String {
    let base = if cfg!(windows) {
        let v = tauri::webview_version().unwrap_or_else(|_| "0.0.0.0".into());
        format!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v} Safari/537.36 Edg/{v}")
    } else if cfg!(target_os = "macos") {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)".into()
    } else {
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)".into()
    };
    format!("{base} CherryBerryDesktop/{}", env!("CARGO_PKG_VERSION"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // tauri-plugin-opener is used only through its Rust `open_url`, never registered as a plugin: the plugin
    // injects a script that turns `_blank` link clicks into IPC calls, which server pages (no IPC) can't make.
    tauri::Builder::default()
        .setup(|app| {
            let config = app.config().app.windows.iter().find(|w| w.label == "main").expect("main window config");
            let builder = WebviewWindowBuilder::from_config(app, config)?
                .user_agent(&user_agent())
                .on_navigation(allows_navigation)
                // window.open and target=_blank links go to the system browser.
                .on_new_window(|url, _| {
                    if matches!(url.scheme(), "http" | "https") {
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                });
            // WebView2 saves to Downloads with the server's filename by itself; WebKit downloads only with a
            // handler, and wry then defaults the destination to Downloads/<suggested filename>.
            #[cfg(not(windows))]
            let builder = builder.on_download(|_, _| true);
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cherry Berry");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_launcher_matches_only_the_launcher_origin() {
        assert!(is_launcher(&Url::parse("http://tauri.localhost/").unwrap()));
        assert!(is_launcher(&Url::parse("tauri://localhost/").unwrap()));
        assert!(!is_launcher(&Url::parse("https://tauri.localhost.evil.com/").unwrap()));
        assert!(!is_launcher(&Url::parse("https://localhost/").unwrap()));
    }

    #[test]
    fn navigation_allows_launcher_servers_and_blob_downloads_only() {
        for ok in ["tauri://localhost/", "http://192.168.1.5:3000/", "https://cherry.example/designs", "blob:https://cherry.example/6f1c"] {
            assert!(allows_navigation(&Url::parse(ok).unwrap()), "{ok}");
        }
        for no in ["file:///C:/Windows/win.ini", "javascript:alert(1)", "mailto:a@b.c", "data:text/html,hi", "ms-settings:"] {
            assert!(!allows_navigation(&Url::parse(no).unwrap()), "{no}");
        }
    }
}
