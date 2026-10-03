/**
 * The web composables persist to `localStorage`. Node has none, so the tests
 * get an in-memory one — the behaviour under test is what the composables DO
 * with storage, not the browser's implementation of it.
 */
class MemoryStorage {
  private items = new Map<string, string>();
  get length(): number { return this.items.size; }
  key(i: number): string | null { return [...this.items.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.items.get(k) ?? null; }
  setItem(k: string, v: string): void { this.items.set(k, String(v)); }
  removeItem(k: string): void { this.items.delete(k); }
  clear(): void { this.items.clear(); }
}
(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
