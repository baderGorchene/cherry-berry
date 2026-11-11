import { ApiError, errorMessage } from "../api";

export type SaveStatus = "saved" | "unsaved" | "saving" | "offline" | "error";

type Opts = {
  encode(): Uint8Array;
  save(state: Uint8Array): Promise<Uint8Array>;
  onRemote(state: Uint8Array): void;
  onStatus(s: SaveStatus, message?: string): void;
  debounceMs?: number;
  retryMs?: number[];
};

/** Debounced, single-flight saver. Failed saves keep the changes pending. */
export class Autosave {
  private dirty = false;
  private current: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private disposed = false;

  constructor(private o: Opts) {}

  get pending(): boolean { return this.dirty || this.current !== null; }

  markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.emit("unsaved");
    if (!this.current) this.schedule(this.o.debounceMs ?? 800);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    await this.current;
    if (this.dirty && !this.disposed) await this.run();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
  }

  private last?: string;
  private emit(s: SaveStatus, message?: string) {
    const key = `${s}|${message ?? ""}`;
    if (key === this.last) return;
    this.last = key;
    this.o.onStatus(s, message);
  }

  private schedule(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private run(): Promise<void> {
    clearTimeout(this.timer);
    if (this.current) return this.current; // single flight
    this.dirty = false; // edits made while saving set it again
    this.emit("saving");
    return (this.current = this.attempt());
  }

  private async attempt(): Promise<void> {
    try {
      const merged = await this.o.save(this.o.encode());
      this.failures = 0;
      this.current = null;
      if (this.disposed) return;
      this.o.onRemote(merged);
      if (this.dirty) { this.emit("unsaved"); this.schedule(this.o.debounceMs ?? 800); }
      else this.emit("saved");
    } catch (e) {
      this.dirty = true;
      this.current = null;
      if (this.disposed) return;
      if (e instanceof ApiError && e.status < 500) {
        this.emit("error", errorMessage(e)); // a later markDirty tries again
        return;
      }
      const delays = this.o.retryMs ?? [1000, 3000, 10000];
      this.emit("offline");
      this.schedule(delays[Math.min(this.failures++, delays.length - 1)]!);
    }
  }
}
