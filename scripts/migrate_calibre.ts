/**
 * Calibreライブラリ → MyLibrary 一括移管スクリプト
 *
 * 使用方法:
 *   deno task migrate -- --source-folder-id=<FOLDER_ID> [--dry-run] [--limit=N]
 *
 * オプション:
 *   --source-folder-id  移管元のGoogle DriveフォルダID（必須）
 *   --dry-run           実際の移管を行わず、処理内容のみ出力
 *   --limit=N           処理件数をN冊に制限（テスト用）
 */
import {
  BookMetadata,
  BookMetadataService,
  DriveFile,
  GoogleDriveService,
} from "../src/types.ts";
import { BookService } from "../src/services/book.ts";
import { CacheService } from "../src/services/cache.ts";

export interface MigrationOptions {
  dryRun?: boolean;
  limit?: number;
}

export interface MigrationDetail {
  title: string;
  status: "succeeded" | "skipped" | "error";
  reason?: string;
}

export interface MigrationResult {
  total: number;
  succeeded: number;
  skipped: number;
  errors: number;
  details: MigrationDetail[];
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const EXTENSION_PRIORITY = [".epub", ".pdf", ".mobi", ".azw3", ".azw"];

// ─── 公開ユーティリティ関数 ──────────────────────────────────────

/**
 * Calibreの metadata.opf (OPF/XML) をパースして BookMetadata を返す。
 * ISBNはハイフン・スペース除去済み。日付はT以降を除去。
 */
export function parseMetadataOpf(xml: string): Partial<BookMetadata> {
  const getFirst = (tag: string): string => {
    const re = new RegExp(
      `<dc:${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</dc:${tag}>`,
      "i",
    );
    const match = xml.match(re);
    return match ? match[1].trim() : "";
  };

  // 複数の dc:creator を収集
  const creators: string[] = [];
  const creatorRe = /<dc:creator(?:\s[^>]*)?>([^<]+)<\/dc:creator>/gi;
  let m: RegExpExecArray | null;
  while ((m = creatorRe.exec(xml)) !== null) {
    creators.push(m[1].trim());
  }

  // dc:identifier の opf:scheme="ISBN" からISBNを取得
  let isbn = "";
  const identRe = /<dc:identifier([^>]*)>([^<]+)<\/dc:identifier>/gi;
  while ((m = identRe.exec(xml)) !== null) {
    if (/opf:scheme\s*=\s*["']isbn["']/i.test(m[1])) {
      isbn = m[2].trim().replace(/[-\s]/g, "");
      break;
    }
  }

  const rawDate = getFirst("date");
  const publishedDate = rawDate ? rawDate.split("T")[0] : "";

  return {
    isbn,
    title: getFirst("title"),
    authors: creators.length > 0 ? creators.join("-") : getFirst("creator"),
    publisher: getFirst("publisher"),
    publishedDate,
    description: getFirst("description"),
    coverImageUrl: "",
  };
}

/**
 * ファイルリストから書籍ファイルを優先順位で選択する。
 * 優先順位: epub > pdf > mobi > azw3 > azw
 */
export function selectBookFile(files: DriveFile[]): DriveFile | null {
  for (const ext of EXTENSION_PRIORITY) {
    const file = files.find((f) => f.name.toLowerCase().endsWith(ext));
    if (file) return file;
  }
  return null;
}

/** BookMetadataService の何もしない実装（移管時はメタデータAPI不要） */
export class NoOpMetadataService implements BookMetadataService {
  async fetchByIsbn(_isbn: string): Promise<BookMetadata | null> {
    await Promise.resolve();
    return null;
  }
}

// ─── CalibreMigrator ─────────────────────────────────────────────

export class CalibreMigrator {
  constructor(
    private driveService: GoogleDriveService,
    private bookService: BookService,
  ) {}

  async migrate(
    sourceFolderId: string,
    options: MigrationOptions = {},
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      total: 0,
      succeeded: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    const authorFolders = await this.driveService.findFilesByParent(
      sourceFolderId,
    );

    outer:
    for (const authorFolder of authorFolders) {
      if (authorFolder.mimeType !== FOLDER_MIME) continue;

      const bookFolders = await this.driveService.findFilesByParent(
        authorFolder.id,
      );

      for (const bookFolder of bookFolders) {
        if (bookFolder.mimeType !== FOLDER_MIME) continue;

        if (options.limit !== undefined && result.total >= options.limit) {
          break outer;
        }

        result.total++;

        let detail: MigrationDetail;
        try {
          detail = await this.migrateBook(
            bookFolder.id,
            bookFolder.name,
            options,
          );
        } catch (e) {
          detail = {
            title: bookFolder.name,
            status: "error",
            reason: e instanceof Error ? e.message : String(e),
          };
        }

        result.details.push(detail);
        if (detail.status === "succeeded") result.succeeded++;
        else if (detail.status === "skipped") result.skipped++;
        else result.errors++;
      }
    }

    return result;
  }

  private async migrateBook(
    bookFolderId: string,
    bookFolderName: string,
    options: MigrationOptions,
  ): Promise<MigrationDetail> {
    const files = await this.driveService.findFilesByParent(bookFolderId);

    // metadata.opf をパース
    let metadata: Partial<BookMetadata> = {};
    const opfFile = files.find((f) => f.name === "metadata.opf");
    if (opfFile) {
      const content = await this.driveService.getFileContent(opfFile.id);
      metadata = parseMetadataOpf(new TextDecoder().decode(content));
    }

    const title = metadata.title || bookFolderName;

    // ISBNによる重複チェック
    if (metadata.isbn) {
      const existing = await this.bookService.findBookByIsbn(metadata.isbn);
      if (existing) {
        return { title, status: "skipped", reason: "ISBN重複" };
      }
    }

    // 書籍ファイル選択
    const bookFile = selectBookFile(files);
    if (!bookFile) {
      return { title, status: "skipped", reason: "対応形式の書籍ファイルなし" };
    }

    if (options.dryRun) {
      return { title, status: "succeeded" };
    }

    // 書籍ファイルをダウンロードして登録
    const bookContent = await this.driveService.getFileContent(bookFile.id);
    const bookMimeType = getMimeType(bookFile.name);

    const fullMetadata: BookMetadata = {
      isbn: metadata.isbn || "",
      title,
      authors: metadata.authors || "",
      publisher: metadata.publisher || "",
      publishedDate: metadata.publishedDate || "",
      description: metadata.description || "",
      coverImageUrl: "",
    };

    const registeredFile = await this.bookService.registerBook(
      fullMetadata,
      bookContent,
      bookMimeType,
    );

    // cover.jpg が存在する場合はDriveからダウンロードして登録
    const coverFile = files.find((f) => f.name === "cover.jpg");
    if (coverFile) {
      try {
        const coverData = await this.driveService.getFileContent(coverFile.id);
        const authorFolderId = registeredFile.parents[0];
        const coverFileName = `cover_${registeredFile.id}.jpg`;
        const coverDriveFile = await this.driveService.uploadCoverImage(
          authorFolderId,
          coverFileName,
          coverData,
          "image/jpeg",
        );
        await this.driveService.updateFileProperties(registeredFile.id, {
          ...registeredFile.properties,
          cover_file_id: coverDriveFile.id,
        });
      } catch {
        // カバー画像登録失敗は非致命的エラーとして継続
      }
    }

    return { title, status: "succeeded" };
  }
}

// ─── ヘルパー ────────────────────────────────────────────────────

function getMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".epub")) return "application/epub+zip";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mobi")) return "application/x-mobipocket-ebook";
  return "application/octet-stream";
}

