import { expect, it } from "vitest";
import { BusyError, createQueue } from "./queue.ts";

it("queue runs one job at a time and rejects the fifth waiter", async () => {
  const q = createQueue(4);
  let active = 0;
  let peak = 0;
  const releases: (() => void)[] = [];
  const job = () =>
    new Promise<number>((resolve) => {
      active++;
      peak = Math.max(peak, active);
      releases.push(() => {
        active--;
        resolve(1);
      });
    });
  const first = q(job); // running
  const waiting = [q(job), q(job), q(job), q(job)]; // 4 waiting
  await expect(q(job)).rejects.toBeInstanceOf(BusyError);
  const all = Promise.all([first, ...waiting]);
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 5));
    releases[i]?.();
  }
  await all;
  expect(peak).toBe(1);
});

it("queue keeps going after a failed job", async () => {
  const q = createQueue(1);
  await expect(q(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
  await expect(q(async () => 7)).resolves.toBe(7);
});
