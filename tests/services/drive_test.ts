import { assertEquals, assertRejects } from "@std/assert";
import { MockGoogleDriveService } from "../../src/services/drive_mock.ts";
import { formatFileName, getExtension, getFirstAuthor, sanitizeProperties } from "../../src/services/drive.ts";

// --- Helper functions tests ---

Deno.test("formatFileName - EPUB format (DRV-001)", () => {
  const result = formatFileName("太宰治", "人間失格", "epub");
  assertEquals(result, "[太宰治] 人間失格.epub");
});

Deno.test("formatFileName - PDF format (DRV-002)", () => {
  const result = formatFileName("夏目漱石", "坊っちゃん", "pdf");
  assertEquals(result, "[夏目漱石] 坊っちゃん.pdf");
});

Deno.test("formatFileName - multiple authors (DRV-007)", () => {
  const result = formatFileName("著者A-著者B", "テストタイトル", "epub");
  assertEquals(result, "[著者A-著者B] テストタイトル.epub");
});

Deno.test("getFirstAuthor - single author", () => {
  assertEquals(getFirstAuthor("太宰治"), "太宰治");
});

Deno.test("getFirstAuthor - multiple authors (DRV-007)", () => {
  assertEquals(getFirstAuthor("著者A-著者B"), "著者A");
});

Deno.test("getExtension - EPUB", () => {
  assertEquals(getExtension("application/epub+zip"), "epub");
});

Deno.test("getExtension - PDF", () => {
  assertEquals(getExtension("application/pdf"), "pdf");
});

Deno.test("sanitizeProperties - truncates long values (DAT-008)", () => {
  const longValue = "あ".repeat(100); // Each 'あ' is 3 bytes in UTF-8 = 300 bytes
  const result = sanitizeProperties({ title: longValue });
  const encoder = new TextEncoder();
  const bytes = encoder.encode(result.title);
  assertEquals(bytes.length <= 124, true);
});

Deno.test("sanitizeProperties - short values unchanged", () => {
  const result = sanitizeProperties({ title: "短いタイトル" });
  assertEquals(result.title, "短いタイトル");
});

Deno.test("sanitizeProperties - key+value combined does not exceed 124 bytes", () => {
  const longValue = "あ".repeat(100); // 300 bytes
  const encoder = new TextEncoder();

  // 長いキー名: "description" = 11 bytes
  const result1 = sanitizeProperties({ description: longValue });
  const k1 = encoder.encode("description").length;
  const v1 = encoder.encode(result1.description).length;
  assertEquals(k1 + v1 <= 124, true);

  // さらに長いキー名: "published_date" = 14 bytes
  const result2 = sanitizeProperties({ published_date: longValue });
  const k2 = encoder.encode("published_date").length;
  const v2 = encoder.encode(result2.published_date).length;
  assertEquals(k2 + v2 <= 124, true);
});

// --- Mock Drive Service tests ---

Deno.test("MockDrive - ensureMyLibraryFolder creates folder (DAT-009)", async () => {
  const drive = new MockGoogleDriveService();
  const id = await drive.ensureMyLibraryFolder();
  assertEquals(typeof id, "string");
  assertEquals(id.length > 0, true);

  // Verify folder exists
  const folder = drive.files.get(id);
  assertEquals(folder?.name, "MyLibrary");
  assertEquals(folder?.mimeType, "application/vnd.google-apps.folder");
});

Deno.test("MockDrive - ensureMyLibraryFolder is idempotent (DAT-009)", async () => {
  const drive = new MockGoogleDriveService();
  const id1 = await drive.ensureMyLibraryFolder();
  const id2 = await drive.ensureMyLibraryFolder();
  assertEquals(id1, id2);
});

Deno.test("MockDrive - ensureAuthorFolder creates folder (DRV-005)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const folder = drive.files.get(authorId);
  assertEquals(folder?.name, "太宰治");
  assertEquals(folder?.parents.includes(myLibId), true);
});

Deno.test("MockDrive - ensureAuthorFolder reuses existing (DRV-006)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const id1 = await drive.ensureAuthorFolder(myLibId, "太宰治");
  const id2 = await drive.ensureAuthorFolder(myLibId, "太宰治");
  assertEquals(id1, id2);
});

