import { assertEquals, assertNotEquals } from "@std/assert";
import { DriveFile } from "../../src/types.ts";
import { MockGoogleDriveService } from "../../src/services/drive_mock.ts";
import { BookService } from "../../src/services/book.ts";
import { CacheService } from "../../src/services/cache.ts";
import {
  CalibreMigrator,
  MigrationOptions,
  NoOpMetadataService,
  parseMetadataOpf,
  selectBookFile,
} from "../../scripts/migrate_calibre.ts";

// ─── テスト用ヘルパー ─────────────────────────────────────────────

const FOLDER_MIME = "application/vnd.google-apps.folder";
const EPUB_MIME = "application/epub+zip";
const PDF_MIME = "application/pdf";

/** OPF XMLを生成するヘルパー */
function makeOpf(opts: {
  title?: string;
  author?: string;
  authors?: string[];
  isbn?: string;
  publisher?: string;
  date?: string;
  description?: string;
}): string {
  const creators = opts.authors
    ? opts.authors
      .map((a) => `<dc:creator opf:role="aut">${a}</dc:creator>`)
      .join("\n    ")
    : opts.author
    ? `<dc:creator opf:role="aut">${opts.author}</dc:creator>`
    : "";

  const isbnEl = opts.isbn
    ? `<dc:identifier opf:scheme="ISBN">${opts.isbn}</dc:identifier>`
    : `<dc:identifier opf:scheme="uuid">12345678-abcd-0000-0000-000000000000</dc:identifier>`;

  return `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${opts.title ?? ""}</dc:title>
    ${creators}
    ${isbnEl}
    <dc:publisher>${opts.publisher ?? ""}</dc:publisher>
    <dc:date>${opts.date ?? ""}</dc:date>
    <dc:description>${opts.description ?? ""}</dc:description>
  </metadata>
</package>`;
}

interface BookSetup {
  authorName: string;
  bookFolderName: string;
  opfXml?: string;
  epubContent?: Uint8Array;
  pdfContent?: Uint8Array;
  mobiContent?: Uint8Array;
  coverContent?: Uint8Array;
}

/** Calibre書籍フォルダ構造をモックに追加するヘルパー */
function setupCalibreBook(
  mock: MockGoogleDriveService,
  sourceFolderId: string,
  setup: BookSetup,
): { authorFolderId: string; bookFolderId: string } {
  const authorFolderId = `af-${setup.authorName}`;
  const bookFolderId = `bf-${setup.bookFolderName}`;

  mock.addFile({
    id: authorFolderId,
    name: setup.authorName,
    mimeType: FOLDER_MIME,
    properties: {},
    parents: [sourceFolderId],
  });
  mock.addFile({
    id: bookFolderId,
    name: setup.bookFolderName,
    mimeType: FOLDER_MIME,
    properties: {},
    parents: [authorFolderId],
  });

  if (setup.opfXml !== undefined) {
    mock.addFile({
      id: `opf-${bookFolderId}`,
      name: "metadata.opf",
      mimeType: "text/xml",
      properties: {},
      parents: [bookFolderId],
      content: new TextEncoder().encode(setup.opfXml),
    });
  }
  if (setup.epubContent) {
    mock.addFile({
      id: `epub-${bookFolderId}`,
      name: `${setup.bookFolderName}.epub`,
      mimeType: EPUB_MIME,
      properties: {},
      parents: [bookFolderId],
      content: setup.epubContent,
    });
  }
  if (setup.pdfContent) {
    mock.addFile({
      id: `pdf-${bookFolderId}`,
      name: `${setup.bookFolderName}.pdf`,
      mimeType: PDF_MIME,
      properties: {},
      parents: [bookFolderId],
      content: setup.pdfContent,
    });
  }
  if (setup.mobiContent) {
    mock.addFile({
      id: `mobi-${bookFolderId}`,
      name: `${setup.bookFolderName}.mobi`,
      mimeType: "application/x-mobipocket-ebook",
      properties: {},
      parents: [bookFolderId],
      content: setup.mobiContent,
    });
  }
  if (setup.coverContent) {
    mock.addFile({
      id: `cover-${bookFolderId}`,
      name: "cover.jpg",
      mimeType: "image/jpeg",
      properties: {},
      parents: [bookFolderId],
      content: setup.coverContent,
    });
  }

  return { authorFolderId, bookFolderId };
}

