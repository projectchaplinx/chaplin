export type ProviderSchedulerSnapshot = {
  submitted: number;
  active: number;
  queued: number;
  failed: number;
  kept: number;
};

type QueueItem<T> = {
  prompt: string;
  run: (prompt: string) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  retries: number;
};

export class ProviderScheduler {
  private active = 0;
  private queue: QueueItem<unknown>[] = [];
  private snapshot: ProviderSchedulerSnapshot = { submitted: 0, active: 0, queued: 0, failed: 0, kept: 0 };

  constructor(
    readonly provider: string,
    readonly concurrency: number,
    readonly maxRetries = 2,
    readonly baseBackoffMs = 250,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Provider concurrency must be a positive integer.");
  }

  submit<T>(prompt: string, run: (prompt: string) => Promise<T>) {
    this.snapshot.submitted += 1;
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ prompt, run, resolve, reject, retries: 0 } as QueueItem<unknown>);
      this.refresh();
      this.drain();
    });
  }

  markKept() {
    this.snapshot.kept += 1;
  }

  report(): ProviderSchedulerSnapshot {
    return { ...this.snapshot };
  }

  private refresh() {
    this.snapshot.active = this.active;
    this.snapshot.queued = this.queue.length;
  }

  private drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const item = this.queue.shift()!;
      this.active += 1;
      this.refresh();
      void this.execute(item);
    }
  }

  private async execute(item: QueueItem<unknown>): Promise<void> {
    try {
      const value = await item.run(item.prompt);
      item.resolve(value);
    } catch (error) {
      if (item.retries < this.maxRetries && isTransientProviderError(error)) {
        item.retries += 1;
        await new Promise((resolve) => setTimeout(resolve, this.baseBackoffMs * 2 ** (item.retries - 1)));
        this.queue.unshift(item);
      } else {
        this.snapshot.failed += 1;
        item.reject(error);
      }
    } finally {
      this.active -= 1;
      this.refresh();
      this.drain();
    }
  }
}

export function isTransientProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:408|409|425|429|500|502|503|504|timeout|rate limit|temporar)\b/i.test(message);
}

const PROVIDER_SCHEDULERS = new Map<string, ProviderScheduler>();

export function providerScheduler(provider: string, concurrency: number) {
  const key = `${provider}:${concurrency}`;
  const existing = PROVIDER_SCHEDULERS.get(key);
  if (existing) return existing;
  const scheduler = new ProviderScheduler(provider, concurrency);
  PROVIDER_SCHEDULERS.set(key, scheduler);
  return scheduler;
}