// ─── CLI エントリポイント ────────────────────────────────────────

if (import.meta.main) {
  const { loadClientSecretJson, AuthService } = await import(
    "../src/services/auth.ts"
  );
  const { RealGoogleDriveService } = await import("../src/services/drive.ts");
  const { google } = await import("googleapis");

  const args: Record<string, string | boolean> = {};
  for (const arg of Deno.args) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    args[key] = value ?? true;
  }

  const sourceFolderId = args["source-folder-id"] as string | undefined;
  if (!sourceFolderId) {
    console.error(
      "使用方法: deno task migrate -- --source-folder-id=<FOLDER_ID> [--dry-run] [--limit=N]",
    );
    Deno.exit(1);
  }

  const PORT = parseInt(Deno.env.get("PORT") || "8000");
  const config = await loadClientSecretJson(".");
  if (!config) {
    console.error(
      "client_secret*.json が見つかりません。プロジェクトルートに配置してください。",
    );
    Deno.exit(1);
  }

  const redirectUri = config.redirectUri ||
    `http://localhost:${PORT}/auth/callback`;
  const authService = new AuthService({ ...config, redirectUri });
  const token = await authService.loadToken();
  if (!token) {
    console.error(
      "認証トークンが見つかりません。先にサーバーを起動してOAuth認証を完了してください。",
    );
    Deno.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    redirectUri,
  );
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const driveService = new RealGoogleDriveService(drive);
  const cache = new CacheService();
  const bookService = new BookService(driveService, new NoOpMetadataService(), cache);
  const migrator = new CalibreMigrator(driveService, bookService);

  const dryRun = args["dry-run"] === true;
  const limit = args["limit"] ? parseInt(args["limit"] as string) : undefined;

  console.log(`移管元フォルダID: ${sourceFolderId}`);
  if (dryRun) console.log("ドライランモード: 実際の移管は行いません");
  if (limit) console.log(`件数制限: ${limit} 冊`);
  console.log("");

  const result = await migrator.migrate(sourceFolderId, { dryRun, limit });

  console.log("=== 移管結果 ===");
  console.log(`処理対象: ${result.total} 冊`);
  console.log(`成功:     ${result.succeeded} 冊`);
  console.log(`スキップ: ${result.skipped} 冊`);
  console.log(`エラー:   ${result.errors} 冊`);

  if (result.skipped > 0) {
    console.log("\nスキップ詳細:");
    for (const d of result.details.filter((d) => d.status === "skipped")) {
      console.log(`  - ${d.title}: ${d.reason}`);
    }
  }
  if (result.errors > 0) {
    console.log("\nエラー詳細:");
    for (const d of result.details.filter((d) => d.status === "error")) {
      console.log(`  - ${d.title}: ${d.reason}`);
    }
  }
}