/** モックとBookServiceを生成するファクトリ */
function createServices(mock?: MockGoogleDriveService) {
  const drive = mock ?? new MockGoogleDriveService();
  const cache = new CacheService();
  const bookService = new BookService(drive, new NoOpMetadataService(), cache);
  return { drive, bookService };
}

// ─── parseMetadataOpf ユニットテスト ──────────────────────────────

Deno.test("parseMetadataOpf - MGRSCRIPT-01: 全フィールドを正しく解析する", () => {
  const xml = makeOpf({
    title: "人間失格",
    author: "太宰治",
    isbn: "978-4-10-101001-4",
    publisher: "新潮社",
    date: "1952-01-01T00:00:00+00:00",
    description: "太宰治の代表作。",
  });

  const meta = parseMetadataOpf(xml);

  assertEquals(meta.title, "人間失格");
  assertEquals(meta.authors, "太宰治");
  assertEquals(meta.isbn, "9784101010014"); // ハイフン除去済み
  assertEquals(meta.publisher, "新潮社");
  assertEquals(meta.publishedDate, "1952-01-01"); // 時刻部分を除去
  assertEquals(meta.description, "太宰治の代表作。");
});

Deno.test("parseMetadataOpf - MGRSCRIPT-02: ISBNなしの場合はisbnが空文字になる", () => {
  const xml = makeOpf({ title: "ISBNなし本", author: "著者A" });

  const meta = parseMetadataOpf(xml);

  assertEquals(meta.isbn, "");
  assertEquals(meta.title, "ISBNなし本");
  assertEquals(meta.authors, "著者A");
});

Deno.test("parseMetadataOpf - 複数のdc:creatorをハイフン結合する", () => {
  const xml = makeOpf({
    title: "共著本",
    authors: ["著者A", "著者B"],
    isbn: "9784000000000",
  });

  const meta = parseMetadataOpf(xml);

  assertEquals(meta.authors, "著者A-著者B");
});

Deno.test("parseMetadataOpf - 日付のT以降を除去する", () => {
  const xml = makeOpf({ title: "テスト", date: "2020-06-15T12:30:00+09:00" });

  const meta = parseMetadataOpf(xml);

  assertEquals(meta.publishedDate, "2020-06-15");
});

// ─── selectBookFile ユニットテスト ────────────────────────────────

function makeFile(name: string, mimeType = "application/octet-stream"): DriveFile {
  return { id: name, name, mimeType, properties: {}, parents: [] };
}

Deno.test("selectBookFile - MGRSCRIPT-03: EPUBのみの場合はEPUBを返す", () => {
  const files = [
    makeFile("cover.jpg", "image/jpeg"),
    makeFile("metadata.opf", "text/xml"),
    makeFile("book.epub", EPUB_MIME),
  ];
  const result = selectBookFile(files);
  assertNotEquals(result, null);
  assertEquals(result!.name, "book.epub");
});

Deno.test("selectBookFile - MGRSCRIPT-04: EPUBとPDFが共存する場合はEPUBを優先する", () => {
  const files = [
    makeFile("book.pdf", PDF_MIME),
    makeFile("book.epub", EPUB_MIME),
  ];
  const result = selectBookFile(files);
  assertEquals(result!.name, "book.epub");
});

Deno.test("selectBookFile - PDFのみの場合はPDFを返す", () => {
  const files = [
    makeFile("cover.jpg", "image/jpeg"),
    makeFile("book.pdf", PDF_MIME),
  ];
  const result = selectBookFile(files);
  assertEquals(result!.name, "book.pdf");
});

