export interface AudioCacheOptions<Value> {
  maxEntries: number;
  maxBytes: number;
  sizeOf: (value: Value) => number;
  ttlMs?: number;
}

/** Volatile successful-value cache. No storage APIs, timers or background loads. */
export class AudioCache<Value> {
  private values = new Map<string, { value: Value; bytes: number; expiresAt: number }>();
  private pending = new Map<string, Promise<Value>>();
  private bytes = 0;
  private generation = 0;
  private readonly options: AudioCacheOptions<Value>;

  constructor(options: AudioCacheOptions<Value>) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1
      || !Number.isFinite(options.maxBytes) || options.maxBytes < 1
      || (options.ttlMs != null && (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0))) {
      throw new RangeError('Audio cache limits must be positive.');
    }
    this.options = options;
  }

  async get(key: string, loader: () => Promise<Value>): Promise<Value> {
    this.removeExpired();
    const hit = this.values.get(key);
    if (hit) return hit.value;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const generation = this.generation;
    const load = Promise.resolve().then(loader).then((value) => {
      if (generation !== this.generation) return value;
      const bytes = this.options.sizeOf(value);
      if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError('Audio size must be non-negative and finite.');
      this.removeExpired();
      if (bytes <= this.options.maxBytes) {
        this.values.set(key, { value, bytes, expiresAt: this.options.ttlMs == null ? Infinity : Date.now() + this.options.ttlMs });
        this.bytes += bytes;
        while (this.values.size > this.options.maxEntries || this.bytes > this.options.maxBytes) {
          this.remove(this.values.keys().next().value!);
        }
      }
      return value;
    }).finally(() => {
      // A cleared/new request with this key must not be removed by an old load.
      if (this.pending.get(key) === load) this.pending.delete(key);
    });
    this.pending.set(key, load);
    return load;
  }

  clear(): void {
    this.generation += 1;
    this.values.clear();
    this.pending.clear();
    this.bytes = 0;
  }

  private remove(key: string): void {
    const entry = this.values.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.values.delete(key);
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.values) if (value.expiresAt <= now) this.remove(key);
  }
}
