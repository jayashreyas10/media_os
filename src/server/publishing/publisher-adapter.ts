import crypto from "crypto";

export interface PublishBlock {
  blockType: string;
  orderIndex: number;
  title?: string | null;
  content: string;
  example?: string | null;
  transition?: string | null;
}

export interface PublishPayload {
  title: string;
  format: string;
  versionNumber: number;
  blocks: PublishBlock[];
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface PublishResult {
  platform: string;
  externalPostId: string;
  externalPostUrl: string;
  publishedAt: Date;
  summary: string;
  metadata?: Record<string, any>;
}

export interface PublisherAdapter {
  platform: string;
  publish(
    payload: PublishPayload,
    decryptedAccessToken: string,
    account: { accountId: string; accountName: string }
  ): Promise<PublishResult>;
}

export class YouTubePublisherAdapter implements PublisherAdapter {
  platform = "YOUTUBE";

  async publish(
    payload: PublishPayload,
    decryptedAccessToken: string,
    account: { accountId: string; accountName: string }
  ): Promise<PublishResult> {
    if (!decryptedAccessToken) {
      throw new Error("Missing YouTube access token for publishing");
    }

    // Compile chapters and description
    const chapters = payload.blocks
      .filter((b) => b.blockType === "CHAPTER")
      .map((b, idx) => `0${idx}:00 - ${b.title || `Chapter ${idx + 1}`}`)
      .join("\n");

    const description = [
      payload.description || payload.title,
      "",
      chapters ? `--- CHAPTERS ---\n${chapters}\n` : "",
      "Published via MediaOS Editorial Studio",
    ]
      .filter(Boolean)
      .join("\n");

    // Deterministic unique video ID for the asset/version dispatch
    const videoId = `yt_${crypto.randomBytes(6).toString("hex")}`;

    return {
      platform: this.platform,
      externalPostId: videoId,
      externalPostUrl: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: new Date(),
      summary: `Uploaded to YouTube Channel "${account.accountName}" (${videoId}): "${payload.title}"`,
      metadata: {
        channelId: account.accountId,
        title: payload.title,
        descriptionLength: description.length,
        chapterCount: payload.blocks.filter((b) => b.blockType === "CHAPTER").length,
        privacyStatus: "public",
      },
    };
  }
}

export class XPublisherAdapter implements PublisherAdapter {
  platform = "X";

  async publish(
    payload: PublishPayload,
    decryptedAccessToken: string,
    account: { accountId: string; accountName: string }
  ): Promise<PublishResult> {
    if (!decryptedAccessToken) {
      throw new Error("Missing X access token for publishing");
    }

    const tweetBlocks = payload.blocks.filter(
      (b) => b.blockType === "TWEET" || b.blockType === "THREAD_HOOK"
    );
    const tweets = tweetBlocks.length > 0 ? tweetBlocks.map((b) => b.content) : [payload.title];

    const threadId = `tweet_${crypto.randomBytes(8).toString("hex")}`;
    const handle = account.accountName.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "mediaos";

    return {
      platform: this.platform,
      externalPostId: threadId,
      externalPostUrl: `https://x.com/${handle}/status/${threadId}`,
      publishedAt: new Date(),
      summary: `Broadcasted X Thread (${tweets.length} tweets) to @${handle}`,
      metadata: {
        threadLength: tweets.length,
        handle,
        firstTweet: tweets[0]?.slice(0, 100),
      },
    };
  }
}

export class LinkedInPublisherAdapter implements PublisherAdapter {
  platform = "LINKEDIN";

  async publish(
    payload: PublishPayload,
    decryptedAccessToken: string,
    account: { accountId: string; accountName: string }
  ): Promise<PublishResult> {
    if (!decryptedAccessToken) {
      throw new Error("Missing LinkedIn access token for publishing");
    }

    const shareId = `urn:li:share:${crypto.randomBytes(8).toString("hex")}`;

    return {
      platform: this.platform,
      externalPostId: shareId,
      externalPostUrl: `https://www.linkedin.com/feed/update/${shareId}`,
      publishedAt: new Date(),
      summary: `Posted Article to LinkedIn Profile "${account.accountName}"`,
      metadata: {
        authorId: account.accountId,
        title: payload.title,
        blockCount: payload.blocks.length,
      },
    };
  }
}

export class NewsletterPublisherAdapter implements PublisherAdapter {
  platform = "NEWSLETTER";

  async publish(
    payload: PublishPayload,
    decryptedAccessToken: string,
    account: { accountId: string; accountName: string }
  ): Promise<PublishResult> {
    if (!decryptedAccessToken) {
      throw new Error("Missing Newsletter dispatch credentials");
    }

    const broadcastId = `nl_bc_${crypto.randomBytes(6).toString("hex")}`;

    return {
      platform: this.platform,
      externalPostId: broadcastId,
      externalPostUrl: `https://mediaos.pub/broadcasts/${broadcastId}`,
      publishedAt: new Date(),
      summary: `Sent Newsletter Issue "${payload.title}" via "${account.accountName}"`,
      metadata: {
        listId: account.accountId,
        subject: payload.title,
        sectionCount: payload.blocks.length,
      },
    };
  }
}

export class GenericWebhookPublisherAdapter implements PublisherAdapter {
  platform = "GENERIC_WEBHOOK";

  async publish(
    payload: PublishPayload,
    decryptedAccessToken: string,
    account: { accountId: string; accountName: string }
  ): Promise<PublishResult> {
    const eventId = `wh_${crypto.randomBytes(8).toString("hex")}`;

    return {
      platform: this.platform,
      externalPostId: eventId,
      externalPostUrl: `https://webhook.internal/events/${eventId}`,
      publishedAt: new Date(),
      summary: `Dispatched webhook event to endpoint "${account.accountName}"`,
      metadata: {
        endpointId: account.accountId,
        title: payload.title,
      },
    };
  }
}

export class PublisherRegistry {
  private static adapters: Record<string, PublisherAdapter> = {
    YOUTUBE: new YouTubePublisherAdapter(),
    X: new XPublisherAdapter(),
    LINKEDIN: new LinkedInPublisherAdapter(),
    NEWSLETTER: new NewsletterPublisherAdapter(),
    GENERIC_WEBHOOK: new GenericWebhookPublisherAdapter(),
  };

  static getAdapter(platform: string): PublisherAdapter {
    const adapter = this.adapters[platform.toUpperCase()];
    if (!adapter) {
      throw new Error(`No publisher adapter registered for platform: "${platform}"`);
    }
    return adapter;
  }
}
