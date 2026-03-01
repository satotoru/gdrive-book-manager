import { assertEquals, assertRejects } from "@std/assert";
import { BookService } from "../../src/services/book.ts";
import { MockGoogleDriveService } from "../../src/services/drive_mock.ts";
import { CacheService } from "../../src/services/cache.ts";
import { BookMetadata, BookMetadataService } from "../../src/types.ts";

class MockMetadataService implements BookMetadataService {
  private data: Map<string, BookMetadata> = new Map();

  addBook(isbn: string, metadata: BookMetadata): void {
    this.data.set(isbn, metadata);
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    await Promise.resolve();
    return this.data.get(isbn) || null;
  }
}

function createTestServices() {
  const drive = new MockGoogleDriveService();
  const metadata = new MockMetadataService();
  const cache = new CacheService();
  const bookService = new BookService(drive, metadata, cache);
  return { drive, metadata, cache, bookService };
}

const sampleMetadata: BookMetadata = {
  isbn: "9784101010014",
  title: "人間失格",
  authors: "太宰治",
  publisher: "新潮社",
  publishedDate: "1952-01-01",
  description: "太宰治の代表作",
  coverImageUrl: "",
};

Deno.test("BookService - registerBook creates file with correct name (DRV-001)", async () => {
  const { drive, bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(sampleMetadata, content, "application/epub+zip");

  assertEquals(file.name, "[太宰治] 人間失格.epub");
});

Deno.test("BookService - registerBook creates file with correct PDF name (DRV-002)", async () => {
  const { bookService } = createTestServices();
  const meta = { ...sampleMetadata, authors: "夏目漱石", title: "坊っちゃん" };
  const content = new TextEncoder().encode("pdf content");
  const file = await bookService.registerBook(meta, content, "application/pdf");

  assertEquals(file.name, "[夏目漱石] 坊っちゃん.pdf");
});

Deno.test("BookService - registerBook sets all properties (DRV-003, DAT-001 - DAT-007)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(sampleMetadata, content, "application/epub+zip");

  assertEquals(file.properties.app_type, "my_library_book");
  assertEquals(file.properties.isbn, "9784101010014");
  assertEquals(file.properties.title, "人間失格");
  assertEquals(file.properties.authors, "太宰治");
  assertEquals(file.properties.publisher, "新潮社");
  assertEquals(file.properties.published_date, "1952-01-01");
});

Deno.test("BookService - registerBook creates folder structure (DRV-004, DRV-005)", async () => {
  const { drive, bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(sampleMetadata, content, "application/epub+zip");

  // Check the file is in the author folder
  const folderId = file.parents[0];
  const folder = drive.files.get(folderId);
  assertEquals(folder?.name, "太宰治");

  // Check author folder is in MyLibrary
  const myLibId = folder?.parents[0];
  const myLib = drive.files.get(myLibId!);
  assertEquals(myLib?.name, "MyLibrary");
});

Deno.test("BookService - registerBook reuses author folder (DRV-006)", async () => {
  const { drive, bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  const file1 = await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const meta2 = { ...sampleMetadata, isbn: "9784101010015", title: "斜陽" };
  const file2 = await bookService.registerBook(meta2, content, "application/epub+zip");

  // Both files should be in the same author folder
  assertEquals(file1.parents[0], file2.parents[0]);

  // Count author folders under MyLibrary
  const myLibId = await drive.ensureMyLibraryFolder();
  const myLibChildren = await drive.findFilesByParent(myLibId);
  const authorFolders = myLibChildren.filter(
    (f) => f.mimeType === "application/vnd.google-apps.folder" && f.name === "太宰治",
  );
  assertEquals(authorFolders.length, 1);
});

Deno.test("BookService - registerBook with multiple authors (DRV-007)", async () => {
  const { drive, bookService } = createTestServices();
  const meta = { ...sampleMetadata, authors: "著者A-著者B" };
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(meta, content, "application/epub+zip");

  assertEquals(file.name, "[著者A-著者B] テスト.epub".replace("テスト", "人間失格"));

  // Should be in first author's folder
  const folderId = file.parents[0];
  const folder = drive.files.get(folderId);
  assertEquals(folder?.name, "著者A");
});

Deno.test("BookService - registerBook with empty ISBN (DRV-009, REG-006)", async () => {
  const { bookService } = createTestServices();
  const meta: BookMetadata = {
    isbn: "",
    title: "手動登録テスト",
    authors: "テスト著者",
    publisher: "",
    publishedDate: "",
    description: "",
    coverImageUrl: "",
  };
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(meta, content, "application/epub+zip");

  assertEquals(file.properties.isbn, "");
  assertEquals(file.properties.title, "手動登録テスト");
});

Deno.test("BookService - registerBook stores description (DAT-010)", async () => {
  const { bookService } = createTestServices();
  const meta = { ...sampleMetadata, description: "これは概要です" };
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(meta, content, "application/epub+zip");

  assertEquals(file.properties.description, "これは概要です");
});

Deno.test("BookService - listBooks returns registered books (BRW-001)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");

  const result = await bookService.listBooks();
  assertEquals(result.files.length, 1);
  assertEquals(result.files[0].properties.title, "人間失格");
});

