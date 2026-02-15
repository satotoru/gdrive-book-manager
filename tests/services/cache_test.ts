import { assertEquals } from "@std/assert";
import { CacheService } from "../../src/services/cache.ts";

Deno.test("Cache - stores and retrieves data (PER-001)", () => {
  const cache = new CacheService(60000); // 1 minute TTL
  cache.set("key1", { data: "value1" });
  const result = cache.get<{ data: string }>("key1");
  assertEquals(result?.data, "value1");
});

Deno.test("Cache - returns null for missing key", () => {
  const cache = new CacheService();
  assertEquals(cache.get("nonexistent"), null);
});

Deno.test("Cache - TTL expiry (PER-002)", () => {
  const cache = new CacheService(1); // 1ms TTL
  cache.set("key1", "value1");

  // Wait for expiry - use a synchronous delay
  const start = Date.now();
  while (Date.now() - start < 10) {
    // busy wait
  }

  assertEquals(cache.get("key1"), null);
});

Deno.test("Cache - invalidate specific key (PER-003)", () => {
  const cache = new CacheService();
  cache.set("key1", "value1");
  cache.set("key2", "value2");

  cache.invalidate("key1");
  assertEquals(cache.get("key1"), null);
  assertEquals(cache.get("key2"), "value2");
});

Deno.test("Cache - invalidateAll", () => {
  const cache = new CacheService();
  cache.set("key1", "value1");
  cache.set("key2", "value2");

  cache.invalidateAll();
  assertEquals(cache.get("key1"), null);
  assertEquals(cache.get("key2"), null);
});

Deno.test("Cache - invalidateByPrefix (PER-003)", () => {
  const cache = new CacheService();
  cache.set("books:list:1", "data1");
  cache.set("books:list:2", "data2");
  cache.set("books:search:test", "data3");

  cache.invalidateByPrefix("books:list");
  assertEquals(cache.get("books:list:1"), null);
  assertEquals(cache.get("books:list:2"), null);
  assertEquals(cache.get("books:search:test"), "data3");
});

Deno.test("Cache - has method", () => {
  const cache = new CacheService();
  cache.set("key1", "value1");
  assertEquals(cache.has("key1"), true);
  assertEquals(cache.has("key2"), false);
});

Deno.test("Cache - size property", () => {
  const cache = new CacheService();
  assertEquals(cache.size, 0);
  cache.set("key1", "value1");
  assertEquals(cache.size, 1);
  cache.set("key2", "value2");
  assertEquals(cache.size, 2);
});

Deno.test("Cache - same key search returns cached result (PER-004)", () => {
  const cache = new CacheService();
  const searchResult = { files: [{ id: "1", name: "test" }] };
  cache.set("books:search:test", searchResult);

  const cached = cache.get("books:search:test");
  assertEquals(cached, searchResult);
});
