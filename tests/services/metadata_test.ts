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

export { MockOpenBDService, MockGoogleBooksService };
