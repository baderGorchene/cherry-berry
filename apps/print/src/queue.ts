export class BusyError extends Error {
  constructor() {
    super("busy");
  }
}

/** Runs jobs one at a time. Up to `maxWaiting` may wait behind the running one; more throw BusyError. */
export function createQueue(maxWaiting: number): <T>(job: () => Promise<T>) => Promise<T> {
  let running = false;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (running) {
      if (waiting.length >= maxWaiting) throw new BusyError();
      await new Promise<void>((resolve) => waiting.push(resolve)); // slot is handed over still marked running
    }
    running = true;
    try {
      return await job();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running = false;
    }
  };
}
