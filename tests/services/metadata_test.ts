import { assertEquals } from "@std/assert";
import { BookMetadata, BookMetadataService } from "../../src/types.ts";
import { CompositeMetadataService } from "../../src/services/metadata.ts";

// Mock metadata services for testing
class MockOpenBDService implements BookMetadataService {
  private data: Map<string, BookMetadata> = new Map();

  addBook(isbn: string, metadata: BookMetadata): void {
    this.data.set(isbn, metadata);
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    await Promise.resolve();
    return this.data.get(isbn) || null;
  }
}

class MockGoogleBooksService implements BookMetadataService {
  private data: Map<string, BookMetadata> = new Map();

  addBook(isbn: string, metadata: BookMetadata): void {
    this.data.set(isbn, metadata);
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    await Promise.resolve();
    return this.data.get(isbn) || null;
  }
}

Deno.test("CompositeMetadata - fetches from primary source (REG-001)", async () => {
  const openbd = new MockOpenBDService();
  const googleBooks = new MockGoogleBooksService();

  openbd.addBook("9784101010014", {
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "https://example.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result !== null, true);
  assertEquals(result!.title, "人間失格");
  assertEquals(result!.authors, "太宰治");
  assertEquals(result!.publisher, "新潮社");
  assertEquals(result!.publishedDate, "1952-01-01");
  assertEquals(result!.description, "太宰治の代表作");
  assertEquals(result!.coverImageUrl, "https://example.com/cover.jpg");
});

Deno.test("CompositeMetadata - fetched fields completeness (REG-007)", async () => {
  const openbd = new MockOpenBDService();
  openbd.addBook("9784101010014", {
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "概要テスト",
    coverImageUrl: "https://example.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result !== null, true);
  // All 6 fields should be present
  assertEquals(typeof result!.title, "string");
  assertEquals(typeof result!.authors, "string");
  assertEquals(typeof result!.publisher, "string");
  assertEquals(typeof result!.publishedDate, "string");
  assertEquals(typeof result!.description, "string");
  assertEquals(typeof result!.coverImageUrl, "string");

  assertEquals(result!.title.length > 0, true);
  assertEquals(result!.authors.length > 0, true);
  assertEquals(result!.publisher.length > 0, true);
});

Deno.test("CompositeMetadata - falls back to secondary (REG-002)", async () => {
  const openbd = new MockOpenBDService();
  const googleBooks = new MockGoogleBooksService();

  // Only in Google Books, not in OpenBD
  googleBooks.addBook("1234567890123", {
    isbn: "1234567890123",
    title: "English Book",
    authors: "Author A",
    publisher: "Publisher",
    publishedDate: "2020-01-01",
    description: "An English book",
    coverImageUrl: "https://example.com/en-cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("1234567890123");

  assertEquals(result !== null, true);
  assertEquals(result!.title, "English Book");
});

Deno.test("CompositeMetadata - returns null when not found anywhere (REG-003)", async () => {
  const openbd = new MockOpenBDService();
  const googleBooks = new MockGoogleBooksService();

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("0000000000000");

  assertEquals(result, null);
});

// Tracking mock: records call count and optionally throws errors
class TrackingMockService implements BookMetadataService {
  callCount = 0;
  private result: BookMetadata | null;
  private shouldThrow: boolean;

  constructor(result: BookMetadata | null, shouldThrow = false) {
    this.result = result;
    this.shouldThrow = shouldThrow;
  }

  async fetchByIsbn(_isbn: string): Promise<BookMetadata | null> {
    this.callCount++;
    await Promise.resolve();
    if (this.shouldThrow) throw new Error("Service error");
    return this.result;
  }
}

// AC-META-01: OpenBDに完全な情報がある場合はGoogle Booksを呼ばない
Deno.test("CompositeMetadata - AC-META-01: does not call secondary when primary is complete", async () => {
  const openbd = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "https://openbd.com/cover.jpg",
  });
  const googleBooks = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格 (Google)",
    authors: "太宰 治",
    publisher: "新潮社 (Google)",
    publishedDate: "2020",
    description: "Google description",
    coverImageUrl: "https://google.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result!.title, "人間失格");
  assertEquals(result!.coverImageUrl, "https://openbd.com/cover.jpg");
  assertEquals(googleBooks.callCount, 0);
});

// AC-META-02: coverImageUrl欠損時にGoogle Booksで補完
Deno.test("CompositeMetadata - AC-META-02: supplements coverImageUrl from Google Books", async () => {
  const openbd = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "",
  });
  const googleBooks = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "Google description",
    coverImageUrl: "https://google.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result!.coverImageUrl, "https://google.com/cover.jpg");
  assertEquals(result!.title, "人間失格");
  assertEquals(result!.authors, "太宰治");
  assertEquals(result!.description, "太宰治の代表作");
});

// AC-META-03: description欠損時にGoogle Booksで補完
Deno.test("CompositeMetadata - AC-META-03: supplements description from Google Books", async () => {
  const openbd = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "",
    coverImageUrl: "https://openbd.com/cover.jpg",
  });
  const googleBooks = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "Google description",
    coverImageUrl: "https://google.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result!.description, "Google description");
  assertEquals(result!.coverImageUrl, "https://openbd.com/cover.jpg");
});

