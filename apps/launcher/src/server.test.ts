import { afterEach, describe, expect, test, vi } from "vitest";
import { boot } from "./main";
import { checkServer, normalizeServer } from "./server";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

test("normalizes and validates server addresses", () => {
  expect(normalizeServer("design.acme.com")).toEqual({ origin: "https://design.acme.com", insecure: false });
  expect(normalizeServer(" https://design.acme.com/login ")).toEqual({ origin: "https://design.acme.com", insecure: false });
  expect(normalizeServer("http://10.0.0.5:3000/x/")).toEqual({ origin: "http://10.0.0.5:3000", insecure: true });
  expect(normalizeServer("localhost:3000")).toEqual({ origin: "https://localhost:3000", insecure: false });
  expect(normalizeServer("")).toEqual({ error: "empty" });
  expect(normalizeServer("   ")).toEqual({ error: "empty" });
  expect(normalizeServer("ht!tp://")).toEqual({ error: "invalid" });
  expect(normalizeServer("ftp://design.acme.com")).toEqual({ error: "invalid" });
});

describe("checkServer", () => {
  afterEach(() => { vi.useRealTimers(); });

  test("ok only for a Cherry Berry health check", async () => {
    const f = vi.fn(async () => json({ status: "ok", app: "cherry-berry" }));
    expect(await checkServer("https://design.acme.com", f)).toBe("ok");
    expect(f).toHaveBeenCalledWith("https://design.acme.com/api/health", expect.anything());
  });

  test("not_cherry for HTML or other JSON", async () => {
    expect(await checkServer("https://x.org", async () => new Response("<!doctype html><p>hi</p>"))).toBe("not_cherry");
    expect(await checkServer("https://x.org", async () => json({ status: "ok" }))).toBe("not_cherry");
    expect(await checkServer("https://x.org", async () => new Response("nope", { status: 404 }))).toBe("not_cherry");
  });

  test("unreachable when fetch rejects or times out", async () => {
    expect(await checkServer("https://x.org", async () => { throw new TypeError("Failed to fetch"); })).toBe("unreachable");
    vi.useFakeTimers();
    const hang = (_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const result = checkServer("https://x.org", hang as typeof fetch);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toBe("unreachable");
  });
});

describe("boot", () => {
  const check = (r: "ok" | "not_cherry" | "unreachable") => vi.fn(async () => r);

  test("unreachable remembered server shows retry", async () => {
    expect(await boot({ search: "", stored: "https://design.acme.com" }, { check: check("unreachable") }))
      .toEqual({ view: "unreachable", host: "design.acme.com", origin: "https://design.acme.com" });
  });

  test("a reachable remembered server is opened", async () => {
    expect(await boot({ search: "", stored: "https://design.acme.com" }, { check: check("ok") }))
      .toEqual({ view: "go", origin: "https://design.acme.com" });
  });

  test("nothing stored or ?change=1 shows the picker", async () => {
    const c = check("ok");
    expect(await boot({ search: "", stored: null }, { check: c })).toEqual({ view: "picker", value: "" });
    expect(await boot({ search: "?change=1", stored: "https://a.org" }, { check: c })).toEqual({ view: "picker", value: "https://a.org" });
    expect(c).not.toHaveBeenCalled();
  });

  test("?server= is normalized and checked", async () => {
    expect(await boot({ search: "?server=" + encodeURIComponent("b.org/x"), stored: "https://a.org" }, { check: check("ok") }))
      .toEqual({ view: "go", origin: "https://b.org" });
    expect(await boot({ search: "?server=b.org", stored: null }, { check: check("not_cherry") }))
      .toEqual({ view: "picker", value: "b.org", error: "b.org isn't a Cherry Berry server." });
    expect(await boot({ search: "?server=ht!tp://", stored: null }, { check: check("ok") }))
      .toEqual({ view: "picker", value: "ht!tp://", error: "Enter an address like design.your-company.com." });
  });
});