Deno.test("BookService - listBooks caches results (PER-001)", async () => {
  const { bookService, cache } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");

  // First call should populate cache
  await bookService.listBooks();
  assertEquals(cache.size > 0, true);

  // Second call should hit cache
  const result = await bookService.listBooks();
  assertEquals(result.files.length, 1);
});

Deno.test("BookService - registerBook invalidates cache (PER-003)", async () => {
  const { bookService, cache } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  await bookService.listBooks(); // populate cache
  const cacheSize = cache.size;

  // Register another book
  const meta2 = { ...sampleMetadata, isbn: "9784101010015", title: "新刊" };
  await bookService.registerBook(meta2, content, "application/epub+zip");

  // Cache should have been invalidated
  // New list should include both books
  const result = await bookService.listBooks();
  assertEquals(result.files.length, 2);
});

Deno.test("BookService - searchBooks (SRC-001)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const meta2 = { ...sampleMetadata, isbn: "2", title: "斜陽", authors: "太宰治" };
  await bookService.registerBook(meta2, content, "application/epub+zip");

  const result = await bookService.searchBooks("人間失格");
  assertEquals(result.files.length, 1);
  assertEquals(result.files[0].properties.title, "人間失格");
});

Deno.test("BookService - searchBooks by author (SRC-002)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const meta2 = { ...sampleMetadata, isbn: "2", title: "坊っちゃん", authors: "夏目漱石" };
  await bookService.registerBook(meta2, content, "application/epub+zip");

  const result = await bookService.searchBooks("太宰治");
  assertEquals(result.files.length, 1);
  assertEquals(result.files[0].properties.authors, "太宰治");
});

Deno.test("BookService - searchBooks clear returns all (SRC-008)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const meta2 = { ...sampleMetadata, isbn: "2", title: "斜陽" };
  await bookService.registerBook(meta2, content, "application/epub+zip");

  // Listing all should return both
  const result = await bookService.listBooks();
  assertEquals(result.files.length, 2);
});

Deno.test("BookService - downloadBook returns correct content (DWN-001, DWN-002, DWN-003)", async () => {
  const { bookService } = createTestServices();
  const originalContent = new TextEncoder().encode("This is an EPUB file content");

  await bookService.registerBook(sampleMetadata, originalContent, "application/epub+zip");
  const list = await bookService.listBooks();
  const bookId = list.files[0].id;

  const { content, file } = await bookService.downloadBook(bookId);
  assertEquals(content, originalContent);
  assertEquals(file.mimeType, "application/epub+zip");
});

