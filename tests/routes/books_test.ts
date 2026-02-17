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

async function registerTestBook(
  app: ReturnType<typeof createApp>["app"],
  title = "人間失格",
  authors = "太宰治",
  isbn = "9784101010014",
) {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("authors", authors);
  formData.append("isbn", isbn);
  formData.append("publisher", "新潮社");
  formData.append("publishedDate", "1952-01-01");
  formData.append("description", "テスト概要");
  formData.append("coverImageUrl", "");
  formData.append(
    "file",
    new File(["dummy epub content"], "test.epub", {
      type: "application/epub+zip",
    }),
  );

  const res = await app.request("/books", {
    method: "POST",
    body: formData,
  });
  return res;
}

// --- Library Page Tests ---

Deno.test("GET / - shows library page (BRW-002)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("蔵書管理"), true);
});

Deno.test("GET / - shows empty message when no books (BRW-007)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("書籍がありません"), true);
});

Deno.test("GET / - shows registered books (BRW-001, BRW-006)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app);

  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("人間失格"), true);
  assertEquals(body.includes("太宰治"), true);
});

Deno.test("GET / - grid layout uses card class (BRW-002, TEC-004)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app);

  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("card"), true);
  assertEquals(body.includes("grid"), true);
});

Deno.test("GET / - shows placeholder when no cover (BRW-005)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app);

  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("No Cover"), true);
});

// --- Registration Page Tests ---

Deno.test("GET /books/new - shows registration form (FLW-003)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/books/new");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("書籍登録"), true);
  assertEquals(body.includes("ISBN"), true);
  assertEquals(body.includes("タイトル"), true);
  assertEquals(body.includes("著者名"), true);
  assertEquals(body.includes("出版社"), true);
  assertEquals(body.includes("出版日"), true);
  assertEquals(body.includes("概要"), true);
});

Deno.test("POST /books - registers a book successfully (FLW-001)", async () => {
  const { app } = createTestApp();
  const res = await registerTestBook(app);
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("登録が完了しました"), true);
});

Deno.test("POST /books - rejects without title (UPL-006)", async () => {
  const { app } = createTestApp();
  const formData = new FormData();
  formData.append("title", "");
  formData.append("file", new File(["content"], "test.epub", { type: "application/epub+zip" }));

  const res = await app.request("/books", { method: "POST", body: formData });
  assertEquals(res.status, 400);
  const body = await res.text();
  assertEquals(body.includes("タイトルは必須です"), true);
});

Deno.test("POST /books - rejects without file (UPL-006)", async () => {
  const { app } = createTestApp();
  const formData = new FormData();
  formData.append("title", "テストタイトル");

  const res = await app.request("/books", { method: "POST", body: formData });
  assertEquals(res.status, 400);
  const body = await res.text();
  assertEquals(body.includes("ファイルを選択してください"), true);
});

Deno.test("POST /books - rejects non-EPUB/PDF files (UPL-003)", async () => {
  const { app } = createTestApp();
  const formData = new FormData();
  formData.append("title", "テスト");
  formData.append("authors", "著者");
  formData.append(
    "file",
    new File(["image data"], "photo.jpg", { type: "image/jpeg" }),
  );

  const res = await app.request("/books", { method: "POST", body: formData });
  assertEquals(res.status, 400);
  const body = await res.text();
  assertEquals(body.includes("対応していないファイル形式"), true);
});

Deno.test("POST /books - accepts EPUB by extension (UPL-003)", async () => {
  const { app } = createTestApp();
  const formData = new FormData();
  formData.append("title", "テスト");
  formData.append("authors", "著者");
  formData.append("isbn", "");
  formData.append("publisher", "");
  formData.append("publishedDate", "");
  formData.append("description", "");
  formData.append("coverImageUrl", "");
  formData.append(
    "file",
    new File(["epub content"], "test.epub", { type: "application/epub+zip" }),
  );

  const res = await app.request("/books", { method: "POST", body: formData });
  assertEquals(res.status, 200);
});

