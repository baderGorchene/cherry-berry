import type { CapacitorConfig } from "@capacitor/cli";
import pkg from "./package.json" with { type: "json" };

// The app ships only the launcher; it navigates the webview to the chosen server's own web app (plan Decisions 1, 4, 5).
// No allowNavigation: Capacitor turns it into the plugin bridge's allowed origins, so the server's page would get the
// bridge. MainActivity / AppViewController keep http(s) main-frame navigations in the webview themselves instead.
const config: CapacitorConfig = {
  appId: "org.cherryberry.studio",
  appName: "Cherry Berry",
  webDir: "../launcher/dist",
  appendUserAgent: `CherryBerryMobile/${pkg.version}`,
  backgroundColor: "#FBF7FC",
  server: {
    androidScheme: "https",
    cleartext: true, // self-hosted http:// LAN servers
  },
  android: {
    allowMixedContent: true, // the https://localhost launcher health-checks http:// servers; MainActivity allows it on the launcher only
  },
};

export default config;
