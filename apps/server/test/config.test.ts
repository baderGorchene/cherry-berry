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
