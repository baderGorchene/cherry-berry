import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("lists every missing variable", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET|AUTH_SECRET[\s\S]*DATABASE_URL/);
  });
  it("rejects short secret", () => {
    expect(() => loadConfig({ DATABASE_URL: "pglite:memory", AUTH_SECRET: "short", PUBLIC_URL: "http://x" })).toThrow(/AUTH_SECRET/);
  });
});

const base = { DATABASE_URL: "pglite:memory", AUTH_SECRET: "a-real-secret-a-real-secret-a-real-1", PUBLIC_URL: "http://x" };

describe("loadConfig hardening", () => {
  it("rejects the example AUTH_SECRET", () => {
    expect(() => loadConfig({ ...base, AUTH_SECRET: "change-me-32-chars-minimum-xxxxxxxx" })).toThrow(/AUTH_SECRET/);
  });
  it("parses TRUST_PROXY (default off)", () => {
    expect(loadConfig(base).trustProxy).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(loadConfig({ ...base, TRUST_PROXY: "1" }).trustProxy).toBe(1);
    expect(loadConfig({ ...base, TRUST_PROXY: "10.0.0.0/8" }).trustProxy).toBe("10.0.0.0/8");
  });
  it("logs at info by default", () => {
    expect(loadConfig(base).logLevel).toBe("info");
  });
});