Deno.test("selectBookFile - MGRSCRIPT-05: 対応形式がない場合はnullを返す", () => {
  const files = [
    makeFile("cover.jpg", "image/jpeg"),
    makeFile("metadata.opf", "text/xml"),
    makeFile("notes.txt", "text/plain"),
  ];
  const result = selectBookFile(files);
  assertEquals(result, null);
});

// ─── CalibreMigrator 統合テスト ───────────────────────────────────

Deno.test("CalibreMigrator - MGRSCRIPT-01: 完全なメタデータで正常に移管する", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  setupCalibreBook(drive, "source", {
    authorName: "太宰治",
    bookFolderName: "人間失格 (1952)",
    opfXml: makeOpf({
      title: "人間失格",
      author: "太宰治",
      isbn: "9784101010014",
      publisher: "新潮社",
      date: "1952-01-01",
      description: "代表作",
    }),
    epubContent: new Uint8Array([1, 2, 3]),
  });

  const result = await migrator.migrate("source");

  assertEquals(result.total, 1);
  assertEquals(result.succeeded, 1);
  assertEquals(result.skipped, 0);
  assertEquals(result.errors, 0);

  const registered = await drive.findBookByIsbn("9784101010014");
  assertNotEquals(registered, null);
  assertEquals(registered!.properties.title, "人間失格");
  assertEquals(registered!.properties.authors, "太宰治");
  assertEquals(registered!.properties.publisher, "新潮社");
});

Deno.test("CalibreMigrator - MGRSCRIPT-02: ISBNなし書籍も移管できる", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  setupCalibreBook(drive, "source", {
    authorName: "著者X",
    bookFolderName: "ISBNなし本",
    opfXml: makeOpf({ title: "ISBNなし本", author: "著者X" }), // ISBNなし
    epubContent: new Uint8Array([5, 6, 7]),
  });

  const result = await migrator.migrate("source");

  assertEquals(result.total, 1);
  assertEquals(result.succeeded, 1);
  assertEquals(result.skipped, 0);
});

Deno.test("CalibreMigrator - MGRSCRIPT-05: 対応形式の書籍ファイルがない場合はスキップ", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  setupCalibreBook(drive, "source", {
    authorName: "著者Y",
    bookFolderName: "形式なし本",
    opfXml: makeOpf({ title: "形式なし本", author: "著者Y", isbn: "9780000000001" }),
    // epubContent なし → 書籍ファイルなし
  });

  const result = await migrator.migrate("source");

  assertEquals(result.total, 1);
  assertEquals(result.succeeded, 0);
  assertEquals(result.skipped, 1);
  assertEquals(result.details[0].reason, "対応形式の書籍ファイルなし");
});

Deno.test("CalibreMigrator - MGRSCRIPT-06: cover.jpgが存在する場合に表紙を登録する", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);
  const coverBytes = new Uint8Array([0xff, 0xd8, 0xff]); // JPEGマジックバイト

  setupCalibreBook(drive, "source", {
    authorName: "著者Z",
    bookFolderName: "表紙あり本",
    opfXml: makeOpf({ title: "表紙あり本", author: "著者Z", isbn: "9780000000002" }),
    epubContent: new Uint8Array([1, 2, 3]),
    coverContent: coverBytes,
  });

  const result = await migrator.migrate("source");

  assertEquals(result.succeeded, 1);

  // 登録された書籍にcover_file_idが設定されているか確認
  const registered = await drive.findBookByIsbn("9780000000002");
  assertNotEquals(registered!.properties.cover_file_id, undefined);
  assertNotEquals(registered!.properties.cover_file_id, "");

  // カバー画像ファイルがモックに存在するか確認
  const coverId = registered!.properties.cover_file_id;
  const coverFile = drive.files.get(coverId);
  assertNotEquals(coverFile, undefined);
  assertEquals(coverFile!.mimeType, "image/jpeg");
});

