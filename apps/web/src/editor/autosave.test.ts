import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { Autosave, type SaveStatus } from "./autosave";

const merged = new Uint8Array([9, 9]);

function setup(save: (s: Uint8Array) => Promise<Uint8Array>) {
  const statuses: SaveStatus[] = [];
  const messages: (string | undefined)[] = [];
  const onRemote = vi.fn();
  const saveFn = vi.fn(save);
  const a = new Autosave({
    encode: () => new Uint8Array([1]),
    save: saveFn,
    onRemote,
    onStatus: (s, m) => { statuses.push(s); messages.push(m); },
  });
  return { a, statuses, messages, saveFn, onRemote };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Autosave", () => {
  it("debounces bursts into one save", async () => {
    const { a, statuses, saveFn } = setup(async () => merged);
    a.markDirty();
    await vi.advanceTimersByTimeAsync(200);
    a.markDirty();
    await vi.advanceTimersByTimeAsync(200);
    a.markDirty();
    expect(saveFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["unsaved", "saving", "saved"]);
    expect(a.pending).toBe(false);
  });

  it("retries offline with backoff and keeps changes", async () => {
    const { a, statuses, saveFn } = setup(async () => merged);
    saveFn.mockRejectedValueOnce(new TypeError("fetch failed")).mockRejectedValueOnce(new TypeError("fetch failed"));
    a.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("offline");
    expect(a.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(a.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(saveFn).toHaveBeenCalledTimes(3);
    expect(statuses.at(-1)).toBe("saved");
    expect(a.pending).toBe(false);
  });

  it("does not retry a 403", async () => {
    const { a, statuses, messages, saveFn } = setup(async () => merged);
    saveFn.mockRejectedValue(new ApiError(403, "forbidden"));
    a.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe("error");
    expect(messages.at(-1)).toBe("You have view-only access to this design.");
    await vi.advanceTimersByTimeAsync(20000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("edits during a save trigger one follow-up save", async () => {
    let release!: () => void;
    const { a, saveFn } = setup(() => new Promise((r) => { release = () => r(merged); }));
    a.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    expect(saveFn).toHaveBeenCalledTimes(1);
    a.markDirty();
    a.markDirty();
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFn).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(800);
    expect(saveFn).toHaveBeenCalledTimes(2);
  });

  it("applies merged state", async () => {
    const { a, onRemote } = setup(async () => merged);
    a.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    expect(onRemote).toHaveBeenCalledWith(merged);
  });

  it("flush saves immediately without breaking single flight", async () => {
    let inFlight = 0, max = 0;
    const releases: (() => void)[] = [];
    const { a, saveFn } = setup(() => {
      max = Math.max(max, ++inFlight);
      return new Promise((r) => releases.push(() => { inFlight--; r(merged); }));
    });
    a.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    a.markDirty(); // edit during save
    const flushed = a.flush();
    releases[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveFn).toHaveBeenCalledTimes(2); // flush saved now, no debounce wait
    await vi.advanceTimersByTimeAsync(5000); // stale timer must not start a third
    releases[1]!();
    await flushed;
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(max).toBe(1);
    expect(a.pending).toBe(false);
  });

  it("close keeps retrying a failing save and resolves once it is sent", async () => {
    const { a, saveFn } = setup(async () => merged);
    saveFn.mockRejectedValueOnce(new TypeError("fetch failed")).mockRejectedValueOnce(new TypeError("fetch failed"));
    a.markDirty();
    let closed = false;
    void a.close().then(() => { closed = true; }); // unmount before the debounced save
    await vi.advanceTimersByTimeAsync(0);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(closed).toBe(false);
    expect(a.pending).toBe(true); // the unload guard stays up
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(closed).toBe(false);
    await vi.advanceTimersByTimeAsync(3000); // network back
    expect(saveFn).toHaveBeenCalledTimes(3);
    expect(closed).toBe(true);
    expect(a.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(saveFn).toHaveBeenCalledTimes(3);
  });

  it("close gives up on a rejected save", async () => {
    const { a, saveFn } = setup(async () => merged);
    saveFn.mockRejectedValue(new ApiError(400, "invalid_document"));
    a.markDirty();
    await a.close();
    await vi.advanceTimersByTimeAsync(30000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("dispose stops retries", async () => {
    const { a, saveFn } = setup(async () => merged);
    saveFn.mockRejectedValue(new TypeError("fetch failed"));
    a.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    a.dispose();
    await vi.advanceTimersByTimeAsync(30000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });
});
