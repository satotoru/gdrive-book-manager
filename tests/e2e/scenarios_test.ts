import { assertEquals } from "@std/assert";
import { createApp } from "../../src/app.ts";
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

function createTestApp() {
  const drive = new MockGoogleDriveService();
  const metadata = new MockMetadataService();
  const cache = new CacheService();
  const { app, bookService } = createApp({
    driveService: drive,
    metadataService: metadata,
    cache,
  });
  return { app, drive, metadata, cache, bookService };
}

async function registerBookViaHttp(
  app: ReturnType<typeof createApp>["app"],
  opts: {
    title: string;
    authors: string;
    isbn?: string;
    publisher?: string;
    publishedDate?: string;
    fileContent?: string;
    fileMimeType?: string;
    fileName?: string;
  },
) {
  const formData = new FormData();
  formData.append("title", opts.title);
  formData.append("authors", opts.authors);
  formData.append("isbn", opts.isbn || "");
  formData.append("publisher", opts.publisher || "");
  formData.append("publishedDate", opts.publishedDate || "");
  formData.append("description", "");
  formData.append("coverImageUrl", "");
  formData.append(
    "file",
    new File(
      [opts.fileContent || "dummy content"],
      opts.fileName || "test.epub",
      { type: opts.fileMimeType || "application/epub+zip" },
    ),
  );

  return await app.request("/books", { method: "POST", body: formData });
}

// --- Scenario 1: New registration to browse and download ---

Deno.test("Scenario 1: Book registration → browse → download", async () => {
  const { app, metadata } = createTestApp();

  // Step 1: Access registration page
  const regPage = await app.request("/books/new");
  assertEquals(regPage.status, 200);
  const regBody = await regPage.text();
  assertEquals(regBody.includes("書籍登録"), true);

  // Step 2: ISBN lookup
  metadata.addBook("9784101010014", {
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "",
  });

  const metaRes = await app.request("/api/metadata?isbn=9784101010014");
  const metaBody = await metaRes.text();
  assertEquals(metaBody.includes("書誌情報を取得しました"), true);

  // Step 3: Confirm and modify (REG-004) - user can edit the form
  // (This is a UI interaction, tested via form fields being editable)

  // Step 4-5: Upload file and register
  const fileContent = "This is the EPUB file content for scenario 1";
  const regRes = await registerBookViaHttp(app, {
    title: "人間失格",
    authors: "太宰治",
    isbn: "9784101010014",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    fileContent,
  });
  assertEquals(regRes.status, 200);
  const regResult = await regRes.text();
  assertEquals(regResult.includes("登録が完了しました"), true);

  // Step 6: Browse library
  const listRes = await app.request("/");
  const listBody = await listRes.text();
  assertEquals(listBody.includes("人間失格"), true);
  assertEquals(listBody.includes("太宰治"), true);

  // Step 7-8: Download and verify content integrity
  const listResult = await app.request("/books/search?q=人間失格");
  const listHtml = await listResult.text();
  // Extract download link from the HTML
  const downloadMatch = listHtml.match(/\/books\/([^/]+)\/download/);
  assertEquals(downloadMatch !== null, true);

  const dlRes = await app.request(`/books/${downloadMatch![1]}/download`);
  assertEquals(dlRes.status, 200);
  const dlBody = await dlRes.text();
  assertEquals(dlBody, fileContent);
});

// --- Scenario 2: Multiple books registration and search ---

