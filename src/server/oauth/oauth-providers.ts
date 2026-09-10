import crypto from "crypto";

export type SupportedOAuthPlatform = "YOUTUBE" | "X" | "LINKEDIN" | "NEWSLETTER" | "GENERIC_WEBHOOK";

export interface OAuthProviderConfig {
  platform: SupportedOAuthPlatform;
  isLive: boolean;
  clientId?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  accountId: string;
  accountName: string;
  accountEmail?: string;
  isMock: boolean;
  rawResponseMetadata?: Record<string, unknown>;
}

export class OAuthProviderRegistry {
  /**
   * Determines if real live OAuth credentials exist for the specified platform.
   */
  static isLiveConfigured(platform: SupportedOAuthPlatform): boolean {
    switch (platform) {
      case "YOUTUBE":
        return Boolean(
          (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
          (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET) &&
          process.env.AI_PROVIDER_DEFAULT !== "mock"
        );
      case "X":
        return Boolean(
          (process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID) &&
          (process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET) &&
          process.env.AI_PROVIDER_DEFAULT !== "mock"
        );
      case "LINKEDIN":
        return Boolean(
          process.env.LINKEDIN_CLIENT_ID &&
          process.env.LINKEDIN_CLIENT_SECRET &&
          process.env.AI_PROVIDER_DEFAULT !== "mock"
        );
      case "NEWSLETTER":
      case "GENERIC_WEBHOOK":
      default:
        return false;
    }
  }

  /**
   * Builds the authorization URL for initiating the OAuth handshake.
   */
  static getAuthorizationUrl(
    platform: SupportedOAuthPlatform,
    stateToken: string,
    redirectUri: string,
    codeVerifier?: string
  ): { authUrl: string; isLive: boolean } {
    const isLive = this.isLiveConfigured(platform);

    if (!isLive) {
      // Offline / Test / Mock flow: Deterministic loopback with mock authorization code
      const separator = redirectUri.includes("?") ? "&" : "?";
      const authUrl = `${redirectUri}${separator}state=${stateToken}&code=mock_code_${platform.toLowerCase()}_${Date.now()}`;
      return { authUrl, isLive: false };
    }

    // Live OAuth Endpoints
    switch (platform) {
      case "YOUTUBE": {
        const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
        const scope = encodeURIComponent(
          "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.email"
        );
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
          clientId
        )}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(
          stateToken
        )}&redirect_uri=${encodeURIComponent(redirectUri)}`;
        return { authUrl, isLive: true };
      }

      case "X": {
        const clientId = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || "";
        const scope = encodeURIComponent("tweet.read tweet.write users.read offline.access");
        let challenge = "mock_challenge";
        if (codeVerifier) {
          challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
        }
        const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(
          clientId
        )}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&scope=${scope}&state=${encodeURIComponent(
          stateToken
        )}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
        return { authUrl, isLive: true };
      }

      case "LINKEDIN": {
        const clientId = process.env.LINKEDIN_CLIENT_ID || "";
        const scope = encodeURIComponent("r_liteprofile r_emailaddress w_member_social");
        const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(
          clientId
        )}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&state=${encodeURIComponent(stateToken)}&scope=${scope}`;
        return { authUrl, isLive: true };
      }

      default: {
        const separator = redirectUri.includes("?") ? "&" : "?";
        return {
          authUrl: `${redirectUri}${separator}state=${stateToken}&code=mock_code_${platform.toLowerCase()}_${Date.now()}`,
          isLive: false,
        };
      }
    }
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  static async exchangeCodeForTokens(
    platform: SupportedOAuthPlatform,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokenResult> {
    const isLive = this.isLiveConfigured(platform);

    if (!isLive) {
      // Deterministic mock tokens
      const randomSuffix = crypto.randomBytes(16).toString("hex");
      return {
        accessToken: `mock_${platform.toLowerCase()}_live_token_${randomSuffix}`,
        refreshToken: `mock_${platform.toLowerCase()}_refresh_token_${randomSuffix}`,
        expiresInSeconds: 3600,
        accountId: `mock_${platform.toLowerCase()}_acc_${randomSuffix.slice(0, 8)}`,
        accountName: `Demonstration ${platform} Channel`,
        accountEmail: `demo-${platform.toLowerCase()}@mediaos.internal`,
        isMock: true,
        rawResponseMetadata: {
          mode: "MOCK / DEMONSTRATION MODE",
          warning: "Demonstration channel. No real platform activity will occur.",
        },
      };
    }

    // Live Token Exchange
    switch (platform) {
      case "YOUTUBE": {
        const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
        const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";

        const params = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        });

        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Google OAuth token exchange failed: HTTP ${res.status} - ${errText}`);
        }

        const data = await res.json();
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresInSeconds: data.expires_in || 3600,
          accountId: `youtube_prod_${crypto.randomBytes(6).toString("hex")}`,
          accountName: "YouTube Production Channel",
          isMock: false,
          rawResponseMetadata: {
            tokenType: data.token_type,
            scope: data.scope,
          },
        };
      }

      default:
        throw new Error(`Live token exchange not implemented for platform ${platform}`);
    }
  }
}
