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
    this.o.onStatus("unsaved");
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

  private schedule(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private run(): Promise<void> {
    this.dirty = false; // edits made while saving set it again
    this.o.onStatus("saving");
    return (this.current = this.attempt());
  }

  private async attempt(): Promise<void> {
    try {
      const merged = await this.o.save(this.o.encode());
      this.failures = 0;
      this.current = null;
      if (this.disposed) return;
      this.o.onRemote(merged);
      if (this.dirty) { this.o.onStatus("unsaved"); this.schedule(this.o.debounceMs ?? 800); }
      else this.o.onStatus("saved");
    } catch (e) {
      this.dirty = true;
      this.current = null;
      if (this.disposed) return;
      if (e instanceof ApiError && e.status < 500) {
        this.o.onStatus("error", errorMessage(e)); // a later markDirty tries again
        return;
      }
      const delays = this.o.retryMs ?? [1000, 3000, 10000];
      this.o.onStatus("offline");
      this.schedule(delays[Math.min(this.failures++, delays.length - 1)]!);
    }
  }
}