Deno.test("MockDrive - uploadFile stores file with properties (DRV-003)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const content = new TextEncoder().encode("dummy epub content");
  const properties = {
    app_type: "my_library_book",
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    published_date: "1952-01-01",
  };

  const file = await drive.uploadFile(
    authorId,
    "[太宰治] 人間失格.epub",
    content,
    "application/epub+zip",
    properties,
  );

  assertEquals(file.name, "[太宰治] 人間失格.epub");
  assertEquals(file.mimeType, "application/epub+zip");
  assertEquals(file.properties.app_type, "my_library_book");
  assertEquals(file.properties.isbn, "9784101010014");
  assertEquals(file.properties.title, "人間失格");
  assertEquals(file.properties.authors, "太宰治");
  assertEquals(file.properties.publisher, "新潮社");
  assertEquals(file.properties.published_date, "1952-01-01");
  assertEquals(file.parents.includes(authorId), true);
});

Deno.test("MockDrive - app_type value is my_library_book (DRV-008)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const file = await drive.uploadFile(
    authorId,
    "test.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book" },
  );

  assertEquals(file.properties.app_type, "my_library_book");
});

Deno.test("MockDrive - listBooks returns only books with app_type (BRW-001, BRW-009)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  // Upload a book
  await drive.uploadFile(
    authorId,
    "[太宰治] 人間失格.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book", title: "人間失格" },
  );

  // Upload a non-book file
  await drive.uploadFile(
    authorId,
    "random.txt",
    new Uint8Array(),
    "text/plain",
    {},
  );

  const result = await drive.listBooks();
  assertEquals(result.files.length, 1);
  assertEquals(result.files[0].properties.title, "人間失格");
});

Deno.test("MockDrive - listBooks returns empty for 0 books (BRW-007)", async () => {
  const drive = new MockGoogleDriveService();
  const result = await drive.listBooks();
  assertEquals(result.files.length, 0);
});

Deno.test("MockDrive - listBooks pagination (BRW-008)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "著者");

  // Upload 5 books
  for (let i = 0; i < 5; i++) {
    await drive.uploadFile(
      authorId,
      `book_${i}.epub`,
      new Uint8Array(),
      "application/epub+zip",
      { app_type: "my_library_book", title: `Book ${i}` },
    );
  }

  // Get first page of 3
  const page1 = await drive.listBooks(undefined, 3);
  assertEquals(page1.files.length, 3);
  assertEquals(typeof page1.nextPageToken, "string");

  // Get second page
  const page2 = await drive.listBooks(page1.nextPageToken, 3);
  assertEquals(page2.files.length, 2);
  assertEquals(page2.nextPageToken, undefined);
});

Deno.test("MockDrive - searchBooks by title (SRC-001)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  await drive.uploadFile(authorId, "[太宰治] 人間失格.epub", new Uint8Array(), "application/epub+zip", {
    app_type: "my_library_book", title: "人間失格", authors: "太宰治",
  });
  await drive.uploadFile(authorId, "[太宰治] 斜陽.epub", new Uint8Array(), "application/epub+zip", {
    app_type: "my_library_book", title: "斜陽", authors: "太宰治",
  });

  const result = await drive.searchBooks("人間失格");
  assertEquals(result.files.length, 1);
  assertEquals(result.files[0].properties.title, "人間失格");
});

Deno.test("MockDrive - searchBooks by author (SRC-002)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const id1 = await drive.ensureAuthorFolder(myLibId, "太宰治");
  const id2 = await drive.ensureAuthorFolder(myLibId, "夏目漱石");

  await drive.uploadFile(id1, "[太宰治] 人間失格.epub", new Uint8Array(), "application/epub+zip", {
    app_type: "my_library_book", title: "人間失格", authors: "太宰治",
  });
  await drive.uploadFile(id2, "[夏目漱石] 坊っちゃん.epub", new Uint8Array(), "application/epub+zip", {
    app_type: "my_library_book", title: "坊っちゃん", authors: "夏目漱石",
  });

  const result = await drive.searchBooks("太宰治");
  assertEquals(result.files.length, 1);
  assertEquals(result.files[0].properties.authors, "太宰治");
});

Deno.test("MockDrive - searchBooks by filename (SRC-003)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  await drive.uploadFile(authorId, "[太宰治] 人間失格.epub", new Uint8Array(), "application/epub+zip", {
    app_type: "my_library_book", title: "人間失格", authors: "太宰治",
  });

  const result = await drive.searchBooks("[太宰治]");
  assertEquals(result.files.length, 1);
});

Deno.test("MockDrive - searchBooks returns empty for no match (SRC-004)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  await drive.uploadFile(authorId, "[太宰治] 人間失格.epub", new Uint8Array(), "application/epub+zip", {
    app_type: "my_library_book", title: "人間失格", authors: "太宰治",
  });

  const result = await drive.searchBooks("存在しないキーワード");
  assertEquals(result.files.length, 0);
});

