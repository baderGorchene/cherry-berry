use tauri::{webview::NewWindowResponse, Url, WebviewWindowBuilder};

/// The bundled launcher page: `http://tauri.localhost` on Windows, `tauri://localhost` on macOS/Linux.
pub fn is_launcher(url: &Url) -> bool {
    match (url.scheme(), url.host_str()) {
        ("http" | "https", Some("tauri.localhost")) | ("tauri", Some("localhost")) => true,
        _ => false,
    }
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config = app.config().app.windows.iter().find(|w| w.label == "main").expect("main window config");
            let builder = WebviewWindowBuilder::from_config(app, config)?
                .user_agent(&user_agent())
                // The window moves between the launcher and whichever server the launcher picks.
                .on_navigation(|url| is_launcher(url) || matches!(url.scheme(), "http" | "https"))
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
}
