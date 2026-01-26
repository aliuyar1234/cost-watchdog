export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });

    if (this.entries.size <= this.maxEntries) return;

    // Evict oldest entries (in insertion order) to stay under maxEntries.
    const overflow = this.entries.size - this.maxEntries;
    if (overflow <= 0) return;

    const iterator = this.entries.keys();
    for (let i = 0; i < overflow; i++) {
      const next = iterator.next();
      if (next.done) break;
      this.entries.delete(next.value);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

export function buildCacheKey(prefix: string, parts: unknown[]): string {
  return `${prefix}:${JSON.stringify(parts)}`;
}