Deno.test("MockDrive - searchBooks Japanese support (SRC-007)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  await drive.uploadFile(authorId, "[太宰治] 人間失格.epub", new Uint8Array(), "application/epub+zip", {
    app_type: "my_library_book", title: "人間失格", authors: "太宰治",
  });

  const result = await drive.searchBooks("人間");
  assertEquals(result.files.length, 1);
});

Deno.test("MockDrive - getFile and getFileContent (DWN-003)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const originalContent = new TextEncoder().encode("EPUB file content here");
  const file = await drive.uploadFile(
    authorId,
    "test.epub",
    originalContent,
    "application/epub+zip",
    { app_type: "my_library_book" },
  );

  const retrieved = await drive.getFile(file.id);
  assertEquals(retrieved.name, "test.epub");

  const content = await drive.getFileContent(file.id);
  assertEquals(content, originalContent);
});

Deno.test("MockDrive - deleteFile (DEL-002, DEL-004)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const file = await drive.uploadFile(
    authorId,
    "test.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book" },
  );

  await drive.deleteFile(file.id);
  assertEquals(drive.files.has(file.id), false);
});

Deno.test("MockDrive - updateFileProperties (EDT-002, EDT-004)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const file = await drive.uploadFile(
    authorId,
    "[太宰治] 人間失格.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book", title: "人間失格", authors: "太宰治" },
  );

  const updated = await drive.updateFileProperties(file.id, {
    title: "新しいタイトル",
    publisher: "新潮社",
    published_date: "2000-01-01",
  });

  assertEquals(updated.properties.title, "新しいタイトル");
  assertEquals(updated.properties.publisher, "新潮社");
  assertEquals(updated.properties.published_date, "2000-01-01");
  assertEquals(updated.properties.app_type, "my_library_book");
});

Deno.test("MockDrive - renameFile (EDT-002)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const file = await drive.uploadFile(
    authorId,
    "[太宰治] 人間失格.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book", title: "人間失格" },
  );

  const renamed = await drive.renameFile(file.id, "[太宰治] 新しいタイトル.epub");
  assertEquals(renamed.name, "[太宰治] 新しいタイトル.epub");
});

Deno.test("MockDrive - moveFile (EDT-003)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const folder1 = await drive.ensureAuthorFolder(myLibId, "著者A");
  const folder2 = await drive.ensureAuthorFolder(myLibId, "著者B");

  const file = await drive.uploadFile(
    folder1,
    "test.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book" },
  );

  const moved = await drive.moveFile(file.id, folder2, folder1);
  assertEquals(moved.parents.includes(folder2), true);
  assertEquals(moved.parents.includes(folder1), false);
});

Deno.test("MockDrive - findBookByIsbn", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  await drive.uploadFile(
    authorId,
    "test.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book", isbn: "9784101010014" },
  );

  const found = await drive.findBookByIsbn("9784101010014");
  assertEquals(found !== null, true);
  assertEquals(found!.properties.isbn, "9784101010014");

  const notFound = await drive.findBookByIsbn("0000000000000");
  assertEquals(notFound, null);
});

Deno.test("MockDrive - ISBN empty when not provided (DRV-009)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const file = await drive.uploadFile(
    authorId,
    "test.epub",
    new Uint8Array(),
    "application/epub+zip",
    { app_type: "my_library_book", isbn: "", title: "テスト" },
  );

  assertEquals(file.properties.isbn, "");
});

Deno.test("MockDrive - shouldFail flag triggers errors (FLW-002)", async () => {
  const drive = new MockGoogleDriveService();
  drive.shouldFail = true;

  await assertRejects(
    () => drive.ensureMyLibraryFolder(),
    Error,
    "Drive API error",
  );
});

Deno.test("MockDrive - uploadCoverImage (DRV-010)", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  const imageData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG header
  const coverFile = await drive.uploadCoverImage(
    authorId,
    "cover_123.jpg",
    imageData,
    "image/jpeg",
  );

  assertEquals(coverFile.name, "cover_123.jpg");
  assertEquals(coverFile.mimeType, "image/jpeg");
  assertEquals(coverFile.parents.includes(authorId), true);
});

Deno.test("MockDrive - findFilesByParent", async () => {
  const drive = new MockGoogleDriveService();
  const myLibId = await drive.ensureMyLibraryFolder();
  const authorId = await drive.ensureAuthorFolder(myLibId, "太宰治");

  await drive.uploadFile(authorId, "test1.epub", new Uint8Array(), "application/epub+zip", { app_type: "my_library_book" });
  await drive.uploadFile(authorId, "test2.epub", new Uint8Array(), "application/epub+zip", { app_type: "my_library_book" });

  const files = await drive.findFilesByParent(authorId);
  assertEquals(files.length, 2);
});