Deno.test("CalibreMigrator - MGRSCRIPT-07: cover.jpgがない場合でも移管が成功する", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  setupCalibreBook(drive, "source", {
    authorName: "著者W",
    bookFolderName: "表紙なし本",
    opfXml: makeOpf({ title: "表紙なし本", author: "著者W", isbn: "9780000000003" }),
    epubContent: new Uint8Array([1]),
    // coverContent なし
  });

  const result = await migrator.migrate("source");

  assertEquals(result.succeeded, 1);

  const registered = await drive.findBookByIsbn("9780000000003");
  assertNotEquals(registered, null);
  // cover_file_idは設定されない
  assertEquals(registered!.properties.cover_file_id ?? "", "");
});

Deno.test("CalibreMigrator - MGRSCRIPT-08: ISBNがMyLibraryに既存の場合はスキップする", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  // 事前にMyLibraryに同じISBNで登録しておく
  await bookService.registerBook(
    {
      isbn: "9784101010014",
      title: "人間失格（登録済み）",
      authors: "太宰治",
      publisher: "新潮社",
      publishedDate: "1952",
      description: "",
      coverImageUrl: "",
    },
    new Uint8Array([0]),
    "application/epub+zip",
  );

  // 同じISBNのCalibre書籍を追加
  setupCalibreBook(drive, "source", {
    authorName: "太宰治",
    bookFolderName: "人間失格 (1952)",
    opfXml: makeOpf({ title: "人間失格", author: "太宰治", isbn: "9784101010014" }),
    epubContent: new Uint8Array([1, 2, 3]),
  });

  const result = await migrator.migrate("source");

  assertEquals(result.total, 1);
  assertEquals(result.succeeded, 0);
  assertEquals(result.skipped, 1);
  assertEquals(result.details[0].reason, "ISBN重複");
});

Deno.test("CalibreMigrator - MGRSCRIPT-09: ISBNなし書籍は重複チェックをスキップして移管する", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  setupCalibreBook(drive, "source", {
    authorName: "著者N",
    bookFolderName: "ISBNなし本2",
    opfXml: makeOpf({ title: "ISBNなし本2", author: "著者N" }), // ISBNなし
    epubContent: new Uint8Array([9]),
  });

  const result = await migrator.migrate("source");

  assertEquals(result.succeeded, 1);
  assertEquals(result.skipped, 0);
});

Deno.test("CalibreMigrator - MGRSCRIPT-10: ドライランモードでは書籍がMyLibraryに登録されない", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  setupCalibreBook(drive, "source", {
    authorName: "著者D",
    bookFolderName: "ドライラン本",
    opfXml: makeOpf({ title: "ドライラン本", author: "著者D", isbn: "9780000000010" }),
    epubContent: new Uint8Array([1]),
  });

  const opts: MigrationOptions = { dryRun: true };
  const result = await migrator.migrate("source", opts);

  // 結果にはsuceededが記録される（移管予定として）
  assertEquals(result.succeeded, 1);

  // しかし実際にはMyLibraryに登録されていない
  const registered = await drive.findBookByIsbn("9780000000010");
  assertEquals(registered, null);
});

Deno.test("CalibreMigrator - MGRSCRIPT-11: limitで処理件数を制限する", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  // 3冊セットアップ（同じ著者フォルダに追加）
  drive.addFile({
    id: "af-author",
    name: "著者L",
    mimeType: FOLDER_MIME,
    properties: {},
    parents: ["source"],
  });
  for (let i = 1; i <= 3; i++) {
    const bfId = `bf-book${i}`;
    drive.addFile({
      id: bfId,
      name: `本${i} (2020)`,
      mimeType: FOLDER_MIME,
      properties: {},
      parents: ["af-author"],
    });
    drive.addFile({
      id: `opf-${bfId}`,
      name: "metadata.opf",
      mimeType: "text/xml",
      properties: {},
      parents: [bfId],
      content: new TextEncoder().encode(
        makeOpf({ title: `本${i}`, author: "著者L", isbn: `978000000000${i}` }),
      ),
    });
    drive.addFile({
      id: `epub-${bfId}`,
      name: `本${i}.epub`,
      mimeType: EPUB_MIME,
      properties: {},
      parents: [bfId],
      content: new Uint8Array([i]),
    });
  }

  const result = await migrator.migrate("source", { limit: 2 });

  assertEquals(result.total, 2);
  assertEquals(result.succeeded, 2);
});

