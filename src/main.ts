import { serve } from "hono/deno";
import { google } from "googleapis";
import { createApp } from "./app.ts";
import { RealGoogleDriveService } from "./services/drive.ts";
import {
  CompositeMetadataService,
  GoogleBooksService,
  OpenBDService,
} from "./services/metadata.ts";
import { CacheService } from "./services/cache.ts";
import { AuthService } from "./services/auth.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");

async function main() {
  // Load auth config from environment
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI") ||
    `http://localhost:${PORT}/auth/callback`;

  const authService = new AuthService({
    clientId,
    clientSecret,
    redirectUri,
  });

  // Try to load existing token
  const token = await authService.loadToken();
  if (!token) {
    console.log("No authentication token found.");
    console.log(`Please visit: ${authService.getAuthUrl()}`);
    console.log("After authentication, the token will be saved automatically.");
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
  serve({ fetch: app.fetch, port: PORT });
}

main().catch(console.error);
