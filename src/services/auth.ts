export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
}

export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface GcpClientSecretJson {
  web?: {
    client_id: string;
    client_secret: string;
    auth_uri: string;
    token_uri: string;
    redirect_uris?: string[];
  };
  installed?: {
    client_id: string;
    client_secret: string;
    auth_uri: string;
    token_uri: string;
    redirect_uris?: string[];
  };
}

const TOKEN_FILE = "./token.json";

/**
 * プロジェクトルートから client_secret*.json ファイルを探して読み込む
 */
export async function loadClientSecretJson(
  dir: string = ".",
): Promise<AuthConfig | null> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (
        entry.isFile &&
        entry.name.startsWith("client_secret") &&
        entry.name.endsWith(".json")
      ) {
        const path = `${dir}/${entry.name}`;
        const data = JSON.parse(await Deno.readTextFile(path)) as GcpClientSecretJson;
        const creds = data.web || data.installed;
        if (creds) {
          console.log(`認証情報を読み込みました: ${entry.name}`);
          return {
            clientId: creds.client_id,
            clientSecret: creds.client_secret,
            redirectUri: creds.redirect_uris?.[0] || "",
          };
        }
      }
    }
  } catch {
    // directory not readable
  }
  return null;
}

export class AuthService {
  private config: AuthConfig;
  private tokenInfo: TokenInfo | null = null;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  get clientId(): string {
    return this.config.clientId;
  }

  get clientSecret(): string {
    return this.config.clientSecret;
  }

  async loadToken(): Promise<TokenInfo | null> {
    try {
      const data = await Deno.readTextFile(TOKEN_FILE);
      this.tokenInfo = JSON.parse(data);
      return this.tokenInfo;
    } catch {
      return null;
    }
  }

  async saveToken(tokenInfo: TokenInfo): Promise<void> {
    this.tokenInfo = tokenInfo;
    await Deno.writeTextFile(TOKEN_FILE, JSON.stringify(tokenInfo, null, 2));
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive",
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(code: string): Promise<TokenInfo> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = await res.json();
    const tokenInfo: TokenInfo = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await this.saveToken(tokenInfo);
    return tokenInfo;
  }

  async refreshAccessToken(): Promise<TokenInfo> {
    const refreshToken = this.tokenInfo?.refreshToken ||
      this.config.refreshToken;
    if (!refreshToken) {
      throw new Error(
        "No refresh token available. Please re-authenticate.",
      );
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = await res.json();
    const tokenInfo: TokenInfo = {
      accessToken: data.access_token,
      refreshToken: refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await this.saveToken(tokenInfo);
    return tokenInfo;
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokenInfo) {
      await this.loadToken();
    }
    if (!this.tokenInfo) {
      throw new Error(
        "Not authenticated. Please complete the OAuth2 flow first.",
      );
    }

    // Refresh if expired or about to expire (within 5 minutes)
    if (Date.now() >= this.tokenInfo.expiresAt - 5 * 60 * 1000) {
      await this.refreshAccessToken();
    }

    return this.tokenInfo!.accessToken;
  }

  isAuthenticated(): boolean {
    return this.tokenInfo !== null;
  }
}