Deno.test("CalibreMigrator - MGRSCRIPT-12: 個別エラーが発生しても残りの書籍処理を継続する", async () => {
  // findFilesByParent が特定フォルダでエラーを投げるモックを作成
  class PartiallyFailingMock extends MockGoogleDriveService {
    failForFolderId = "";
    override async findFilesByParent(folderId: string): Promise<DriveFile[]> {
      if (folderId === this.failForFolderId) {
        throw new Error("API Error for specific folder");
      }
      return super.findFilesByParent(folderId);
    }
  }

  const drive = new PartiallyFailingMock();
  const cache = new CacheService();
  const bookService = new BookService(drive, new NoOpMetadataService(), cache);
  const migrator = new CalibreMigrator(drive, bookService);

  // 3冊セットアップ（3人の著者）
  for (let i = 1; i <= 3; i++) {
    const afId = `af-author${i}`;
    const bfId = `bf-book${i}`;
    drive.addFile({
      id: afId,
      name: `著者${i}`,
      mimeType: FOLDER_MIME,
      properties: {},
      parents: ["source"],
    });
    drive.addFile({
      id: bfId,
      name: `本${i} (2020)`,
      mimeType: FOLDER_MIME,
      properties: {},
      parents: [afId],
    });
    drive.addFile({
      id: `opf-${bfId}`,
      name: "metadata.opf",
      mimeType: "text/xml",
      properties: {},
      parents: [bfId],
      content: new TextEncoder().encode(
        makeOpf({
          title: `本${i}`,
          author: `著者${i}`,
          isbn: `978000000100${i}`,
        }),
      ),
    });
    drive.addFile({
      id: `epub-${bfId}`,
      name: `本${i}.epub`,
      mimeType: EPUB_MIME,
      properties: {},
      parents: [bfId],
      content: new Uint8Array([i]),
    });
  }

  // 2冊目の書籍フォルダでAPIエラーが発生するように設定
  drive.failForFolderId = "bf-book2";

  const result = await migrator.migrate("source");

  assertEquals(result.total, 3);
  assertEquals(result.succeeded, 2);
  assertEquals(result.errors, 1);
  assertEquals(
    result.details.filter((d) => d.status === "error").length,
    1,
  );
});

Deno.test("CalibreMigrator - MGRSCRIPT-13: 処理サマリーの件数が正しい", async () => {
  const { drive, bookService } = createServices();
  const migrator = new CalibreMigrator(drive, bookService);

  // Book1: 正常移管
  setupCalibreBook(drive, "source", {
    authorName: "著者P",
    bookFolderName: "正常本",
    opfXml: makeOpf({ title: "正常本", author: "著者P", isbn: "9780000000100" }),
    epubContent: new Uint8Array([1]),
  });

  // Book2: 書籍ファイルなし → スキップ
  setupCalibreBook(drive, "source", {
    authorName: "著者Q",
    bookFolderName: "ファイルなし本",
    opfXml: makeOpf({ title: "ファイルなし本", author: "著者Q", isbn: "9780000000101" }),
    // epubなし
  });

  // Book3: 正常移管
  setupCalibreBook(drive, "source", {
    authorName: "著者R",
    bookFolderName: "正常本2",
    opfXml: makeOpf({ title: "正常本2", author: "著者R", isbn: "9780000000102" }),
    epubContent: new Uint8Array([2]),
  });

  const result = await migrator.migrate("source");

  assertEquals(result.total, 3);
  assertEquals(result.succeeded, 2);
  assertEquals(result.skipped, 1);
  assertEquals(result.errors, 0);
  assertEquals(result.details.length, 3);
});