Deno.test("BookService - downloadBookStream returns correct content (DWN-001, DWN-002, DWN-003)", async () => {
  const { bookService } = createTestServices();
  const originalContent = new TextEncoder().encode("This is an EPUB file content for streaming");

  await bookService.registerBook(sampleMetadata, originalContent, "application/epub+zip");
  const list = await bookService.listBooks();
  const bookId = list.files[0].id;

  const { stream, file } = await bookService.downloadBookStream(bookId);
  assertEquals(file.mimeType, "application/epub+zip");

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  assertEquals(result, originalContent);
});

Deno.test("BookService - deleteBook removes file (DEL-002)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const list = await bookService.listBooks();
  assertEquals(list.files.length, 1);

  await bookService.deleteBook(list.files[0].id);

  const listAfter = await bookService.listBooks();
  assertEquals(listAfter.files.length, 0);
});

Deno.test("BookService - deleteBook invalidates cache", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  await bookService.listBooks(); // populate cache

  const list = await bookService.listBooks();
  await bookService.deleteBook(list.files[0].id);

  const listAfter = await bookService.listBooks();
  assertEquals(listAfter.files.length, 0);
});

Deno.test("BookService - updateBook updates properties (EDT-002, EDT-003, EDT-004)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const list = await bookService.listBooks();
  const bookId = list.files[0].id;

  const updated = await bookService.updateBook(bookId, {
    title: "新しいタイトル",
    authors: "新しい著者",
    publisher: "新しい出版社",
    publishedDate: "2024-01-01",
  });

  assertEquals(updated.properties.title, "新しいタイトル");
  assertEquals(updated.properties.authors, "新しい著者");
  assertEquals(updated.properties.publisher, "新しい出版社");
  assertEquals(updated.properties.published_date, "2024-01-01");
});

Deno.test("BookService - updateBook renames file (EDT-002)", async () => {
  const { drive, bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const list = await bookService.listBooks();
  const bookId = list.files[0].id;

  await bookService.updateBook(bookId, { title: "新タイトル" });

  const file = drive.files.get(bookId);
  assertEquals(file?.name, "[太宰治] 新タイトル.epub");
});

Deno.test("BookService - updateBook moves to new author folder (EDT-003)", async () => {
  const { drive, bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");
  const list = await bookService.listBooks();
  const bookId = list.files[0].id;

  await bookService.updateBook(bookId, { authors: "新著者" });

  const file = drive.files.get(bookId);
  const newFolder = drive.files.get(file!.parents[0]);
  assertEquals(newFolder?.name, "新著者");
});

Deno.test("BookService - findBookByIsbn detects duplicates (FLW-004)", async () => {
  const { bookService } = createTestServices();
  const content = new TextEncoder().encode("epub content");

  await bookService.registerBook(sampleMetadata, content, "application/epub+zip");

  const existing = await bookService.findBookByIsbn("9784101010014");
  assertEquals(existing !== null, true);
});

Deno.test("BookService - fetchMetadata delegates to service", async () => {
  const { metadata, bookService } = createTestServices();
  metadata.addBook("9784101010014", sampleMetadata);

  const result = await bookService.fetchMetadata("9784101010014");
  assertEquals(result?.title, "人間失格");
});

Deno.test("BookService - Drive API failure propagates (FLW-002)", async () => {
  const { drive, bookService } = createTestServices();
  drive.shouldFail = true;

  const content = new TextEncoder().encode("epub content");
  await assertRejects(
    () => bookService.registerBook(sampleMetadata, content, "application/epub+zip"),
    Error,
    "Drive API error",
  );
});

Deno.test("BookService - property value truncation (DAT-008)", async () => {
  const { bookService } = createTestServices();
  const longTitle = "あ".repeat(100); // 300 bytes in UTF-8
  const meta = { ...sampleMetadata, title: longTitle };
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(meta, content, "application/epub+zip");

  const encoder = new TextEncoder();
  const bytes = encoder.encode(file.properties.title);
  assertEquals(bytes.length <= 124, true);
});
