import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("lists every missing variable", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET|AUTH_SECRET[\s\S]*DATABASE_URL/);
  });
  it("rejects short secret", () => {
    expect(() => loadConfig({ DATABASE_URL: "pglite:memory", AUTH_SECRET: "short", PUBLIC_URL: "http://x", S3_ENDPOINT: "memory:" })).toThrow(/AUTH_SECRET/);
  });
});

const base = { DATABASE_URL: "pglite:memory", AUTH_SECRET: "a-real-secret-a-real-secret-a-real-1", PUBLIC_URL: "http://x", S3_ENDPOINT: "memory:" };

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

describe("loadConfig storage", () => {
  const { S3_ENDPOINT: _, ...noS3 } = base;
  it("loads memory: with no other S3 values", () => {
    expect(loadConfig(base).s3).toMatchObject({ endpoint: "memory:", region: "us-east-1" });
  });
  it("requires S3_BUCKET for a URL endpoint", () => {
    expect(() => loadConfig({ ...noS3, S3_ENDPOINT: "http://localhost:9000", S3_ACCESS_KEY: "a", S3_SECRET_KEY: "b" })).toThrow(/S3_BUCKET/);
  });
  it("requires S3_ENDPOINT", () => {
    expect(() => loadConfig(noS3)).toThrow(/S3_ENDPOINT/);
  });
});