Deno.test("POST /books - accepts PDF (UPL-003)", async () => {
  const { app } = createTestApp();
  const formData = new FormData();
  formData.append("title", "テスト");
  formData.append("authors", "著者");
  formData.append("isbn", "");
  formData.append("publisher", "");
  formData.append("publishedDate", "");
  formData.append("description", "");
  formData.append("coverImageUrl", "");
  formData.append(
    "file",
    new File(["pdf content"], "test.pdf", { type: "application/pdf" }),
  );

  const res = await app.request("/books", { method: "POST", body: formData });
  assertEquals(res.status, 200);
});

Deno.test("POST /books - warns on duplicate ISBN (FLW-004)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app, "人間失格", "太宰治", "9784101010014");

  // Try to register again with same ISBN
  const res = await registerTestBook(app, "別の本", "別の著者", "9784101010014");
  const body = await res.text();
  assertEquals(body.includes("既に登録されています"), true);
});

Deno.test("POST /books - registers without ISBN (REG-006)", async () => {
  const { app } = createTestApp();
  const res = await registerTestBook(app, "手動登録書籍", "著者", "");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("登録が完了しました"), true);
});

Deno.test("POST /books - Drive API failure shows error (FLW-002)", async () => {
  const { app, drive } = createTestApp();
  drive.shouldFail = true;

  const res = await registerTestBook(app);
  assertEquals(res.status, 500);
  const body = await res.text();
  assertEquals(body.includes("登録に失敗しました"), true);
});

// --- Metadata API Tests ---

Deno.test("GET /api/metadata - returns metadata (REG-001)", async () => {
  const { app, metadata } = createTestApp();
  metadata.addBook("9784101010014", {
    isbn: "9784101010014",
    title: "人間失格",
    authors: "太宰治",
    publisher: "新潮社",
    publishedDate: "1952-01-01",
    description: "太宰治の代表作",
    coverImageUrl: "https://example.com/cover.jpg",
  });

  const res = await app.request("/api/metadata?isbn=9784101010014");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("書誌情報を取得しました"), true);
});

Deno.test("GET /api/metadata - not found message (REG-003)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/api/metadata?isbn=0000000000000");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("書誌情報が見つかりませんでした"), true);
});

Deno.test("GET /api/metadata - empty isbn returns empty (REG-003)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/api/metadata?isbn=");
  assertEquals(res.status, 200);
});

// --- Search Tests ---

Deno.test("GET /books/search - search by title (SRC-001)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app, "人間失格", "太宰治", "1");
  await registerTestBook(app, "斜陽", "太宰治", "2");

  const res = await app.request("/books/search?q=人間失格");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("人間失格"), true);
  assertEquals(body.includes("斜陽"), false);
});

Deno.test("GET /books/search - search by author (SRC-002)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app, "人間失格", "太宰治", "1");
  await registerTestBook(app, "坊っちゃん", "夏目漱石", "2");

  const res = await app.request("/books/search?q=太宰治");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("人間失格"), true);
  assertEquals(body.includes("坊っちゃん"), false);
});

Deno.test("GET /books/search - no results message (SRC-004)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app);

  const res = await app.request("/books/search?q=存在しないキーワード");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("書籍がありません"), true);
});

Deno.test("GET /books/search - empty query returns all (SRC-008)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app, "人間失格", "太宰治", "1");
  await registerTestBook(app, "斜陽", "太宰治", "2");

  const res = await app.request("/books/search?q=");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("人間失格"), true);
  assertEquals(body.includes("斜陽"), true);
});

Deno.test("GET /books/search - Japanese search (SRC-007)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app, "人間失格", "太宰治", "1");

  const res = await app.request("/books/search?q=人間");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("人間失格"), true);
});

// --- Download Tests ---

Deno.test("GET /books/:id/download - downloads EPUB (DWN-001, DWN-004)", async () => {
  const { app, bookService } = createTestApp();
  const originalContent = new TextEncoder().encode("EPUB file content");
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    originalContent,
    "application/epub+zip",
  );

  const res = await app.request(`/books/${file.id}/download`);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/epub+zip");
  assertEquals(
    res.headers.get("Content-Disposition")?.includes("attachment"),
    true,
  );

  const body = new Uint8Array(await res.arrayBuffer());
  assertEquals(body, originalContent);
});

