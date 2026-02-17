import { google } from "googleapis";
import { createApp } from "./app.ts";
import { RealGoogleDriveService } from "./services/drive.ts";
import {
  CompositeMetadataService,
  GoogleBooksService,
  OpenBDService,
} from "./services/metadata.ts";
import { CacheService } from "./services/cache.ts";
import { AuthService, loadClientSecretJson } from "./services/auth.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");

async function main() {
  // 1. client_secret*.json から認証情報を自動読み込み（環境変数より優先）
  const jsonConfig = await loadClientSecretJson(".");

  const clientId = jsonConfig?.clientId || Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = jsonConfig?.clientSecret || Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const redirectUri = jsonConfig?.redirectUri ||
    Deno.env.get("GOOGLE_REDIRECT_URI") ||
    `http://localhost:${PORT}/auth/callback`;

  if (!clientId || !clientSecret) {
    console.error("エラー: Google認証情報が見つかりません。");
    console.error("以下のいずれかの方法で設定してください:");
    console.error("  1. プロジェクトルートに client_secret_*.json を配置");
    console.error("  2. 環境変数 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を設定");
    Deno.exit(1);
  }

  const authService = new AuthService({
    clientId,
    clientSecret,
    redirectUri,
  });

  // Try to load existing token
  const token = await authService.loadToken();
  if (!token) {
    console.log("認証トークンが見つかりません。ブラウザで以下のURLを開いてください:");
    console.log(authService.getAuthUrl());
  } else {
    console.log("認証トークンを読み込みました");
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );

  if (token) {
    oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
    });
  }

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const driveService = new RealGoogleDriveService(drive);

  const metadataService = new CompositeMetadataService([
    new OpenBDService(),
    new GoogleBooksService(),
  ]);

  const cache = new CacheService();

  const { app } = createApp({
    driveService,
    metadataService,
    cache,
  });

  // Auth callback route
  app.get("/auth/callback", async (c) => {
    const code = c.req.query("code");
    if (!code) {
      return c.text("No code provided", 400);
    }

    try {
      const tokenInfo = await authService.exchangeCode(code);
      oauth2Client.setCredentials({
        access_token: tokenInfo.accessToken,
        refresh_token: tokenInfo.refreshToken,
      });
      return c.redirect("/");
    } catch (error) {
      return c.text(`Authentication failed: ${String(error)}`, 500);
    }
  });

  // Auth status
  app.get("/auth/status", (c) => {
    return c.json({ authenticated: authService.isAuthenticated() });
  });

  console.log(`Server running on http://localhost:${PORT}`);
  Deno.serve({ port: PORT }, app.fetch);
}

main().catch(console.error);
