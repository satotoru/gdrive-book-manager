/**
 * Google Drive API 読み取り専用の動作確認スクリプト
 *
 * ファイルの作成・編集・削除は一切行わず、読み取りのみ確認する。
 */
import { google } from "googleapis";
import { loadClientSecretJson, AuthService } from "../src/services/auth.ts";

async function main() {
  // 1. client_secret*.json を読み込み
  const config = await loadClientSecretJson(".");
  if (!config) {
    console.error("client_secret*.json が見つかりません。プロジェクトルートに配置してください。");
    Deno.exit(1);
  }

  const PORT = parseInt(Deno.env.get("PORT") || "8000");
  const redirectUri = config.redirectUri || `http://localhost:${PORT}/auth/callback`;

  const authService = new AuthService({
    ...config,
    redirectUri,
  });

  // 2. トークン読み込み
  const token = await authService.loadToken();
  if (!token) {
    console.log("認証トークンが見つかりません。先にサーバーを起動してOAuth認証を完了してください。");
    console.log("");
    console.log("手順:");
    console.log("  1. deno task start でサーバー起動");
    console.log("  2. 表示されるURLをブラウザで開いて認証");
    console.log("  3. 認証完了後、このスクリプトを再実行");
    Deno.exit(1);
  }

  console.log("認証トークンを読み込みました");

  // 3. OAuth2クライアント作成
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

  // --- 読み取り専用の確認 ---

  console.log("\n=== Google Drive API 読み取り確認 ===\n");

  // 4. Drive内の情報を取得（About API）
  try {
    console.log("[1] ユーザー情報の取得...");
    const about = await drive.about.get({
      fields: "user(displayName,emailAddress),storageQuota(usage,limit)",
    });
    console.log(`  ユーザー: ${about.data.user?.displayName} (${about.data.user?.emailAddress})`);
    const usage = about.data.storageQuota?.usage;
    const limit = about.data.storageQuota?.limit;
    if (usage && limit) {
      console.log(`  ストレージ: ${(Number(usage) / 1024 / 1024 / 1024).toFixed(2)} GB / ${(Number(limit) / 1024 / 1024 / 1024).toFixed(2)} GB`);
    }
    console.log("  → OK");
  } catch (e) {
    console.error(`  → 失敗: ${e}`);
  }

  // 5. ファイル一覧の取得（最大5件）
  try {
    console.log("\n[2] ファイル一覧の取得（最大5件）...");
    const list = await drive.files.list({
      pageSize: 5,
      fields: "files(id, name, mimeType, size, modifiedTime)",
      orderBy: "modifiedTime desc",
    });
    if (list.data.files && list.data.files.length > 0) {
      for (const file of list.data.files) {
        const size = file.size ? `${(Number(file.size) / 1024).toFixed(1)}KB` : "N/A";
        console.log(`  - ${file.name} (${file.mimeType}, ${size})`);
      }
    } else {
      console.log("  ファイルがありません");
    }
    console.log("  → OK");
  } catch (e) {
    console.error(`  → 失敗: ${e}`);
  }

  // 6. MyLibraryフォルダの存在確認
  try {
    console.log("\n[3] MyLibraryフォルダの検索...");
    const folders = await drive.files.list({
      q: "name='MyLibrary' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id, name)",
    });
    if (folders.data.files && folders.data.files.length > 0) {
      console.log(`  MyLibraryフォルダが見つかりました: ID=${folders.data.files[0].id}`);

      // MyLibrary配下のファイルを取得
      const children = await drive.files.list({
        q: `'${folders.data.files[0].id}' in parents and trashed=false`,
        fields: "files(id, name, mimeType)",
        pageSize: 10,
      });
      if (children.data.files && children.data.files.length > 0) {
        console.log(`  配下のファイル/フォルダ (${children.data.files.length}件):`);
        for (const f of children.data.files) {
          console.log(`    - ${f.name} (${f.mimeType})`);
        }
      } else {
        console.log("  MyLibrary配下にファイルはありません");
      }
    } else {
      console.log("  MyLibraryフォルダは存在しません（初回起動時に自動作成されます）");
    }
    console.log("  → OK");
  } catch (e) {
    console.error(`  → 失敗: ${e}`);
  }

  // 7. app_type=my_library_book のファイル検索
  try {
    console.log("\n[4] 管理対象書籍（app_type=my_library_book）の検索...");
    const books = await drive.files.list({
      q: "properties has { key='app_type' and value='my_library_book' } and trashed=false",
      fields: "files(id, name, mimeType, properties)",
      pageSize: 10,
    });
    if (books.data.files && books.data.files.length > 0) {
      console.log(`  登録済み書籍: ${books.data.files.length}冊`);
      for (const book of books.data.files) {
        const props = book.properties || {};
        console.log(`    - ${props.title || book.name} by ${props.authors || "不明"}`);
      }
    } else {
      console.log("  登録済み書籍はありません");
    }
    console.log("  → OK");
  } catch (e) {
    console.error(`  → 失敗: ${e}`);
  }

  console.log("\n=== 読み取り確認完了 ===");
  console.log("※ ファイルの作成・編集・削除は行っていません");
}

main().catch(console.error);