// AC-META-04: 複数フィールド欠損の一括補完
Deno.test("CompositeMetadata - AC-META-04: supplements multiple missing fields", async () => {
  const openbd = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "",
    publishedDate: "1952-01-01",
    description: "",
    coverImageUrl: "",
  });
  const googleBooks = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰 治",
    publisher: "新潮社",
    publishedDate: "2020",
    description: "Google description",
    coverImageUrl: "https://google.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result!.publisher, "新潮社");
  assertEquals(result!.description, "Google description");
  assertEquals(result!.coverImageUrl, "https://google.com/cover.jpg");
  assertEquals(result!.title, "人間失格");
  assertEquals(result!.authors, "太宰治");
});

// AC-META-05: Google Booksも欠損フィールドを持たない場合は空のまま
Deno.test("CompositeMetadata - AC-META-05: keeps field empty when secondary also lacks it", async () => {
  const openbd = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "",
  });
  const googleBooks = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "Google description",
    coverImageUrl: "",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result!.coverImageUrl, "");
  assertEquals(result!.title, "人間失格");
});

// AC-META-06: OpenBDで結果が取得できない場合は従来通りGoogle Booksにフォールバック
Deno.test("CompositeMetadata - AC-META-06: falls back to Google Books when OpenBD returns null", async () => {
  const openbd = new TrackingMockService(null);
  const googleBooks = new TrackingMockService({
    isbn: "1234567890123",
    title: "English Book",
    authors: "Author A",
    publisher: "Publisher",
    publishedDate: "2020-01-01",
    description: "An English book",
    coverImageUrl: "https://google.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("1234567890123");

  assertEquals(result!.title, "English Book");
  assertEquals(googleBooks.callCount, 1);
});

// AC-META-07: 両方のAPIで取得できない場合は null を返す
Deno.test("CompositeMetadata - AC-META-07: returns null when both services return null", async () => {
  const openbd = new TrackingMockService(null);
  const googleBooks = new TrackingMockService(null);

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("0000000000000");

  assertEquals(result, null);
});

// AC-META-08: OpenBD呼び出しが失敗した場合はGoogle Booksにフォールバック
Deno.test("CompositeMetadata - AC-META-08: falls back to Google Books on OpenBD error", async () => {
  const openbd = new TrackingMockService(null, true);
  const googleBooks = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "Google description",
    coverImageUrl: "https://google.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result !== null, true);
  assertEquals(result!.title, "人間失格");
  assertEquals(googleBooks.callCount, 1);
});

// AC-META-09: Google Books呼び出しが失敗した場合はOpenBDの結果をそのまま返す
Deno.test("CompositeMetadata - AC-META-09: returns partial OpenBD result on Google Books error", async () => {
  const openbd = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "",
  });
  const googleBooks = new TrackingMockService(null, true);

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(result !== null, true);
  assertEquals(result!.title, "人間失格");
  assertEquals(result!.coverImageUrl, "");
});

// AC-META-10: authorsフィールドがstring型で返される
Deno.test("CompositeMetadata - AC-META-10: authors field is supplemented as string from Google Books", async () => {
  const openbd = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "https://openbd.com/cover.jpg",
  });
  const googleBooks = new TrackingMockService({
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治-太宰二郎",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "Google description",
    coverImageUrl: "https://google.com/cover.jpg",
  });

  const composite = new CompositeMetadataService([openbd, googleBooks]);
  const result = await composite.fetchByIsbn("9784101010014");

  assertEquals(typeof result!.authors, "string");
  assertEquals(result!.authors, "太宰治-太宰二郎");
  assertEquals(result!.coverImageUrl, "https://openbd.com/cover.jpg");
});

export { MockOpenBDService, MockGoogleBooksService };
