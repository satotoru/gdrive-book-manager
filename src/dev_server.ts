/**
 * 開発・疎通確認用サーバー
 * Google Drive APIのモックを使用して起動する
 */
// deno-lint-ignore-file
import { createApp } from "./app.ts";
import { MockGoogleDriveService } from "./services/drive_mock.ts";
import { CompositeMetadataService, OpenBDService, GoogleBooksService } from "./services/metadata.ts";
import { CacheService } from "./services/cache.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");

const driveService = new MockGoogleDriveService();
const metadataService = new CompositeMetadataService([
  new OpenBDService(),
  new GoogleBooksService(),
]);
const cache = new CacheService();

const { app, bookService } = createApp({ driveService, metadataService, cache });

// サンプルデータを登録
async function seedData() {
  const sampleContent = new TextEncoder().encode("sample epub content");

  await bookService.registerBook(
    {
      isbn: "9784101010014",
      title: "人間失格",
      authors: "太宰治",
      publisher: "新潮社",
      publishedDate: "1952-10-15",
      description: "太宰治の代表的な小説",
      coverImageUrl: "",
    },
    sampleContent,
    "application/epub+zip",
  );

  await bookService.registerBook(
    {
      isbn: "9784101010021",
      title: "坊っちゃん",
      authors: "夏目漱石",
      publisher: "新潮社",
      publishedDate: "1906-04-01",
      description: "夏目漱石の代表的な小説",
      coverImageUrl: "",
    },
    new TextEncoder().encode("sample pdf content"),
    "application/pdf",
  );

  await bookService.registerBook(
    {
      isbn: "9784003101",
      title: "こころ",
      authors: "夏目漱石",
      publisher: "岩波書店",
      publishedDate: "1914-09-01",
      description: "",
      coverImageUrl: "",
    },
    sampleContent,
    "application/epub+zip",
  );

  console.log("サンプルデータ3冊を登録しました");
}

await seedData();

console.log(`開発サーバー起動: http://localhost:${PORT}`);
console.log("（Google Drive APIモックを使用）");
Deno.serve({ port: PORT }, app.fetch);