Deno.test("Scenario 2: Multiple books → search", async () => {
  const { app } = createTestApp();

  // Step 1: Register 3 books (2 by Author A, 1 by Author B)
  const res1 = await registerBookViaHttp(app, {
    title: "著者Aの本1", authors: "著者A", isbn: "1",
  });
  assertEquals(res1.status, 200);

  const res2 = await registerBookViaHttp(app, {
    title: "著者Aの本2", authors: "著者A", isbn: "2",
  });
  assertEquals(res2.status, 200);

  const res3 = await registerBookViaHttp(app, {
    title: "著者Bの本", authors: "著者B", isbn: "3",
  });
  assertEquals(res3.status, 200);

  // Step 2: Library shows all 3
  const listRes = await app.request("/");
  const listBody = await listRes.text();
  assertEquals(listBody.includes("著者Aの本1"), true);
  assertEquals(listBody.includes("著者Aの本2"), true);
  assertEquals(listBody.includes("著者Bの本"), true);

  // Step 3: Search by Author A
  const searchA = await app.request("/books/search?q=著者A");
  const searchABody = await searchA.text();
  assertEquals(searchABody.includes("著者Aの本1"), true);
  assertEquals(searchABody.includes("著者Aの本2"), true);
  assertEquals(searchABody.includes("著者Bの本"), false);

  // Step 4: Clear search → all shown
  const clearRes = await app.request("/books/search?q=");
  const clearBody = await clearRes.text();
  assertEquals(clearBody.includes("著者Aの本1"), true);
  assertEquals(clearBody.includes("著者Bの本"), true);

  // Step 5: Search by Author B's book title
  const searchB = await app.request("/books/search?q=著者Bの本");
  const searchBBody = await searchB.text();
  assertEquals(searchBBody.includes("著者Bの本"), true);
  assertEquals(searchBBody.includes("著者Aの本"), false);

  // Step 6: Non-existent keyword
  const searchNone = await app.request("/books/search?q=存在しないキーワード");
  const searchNoneBody = await searchNone.text();
  assertEquals(searchNoneBody.includes("書籍がありません"), true);
});

// --- Scenario 3: Book edit and delete ---

Deno.test("Scenario 3: Book edit → delete", async () => {
  const { app, bookService, drive } = createTestApp();

  // Step 1: Register a book
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "元のタイトル", authors: "元の著者",
      publisher: "出版社", publishedDate: "2000-01-01", description: "", coverImageUrl: "",
    },
    content,
    "application/epub+zip",
  );

  // Step 2: Open edit page
  const editPage = await app.request(`/books/${file.id}/edit`);
  assertEquals(editPage.status, 200);
  const editBody = await editPage.text();
  assertEquals(editBody.includes("元のタイトル"), true);
  assertEquals(editBody.includes("元の著者"), true);

  // Step 3: Update title
  const updateForm = new URLSearchParams();
  updateForm.append("title", "新しいタイトル");
  updateForm.append("authors", "元の著者");
  updateForm.append("publisher", "出版社");
  updateForm.append("publishedDate", "2000-01-01");

  const updateRes = await app.request(`/books/${file.id}`, {
    method: "PUT",
    body: updateForm,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  assertEquals(updateRes.status, 200);

  // Step 4: Verify file name changed on Drive
  const updatedFile = drive.files.get(file.id);
  assertEquals(updatedFile?.name, "[元の著者] 新しいタイトル.epub");

  // Step 5-6: Delete
  const delRes = await app.request(`/books/${file.id}`, { method: "DELETE" });
  assertEquals(delRes.status, 200);
  const delBody = await delRes.text();
  assertEquals(delBody.includes("削除しました"), true);

  // Step 7: Verify file is gone from Drive
  assertEquals(drive.files.has(file.id), false);
});

// --- Scenario 4: Google Drive data integrity ---

Deno.test("Scenario 4: Drive data integrity", async () => {
  const { app, drive, bookService } = createTestApp();

  // Step 1: Register a book
  const content = new TextEncoder().encode("epub content");
  const file = await bookService.registerBook(
    {
      isbn: "9784101010014", title: "人間失格", authors: "太宰治",
      publisher: "新潮社", publishedDate: "1952-01-01", description: "概要", coverImageUrl: "",
    },
    content,
    "application/epub+zip",
  );

  // Step 2: Check Drive folder structure
  const authorFolderId = file.parents[0];
  const authorFolder = drive.files.get(authorFolderId);
  assertEquals(authorFolder?.name, "太宰治");

  const myLibId = authorFolder?.parents[0];
  const myLib = drive.files.get(myLibId!);
  assertEquals(myLib?.name, "MyLibrary");

  // File name format
  assertEquals(file.name, "[太宰治] 人間失格.epub");

  // Step 3: Check properties
  assertEquals(file.properties.app_type, "my_library_book");
  assertEquals(file.properties.isbn, "9784101010014");
  assertEquals(file.properties.title, "人間失格");
  assertEquals(file.properties.authors, "太宰治");
  assertEquals(file.properties.publisher, "新潮社");
  assertEquals(file.properties.published_date, "1952-01-01");

  // Step 4: Library shows the book
  const listRes = await app.request("/");
  const listBody = await listRes.text();
  assertEquals(listBody.includes("人間失格"), true);
});