Deno.test("GET /books/:id/download - downloads PDF (DWN-002)", async () => {
  const { app, bookService } = createTestApp();
  const originalContent = new TextEncoder().encode("PDF file content");
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    originalContent,
    "application/pdf",
  );

  const res = await app.request(`/books/${file.id}/download`);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/pdf");
});

Deno.test("GET /books/:id/download - file integrity (DWN-003)", async () => {
  const { app, bookService } = createTestApp();
  const originalContent = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]); // ZIP header
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    originalContent,
    "application/epub+zip",
  );

  const res = await app.request(`/books/${file.id}/download`);
  const downloaded = new Uint8Array(await res.arrayBuffer());
  assertEquals(downloaded, originalContent);
});

// --- Edit Tests ---

Deno.test("GET /books/:id/edit - shows edit form (EDT-001)", async () => {
  const { app, bookService } = createTestApp();
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "人間失格", authors: "太宰治",
      publisher: "新潮社", publishedDate: "1952-01-01", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );

  const res = await app.request(`/books/${file.id}/edit`);
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("書籍編集"), true);
  assertEquals(body.includes("人間失格"), true);
  assertEquals(body.includes("太宰治"), true);
  assertEquals(body.includes("新潮社"), true);
});

Deno.test("PUT /books/:id - updates book (EDT-002, EDT-005)", async () => {
  const { app, bookService } = createTestApp();
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "人間失格", authors: "太宰治",
      publisher: "新潮社", publishedDate: "1952-01-01", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );

  const formData = new URLSearchParams();
  formData.append("title", "新しいタイトル");
  formData.append("authors", "太宰治");
  formData.append("publisher", "角川書店");
  formData.append("publishedDate", "2000-01-01");

  const res = await app.request(`/books/${file.id}`, {
    method: "PUT",
    body: formData,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("更新しました"), true);
});

// --- Delete Tests ---

Deno.test("DELETE /books/:id - deletes book (DEL-002, DEL-005)", async () => {
  const { app, bookService } = createTestApp();
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );

  const res = await app.request(`/books/${file.id}`, { method: "DELETE" });
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("削除しました"), true);

  // Verify book is gone
  const list = await bookService.listBooks();
  assertEquals(list.files.length, 0);
});

Deno.test("DELETE /books/:id - non-existent book returns error", async () => {
  const { app } = createTestApp();
  const res = await app.request("/books/nonexistent", { method: "DELETE" });
  assertEquals(res.status, 500);
  const body = await res.text();
  assertEquals(body.includes("削除に失敗しました"), true);
});

// --- SSR & htmx Tests ---

Deno.test("SSR - HTML is server-rendered (TEC-002)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("<html"), true);
  assertEquals(body.includes("<body"), true);
  assertEquals(body.includes("<main"), true);
});

Deno.test("htmx - pages include htmx script (TEC-003)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("htmx.org"), true);
});

Deno.test("htmx - search uses hx-get attribute (TEC-003)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("hx-get"), true);
  assertEquals(body.includes("hx-trigger"), true);
  assertEquals(body.includes("hx-target"), true);
});

Deno.test("DaisyUI - uses DaisyUI classes (TEC-004)", async () => {
  const { app } = createTestApp();
  await registerTestBook(app);

  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes("btn"), true);
  assertEquals(body.includes("card"), true);
  assertEquals(body.includes("input"), true);
  assertEquals(body.includes("daisyui"), true);
});

Deno.test("DaisyUI - registration page uses DaisyUI (TEC-004)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/books/new");
  const body = await res.text();
  assertEquals(body.includes("btn"), true);
  assertEquals(body.includes("input"), true);
  assertEquals(body.includes("form-control"), true);
});

// --- Navigation Tests ---

Deno.test("Navigation - library and register links present", async () => {
  const { app } = createTestApp();
  const res = await app.request("/");
  const body = await res.text();
  assertEquals(body.includes('href="/"'), true);
  assertEquals(body.includes('href="/books/new"'), true);
});

// --- LAN Open Access Tests ---

Deno.test("LAN access - no auth required for library page (AUT-005)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/");
  assertEquals(res.status, 200);
  // No redirect to login or 401/403
});

Deno.test("LAN access - no auth required for registration (AUT-005)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/books/new");
  assertEquals(res.status, 200);
});
