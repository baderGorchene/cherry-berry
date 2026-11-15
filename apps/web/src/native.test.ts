import { expect, test } from "vitest";
import { launcherUrl, shell, switchServerUrl } from "./native";

const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

test("shell and launcherUrl by platform", () => {
  expect(shell(`${WIN} CherryBerryDesktop/0.1.0`)).toBe("desktop");
  expect(launcherUrl(`${WIN} CherryBerryDesktop/0.1.0`)).toBe("http://tauri.localhost/");
  expect(launcherUrl(`${MAC} CherryBerryDesktop/0.1.0`)).toBe("tauri://localhost/");
  expect(launcherUrl(`${LINUX} CherryBerryDesktop/0.1.0`)).toBe("tauri://localhost/");
  expect(shell(`${ANDROID} CherryBerryMobile/0.1.0`)).toBe("mobile");
  expect(launcherUrl(`${ANDROID} CherryBerryMobile/0.1.0`)).toBe("https://localhost/");
  expect(launcherUrl(`${IPHONE} CherryBerryMobile/0.1.0`)).toBe("capacitor://localhost/");
  // iPadOS reports a Mac user agent; a mobile shell that isn't Android is iOS.
  expect(launcherUrl(`${MAC} CherryBerryMobile/0.1.0`)).toBe("capacitor://localhost/");
});

test("plain browsers are not a shell", () => {
  expect(shell(WIN)).toBeNull();
  expect(launcherUrl(ANDROID)).toBeNull();
  expect(switchServerUrl("design.acme.com", WIN)).toBeNull();
});

test("switchServerUrl targets the launcher", () => {
  const ua = `${WIN} CherryBerryDesktop/1`;
  expect(switchServerUrl("http://10.0.0.5:3000", ua)).toBe("http://tauri.localhost/?server=http%3A%2F%2F10.0.0.5%3A3000");
  expect(switchServerUrl(null, ua)).toBe("http://tauri.localhost/?change=1");
});