// --- Scenario 5: OPDS Catalog CLI Confirmation ---

Deno.test("Scenario 5: OPDS catalog flow", async () => {
  const { app, bookService } = createTestApp();

  // Step 1: Register multiple books
  const content = new TextEncoder().encode("content");
  const book1 = await bookService.registerBook(
    {
      isbn: "1", title: "OPDSテスト1", authors: "著者A",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    content,
    "application/epub+zip",
  );
  await bookService.registerBook(
    {
      isbn: "2", title: "OPDSテスト2", authors: "著者B",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    content,
    "application/pdf",
  );

  // Step 2: Access OPDS feed
  const feedRes = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  assertEquals(feedRes.status, 200);

  // Step 3: Verify content
  const feedBody = await feedRes.text();
  assertEquals(feedBody.includes("OPDSテスト1"), true);
  assertEquals(feedBody.includes("OPDSテスト2"), true);
  assertEquals(feedBody.includes("application/epub+zip"), true);
  assertEquals(feedBody.includes("application/pdf"), true);

  // Step 4: Search via OPDS
  const searchRes = await app.request("/opds?q=著者A", {
    headers: { host: "localhost:8000" },
  });
  const searchBody = await searchRes.text();
  assertEquals(searchBody.includes("OPDSテスト1"), true);
  assertEquals(searchBody.includes("OPDSテスト2"), false);

  // Step 5: Download via OPDS link
  const dlRes = await app.request(`/books/${book1.id}/download`);
  assertEquals(dlRes.status, 200);
  const dlContent = new Uint8Array(await dlRes.arrayBuffer());
  assertEquals(dlContent, content);
});

// --- Scenario 6: Cache behavior ---

Deno.test("Scenario 6: Cache behavior", async () => {
  const { app, bookService, cache } = createTestApp();

  // Step 1: First access (no cache)
  const res1 = await app.request("/");
  assertEquals(res1.status, 200);

  // Step 2: Reload (should hit cache)
  const res2 = await app.request("/");
  assertEquals(res2.status, 200);
  assertEquals(cache.size > 0, true);

  // Step 3: Register new book
  await bookService.registerBook(
    {
      isbn: "1", title: "新刊", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );

  // Step 4: New book should appear (cache invalidated by registration)
  const res3 = await app.request("/");
  const body3 = await res3.text();
  assertEquals(body3.includes("新刊"), true);
});

// --- Additional data validation tests ---

Deno.test("Data: ISBN format validation (DAT-002)", async () => {
  const { bookService } = createTestApp();
  const content = new TextEncoder().encode("content");

  // 13-digit ISBN
  const file13 = await bookService.registerBook(
    {
      isbn: "9784101010014", title: "テスト", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    content,
    "application/epub+zip",
  );
  assertEquals(file13.properties.isbn, "9784101010014");
  assertEquals(file13.properties.isbn.length, 13);
});

Deno.test("Data: published_date format (DAT-007)", async () => {
  const { bookService } = createTestApp();
  const content = new TextEncoder().encode("content");

  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "著者",
      publisher: "", publishedDate: "2024-01-15", description: "", coverImageUrl: "",
    },
    content,
    "application/epub+zip",
  );
  assertEquals(file.properties.published_date, "2024-01-15");
  // Verify sortable format
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(file.properties.published_date), true);
});

Deno.test("Data: multiple authors format (DAT-005)", async () => {
  const { bookService } = createTestApp();
  const content = new TextEncoder().encode("content");

  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "著者A-著者B",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    content,
    "application/epub+zip",
  );
  assertEquals(file.properties.authors, "著者A-著者B");
  assertEquals(file.properties.authors.includes("-"), true);
});

Deno.test("Data: single author (DAT-004)", async () => {
  const { bookService } = createTestApp();
  const content = new TextEncoder().encode("content");

  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "太宰治",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    content,
    "application/epub+zip",
  );
  assertEquals(file.properties.authors, "太宰治");
});
