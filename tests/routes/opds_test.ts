import { assertEquals } from "@std/assert";
import { createApp } from "../../src/app.ts";
import { MockGoogleDriveService } from "../../src/services/drive_mock.ts";
import { CacheService } from "../../src/services/cache.ts";
import { BookMetadata, BookMetadataService } from "../../src/types.ts";
import { escapeXml, generateFeed, generateOpenSearchDescription } from "../../src/routes/opds.ts";

class MockMetadataService implements BookMetadataService {
  async fetchByIsbn(_isbn: string): Promise<BookMetadata | null> {
    await Promise.resolve();
    return null;
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

// --- OPDS Feed Tests ---

Deno.test("GET /opds - returns XML (OPD-001)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Content-Type")?.includes("application/atom+xml"),
    true,
  );
});

Deno.test("GET /opds - valid Atom Feed structure (OPD-002)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  const body = await res.text();
  assertEquals(body.includes('<?xml version="1.0"'), true);
  assertEquals(body.includes("<feed"), true);
  assertEquals(body.includes("xmlns=\"http://www.w3.org/2005/Atom\""), true);
  assertEquals(body.includes("</feed>"), true);
});

Deno.test("GET /opds - contains book entries (OPD-003)", async () => {
  const { app, bookService } = createTestApp();

  await bookService.registerBook(
    {
      isbn: "9784101010014", title: "人間失格", authors: "太宰治",
      publisher: "新潮社", publishedDate: "1952-01-01", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("epub content"),
    "application/epub+zip",
  );

  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  const body = await res.text();
  assertEquals(body.includes("<entry>"), true);
  assertEquals(body.includes("人間失格"), true);
  assertEquals(body.includes("太宰治"), true);
});

Deno.test("GET /opds - EPUB MIME type (OPD-005)", async () => {
  const { app, bookService } = createTestApp();

  await bookService.registerBook(
    {
      isbn: "1", title: "EPUB Book", authors: "Author",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("epub content"),
    "application/epub+zip",
  );

  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  const body = await res.text();
  assertEquals(body.includes('type="application/epub+zip"'), true);
});

Deno.test("GET /opds - PDF MIME type (OPD-006)", async () => {
  const { app, bookService } = createTestApp();

  await bookService.registerBook(
    {
      isbn: "1", title: "PDF Book", authors: "Author",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("pdf content"),
    "application/pdf",
  );

  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  const body = await res.text();
  assertEquals(body.includes('type="application/pdf"'), true);
});

Deno.test("GET /opds - contains download links (OPD-007)", async () => {
  const { app, bookService } = createTestApp();

  const file = await bookService.registerBook(
    {
      isbn: "1", title: "テスト", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );

  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  const body = await res.text();
  assertEquals(body.includes(`/books/${file.id}/download`), true);
  assertEquals(body.includes("http://opds-spec.org/acquisition"), true);
});

Deno.test("GET /opds - empty feed when no books (OPD-008)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("<feed"), true);
  assertEquals(body.includes("<entry>"), false);
});

Deno.test("GET /opds - contains OpenSearch link (OPS-001)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  const body = await res.text();
  assertEquals(body.includes("opensearch"), true);
  assertEquals(body.includes("/opds/opensearch.xml"), true);
});

Deno.test("GET /opds - search with q parameter (OPS-002, OPS-003)", async () => {
  const { app, bookService } = createTestApp();

  await bookService.registerBook(
    {
      isbn: "1", title: "人間失格", authors: "太宰治",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );
  await bookService.registerBook(
    {
      isbn: "2", title: "坊っちゃん", authors: "夏目漱石",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );

  const res = await app.request("/opds?q=太宰治", {
    headers: { host: "localhost:8000" },
  });
  const body = await res.text();
  assertEquals(body.includes("太宰治"), true);
  assertEquals(body.includes("夏目漱石"), false);
});

// --- OpenSearch Description Tests ---

Deno.test("GET /opds/opensearch.xml - returns valid OpenSearch (OPS-001)", async () => {
  const { app } = createTestApp();
  const res = await app.request("/opds/opensearch.xml", {
    headers: { host: "localhost:8000" },
  });
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Content-Type")?.includes("opensearchdescription"),
    true,
  );

  const body = await res.text();
  assertEquals(body.includes("OpenSearchDescription"), true);
  assertEquals(body.includes("{searchTerms}"), true);
});

// --- Helper function tests ---

Deno.test("escapeXml - escapes special characters", () => {
  assertEquals(escapeXml("<tag>"), "&lt;tag&gt;");
  assertEquals(escapeXml("AT&T"), "AT&amp;T");
  assertEquals(escapeXml('"quotes"'), "&quot;quotes&quot;");
  assertEquals(escapeXml("it's"), "it&apos;s");
});

Deno.test("generateFeed - produces valid XML structure", () => {
  const feed = generateFeed([], "http://localhost:8000");
  assertEquals(feed.includes('<?xml version="1.0"'), true);
  assertEquals(feed.includes("<feed"), true);
  assertEquals(feed.includes("</feed>"), true);
  assertEquals(feed.includes("xmlns:opds"), true);
  assertEquals(feed.includes("xmlns:opensearch"), true);
});

Deno.test("generateFeed - with books", () => {
  const books = [{
    id: "file1",
    name: "[太宰治] 人間失格.epub",
    mimeType: "application/epub+zip",
    properties: {
      app_type: "my_library_book",
      title: "人間失格",
      authors: "太宰治",
      isbn: "9784101010014",
      publisher: "新潮社",
      published_date: "1952-01-01",
    },
    parents: ["folder1"],
  }];

  const feed = generateFeed(books, "http://localhost:8000");
  assertEquals(feed.includes("<entry>"), true);
  assertEquals(feed.includes("人間失格"), true);
  assertEquals(feed.includes("太宰治"), true);
  assertEquals(feed.includes("application/epub+zip"), true);
  assertEquals(feed.includes("/books/file1/download"), true);
});

Deno.test("generateFeed - cover image link (OPD-004)", () => {
  const books = [{
    id: "file1",
    name: "test.epub",
    mimeType: "application/epub+zip",
    properties: {
      app_type: "my_library_book",
      title: "テスト",
      authors: "著者",
      cover_file_id: "cover1",
    },
    parents: ["folder1"],
  }];

  const feed = generateFeed(books, "http://localhost:8000");
  assertEquals(feed.includes("opds-spec.org/image"), true);
  assertEquals(feed.includes("/books/file1/cover"), true);
});

Deno.test("generateOpenSearchDescription - valid format", () => {
  const desc = generateOpenSearchDescription("http://localhost:8000");
  assertEquals(desc.includes("OpenSearchDescription"), true);
  assertEquals(desc.includes("searchTerms"), true);
  assertEquals(desc.includes("http://localhost:8000/opds"), true);
});

// --- Integration: OPDS download flow (RDR-001, RDR-002) ---

Deno.test("OPDS flow - feed lists books then download works (RDR-001, RDR-002)", async () => {
  const { app, bookService } = createTestApp();

  const originalContent = new TextEncoder().encode("EPUB content for OPDS");
  const file = await bookService.registerBook(
    {
      isbn: "1", title: "OPDSテスト", authors: "著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    originalContent,
    "application/epub+zip",
  );

  // 1. Get OPDS feed
  const feedRes = await app.request("/opds", {
    headers: { host: "localhost:8000" },
  });
  assertEquals(feedRes.status, 200);
  const feedBody = await feedRes.text();
  assertEquals(feedBody.includes("OPDSテスト"), true);
  assertEquals(feedBody.includes(`/books/${file.id}/download`), true);

  // 2. Download from the link
  const dlRes = await app.request(`/books/${file.id}/download`);
  assertEquals(dlRes.status, 200);
  const dlContent = new Uint8Array(await dlRes.arrayBuffer());
  assertEquals(dlContent, originalContent);
});

// --- OPDS search flow (RDR-003) ---

Deno.test("OPDS search flow (RDR-003)", async () => {
  const { app, bookService } = createTestApp();

  await bookService.registerBook(
    {
      isbn: "1", title: "検索テスト", authors: "テスト著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );
  await bookService.registerBook(
    {
      isbn: "2", title: "別の本", authors: "別の著者",
      publisher: "", publishedDate: "", description: "", coverImageUrl: "",
    },
    new TextEncoder().encode("content"),
    "application/epub+zip",
  );

  const res = await app.request("/opds?q=検索テスト", {
    headers: { host: "localhost:8000" },
  });
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("検索テスト"), true);
  assertEquals(body.includes("別の本"), false);
});
