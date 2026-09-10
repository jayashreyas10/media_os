import crypto from "crypto";

export interface RawObservedMetrics {
  impressions?: number;
  views?: number;
  engagements?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  watchTimeSeconds?: number;
  conversions?: number;
  subscribersGained?: number;
}

export interface DerivedMetrics {
  ctr: number;
  engagementRate: number;
  avgViewDurationSeconds: number;
  retentionRate: number;
  conversionRate: number;
}

export interface NormalizedMetricPayload {
  platform: "YOUTUBE" | "X" | "LINKEDIN" | "NEWSLETTER" | "GENERIC";
  periodStart: Date;
  periodEnd: Date;
  observed: Required<RawObservedMetrics>;
  derived: DerivedMetrics;
  isSynthetic: boolean;
  syntheticLabel: string | null;
  dataSource: string;
  provenance: {
    adapter: string;
    ingestedAt: string;
    rawPayloadHash: string;
    externalId?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface IngestionValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PlatformMetricsAdapter {
  readonly platform: "YOUTUBE" | "X" | "LINKEDIN" | "NEWSLETTER" | "GENERIC";
  validate(rawPayload: unknown): IngestionValidationResult;
  normalize(rawPayload: unknown, isSynthetic?: boolean, dataSource?: string): NormalizedMetricPayload;
}

/**
 * Validates non-negative numerical properties
 */
function validateNonNegativeNumbers(
  obj: Record<string, unknown>,
  fields: string[]
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (field in obj && obj[field] !== undefined && obj[field] !== null) {
      const val = obj[field];
      if (typeof val !== "number" || isNaN(val) || val < 0) {
        errors.push(`Field '${field}' must be a non-negative number, received: ${val}`);
      }
    }
  }
  return errors;
}

/**
 * Calculates derived metrics safely from raw observed values
 * WITHOUT mutating or overwriting the raw observed values.
 */
export function calculateDerivedMetrics(
  observed: Required<RawObservedMetrics>,
  retentionInput?: number
): DerivedMetrics {
  const { impressions, views, engagements, clicks, watchTimeSeconds, conversions } = observed;

  // CTR: clicks / impressions (or clicks / views if impressions are 0)
  const ctrBasis = impressions > 0 ? impressions : views;
  const ctr = ctrBasis > 0 ? Math.min(1.0, clicks / ctrBasis) : 0.0;

  // Engagement Rate: engagements / impressions (or engagements / views)
  const engBasis = impressions > 0 ? impressions : views;
  const engagementRate = engBasis > 0 ? Math.min(1.0, engagements / engBasis) : 0.0;

  // Avg View Duration: watchTimeSeconds / views
  const avgViewDurationSeconds = views > 0 ? Math.max(0, watchTimeSeconds / views) : 0.0;

  // Retention Rate: 0.0 to 1.0 (defaults to supplied or avgViewDuration ratio)
  const retentionRate =
    retentionInput !== undefined && retentionInput !== null
      ? Math.max(0, Math.min(1.0, retentionInput))
      : 0.0;

  // Conversion Rate: conversions / clicks (or conversions / views)
  const convBasis = clicks > 0 ? clicks : views;
  const conversionRate = convBasis > 0 ? Math.min(1.0, conversions / convBasis) : 0.0;

  return {
    ctr: Number(ctr.toFixed(4)),
    engagementRate: Number(engagementRate.toFixed(4)),
    avgViewDurationSeconds: Number(avgViewDurationSeconds.toFixed(2)),
    retentionRate: Number(retentionRate.toFixed(4)),
    conversionRate: Number(conversionRate.toFixed(4)),
  };
}

/**
 * YouTube Metrics Adapter
 */
export class YouTubeMetricsAdapter implements PlatformMetricsAdapter {
  readonly platform = "YOUTUBE" as const;

  validate(rawPayload: unknown): IngestionValidationResult {
    if (!rawPayload || typeof rawPayload !== "object") {
      return { valid: false, errors: ["Payload must be an object"] };
    }
    const p = rawPayload as Record<string, unknown>;
    const errors: string[] = [];

    errors.push(
      ...validateNonNegativeNumbers(p, [
        "views",
        "watchTimeSeconds",
        "likes",
        "comments",
        "shares",
        "subscribersGained",
        "impressions",
        "clicks",
        "conversions",
      ])
    );

    if (p.periodStart && isNaN(new Date(p.periodStart as string).getTime())) {
      errors.push("periodStart is an invalid date");
    }
    if (p.periodEnd && isNaN(new Date(p.periodEnd as string).getTime())) {
      errors.push("periodEnd is an invalid date");
    }

    return { valid: errors.length === 0, errors };
  }

  normalize(
    rawPayload: unknown,
    isSynthetic = false,
    dataSource = "MANUAL_INGESTION"
  ): NormalizedMetricPayload {
    const p = rawPayload as Record<string, unknown>;
    const views = Math.max(0, Number(p.views || 0));
    const impressions = Math.max(views, Number(p.impressions || views));
    const likes = Math.max(0, Number(p.likes || 0));
    const comments = Math.max(0, Number(p.comments || 0));
    const shares = Math.max(0, Number(p.shares || 0));
    const engagements = Math.max(0, Number(p.engagements || likes + comments + shares));
    const clicks = Math.max(0, Number(p.clicks || 0));
    const watchTimeSeconds = Math.max(0, Number(p.watchTimeSeconds || 0));
    const conversions = Math.max(0, Number(p.conversions || 0));
    const subscribersGained = Math.max(0, Number(p.subscribersGained || 0));

    const observed: Required<RawObservedMetrics> = {
      impressions,
      views,
      engagements,
      likes,
      comments,
      shares,
      clicks,
      watchTimeSeconds,
      conversions,
      subscribersGained,
    };

    const retentionInput = p.retentionRate !== undefined ? Number(p.retentionRate) : undefined;
    const derived = calculateDerivedMetrics(observed, retentionInput);

    const periodStart = p.periodStart ? new Date(p.periodStart as string) : new Date(Date.now() - 86400000);
    const periodEnd = p.periodEnd ? new Date(p.periodEnd as string) : new Date();

    const rawPayloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(rawPayload))
      .digest("hex")
      .slice(0, 16);

    return {
      platform: this.platform,
      periodStart,
      periodEnd,
      observed,
      derived,
      isSynthetic,
      syntheticLabel: isSynthetic ? "SYNTHETIC / DEMONSTRATION DATA" : null,
      dataSource,
      provenance: {
        adapter: "YouTubeMetricsAdapter",
        ingestedAt: new Date().toISOString(),
        rawPayloadHash,
        externalId: typeof p.externalId === "string" ? p.externalId : undefined,
      },
      metadata: (p.metadata as Record<string, unknown>) || {},
    };
  }
}

/**
 * X (Twitter) Metrics Adapter
 */
export class XMetricsAdapter implements PlatformMetricsAdapter {
  readonly platform = "X" as const;

  validate(rawPayload: unknown): IngestionValidationResult {
    if (!rawPayload || typeof rawPayload !== "object") {
      return { valid: false, errors: ["Payload must be an object"] };
    }
    const p = rawPayload as Record<string, unknown>;
    const errors: string[] = [];

    errors.push(
      ...validateNonNegativeNumbers(p, [
        "impressions",
        "likes",
        "retweets",
        "replies",
        "shares",
        "clicks",
        "views",
        "conversions",
      ])
    );

    return { valid: errors.length === 0, errors };
  }

  normalize(
    rawPayload: unknown,
    isSynthetic = false,
    dataSource = "MANUAL_INGESTION"
  ): NormalizedMetricPayload {
    const p = rawPayload as Record<string, unknown>;
    const impressions = Math.max(0, Number(p.impressions || 0));
    const views = Math.max(0, Number(p.views || impressions));
    const likes = Math.max(0, Number(p.likes || 0));
    const shares = Math.max(0, Number(p.shares || p.retweets || 0));
    const comments = Math.max(0, Number(p.comments || p.replies || 0));
    const engagements = Math.max(0, Number(p.engagements || likes + shares + comments));
    const clicks = Math.max(0, Number(p.clicks || 0));
    const watchTimeSeconds = Math.max(0, Number(p.watchTimeSeconds || 0));
    const conversions = Math.max(0, Number(p.conversions || 0));
    const subscribersGained = Math.max(0, Number(p.subscribersGained || p.followersGained || 0));

    const observed: Required<RawObservedMetrics> = {
      impressions,
      views,
      engagements,
      likes,
      comments,
      shares,
      clicks,
      watchTimeSeconds,
      conversions,
      subscribersGained,
    };

    const derived = calculateDerivedMetrics(observed);
    const periodStart = p.periodStart ? new Date(p.periodStart as string) : new Date(Date.now() - 86400000);
    const periodEnd = p.periodEnd ? new Date(p.periodEnd as string) : new Date();
    const rawPayloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(rawPayload))
      .digest("hex")
      .slice(0, 16);

    return {
      platform: this.platform,
      periodStart,
      periodEnd,
      observed,
      derived,
      isSynthetic,
      syntheticLabel: isSynthetic ? "SYNTHETIC / DEMONSTRATION DATA" : null,
      dataSource,
      provenance: {
        adapter: "XMetricsAdapter",
        ingestedAt: new Date().toISOString(),
        rawPayloadHash,
        externalId: typeof p.externalId === "string" ? p.externalId : undefined,
      },
      metadata: (p.metadata as Record<string, unknown>) || {},
    };
  }
}

/**
 * LinkedIn Metrics Adapter
 */
export class LinkedInMetricsAdapter implements PlatformMetricsAdapter {
  readonly platform = "LINKEDIN" as const;

  validate(rawPayload: unknown): IngestionValidationResult {
    if (!rawPayload || typeof rawPayload !== "object") {
      return { valid: false, errors: ["Payload must be an object"] };
    }
    const p = rawPayload as Record<string, unknown>;
    const errors: string[] = [];

    errors.push(
      ...validateNonNegativeNumbers(p, [
        "impressions",
        "reactions",
        "comments",
        "reposts",
        "shares",
        "clicks",
        "conversions",
      ])
    );

    return { valid: errors.length === 0, errors };
  }

  normalize(
    rawPayload: unknown,
    isSynthetic = false,
    dataSource = "MANUAL_INGESTION"
  ): NormalizedMetricPayload {
    const p = rawPayload as Record<string, unknown>;
    const impressions = Math.max(0, Number(p.impressions || 0));
    const views = Math.max(0, Number(p.views || impressions));
    const likes = Math.max(0, Number(p.likes || p.reactions || 0));
    const comments = Math.max(0, Number(p.comments || 0));
    const shares = Math.max(0, Number(p.shares || p.reposts || 0));
    const engagements = Math.max(0, Number(p.engagements || likes + comments + shares));
    const clicks = Math.max(0, Number(p.clicks || 0));
    const watchTimeSeconds = Math.max(0, Number(p.watchTimeSeconds || 0));
    const conversions = Math.max(0, Number(p.conversions || 0));
    const subscribersGained = Math.max(0, Number(p.subscribersGained || p.followersGained || 0));

    const observed: Required<RawObservedMetrics> = {
      impressions,
      views,
      engagements,
      likes,
      comments,
      shares,
      clicks,
      watchTimeSeconds,
      conversions,
      subscribersGained,
    };

    const derived = calculateDerivedMetrics(observed);
    const periodStart = p.periodStart ? new Date(p.periodStart as string) : new Date(Date.now() - 86400000);
    const periodEnd = p.periodEnd ? new Date(p.periodEnd as string) : new Date();
    const rawPayloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(rawPayload))
      .digest("hex")
      .slice(0, 16);

    return {
      platform: this.platform,
      periodStart,
      periodEnd,
      observed,
      derived,
      isSynthetic,
      syntheticLabel: isSynthetic ? "SYNTHETIC / DEMONSTRATION DATA" : null,
      dataSource,
      provenance: {
        adapter: "LinkedInMetricsAdapter",
        ingestedAt: new Date().toISOString(),
        rawPayloadHash,
        externalId: typeof p.externalId === "string" ? p.externalId : undefined,
      },
      metadata: (p.metadata as Record<string, unknown>) || {},
    };
  }
}

/**
 * Newsletter Metrics Adapter
 */
export class NewsletterMetricsAdapter implements PlatformMetricsAdapter {
  readonly platform = "NEWSLETTER" as const;

  validate(rawPayload: unknown): IngestionValidationResult {
    if (!rawPayload || typeof rawPayload !== "object") {
      return { valid: false, errors: ["Payload must be an object"] };
    }
    const p = rawPayload as Record<string, unknown>;
    const errors: string[] = [];

    errors.push(
      ...validateNonNegativeNumbers(p, [
        "recipients",
        "opens",
        "clicks",
        "unsubscribes",
        "conversions",
      ])
    );

    return { valid: errors.length === 0, errors };
  }

  normalize(
    rawPayload: unknown,
    isSynthetic = false,
    dataSource = "MANUAL_INGESTION"
  ): NormalizedMetricPayload {
    const p = rawPayload as Record<string, unknown>;
    const impressions = Math.max(0, Number(p.impressions || p.recipients || 0));
    const views = Math.max(0, Number(p.views || p.opens || 0));
    const clicks = Math.max(0, Number(p.clicks || 0));
    const conversions = Math.max(0, Number(p.conversions || 0));
    const unsubscribes = Math.max(0, Number(p.unsubscribes || 0));
    const likes = Math.max(0, Number(p.likes || 0));
    const comments = Math.max(0, Number(p.comments || 0));
    const shares = Math.max(0, Number(p.shares || 0));
    const engagements = Math.max(0, Number(p.engagements || views + clicks));

    const observed: Required<RawObservedMetrics> = {
      impressions,
      views,
      engagements,
      likes,
      comments,
      shares,
      clicks,
      watchTimeSeconds: 0,
      conversions,
      subscribersGained: Math.max(0, Number(p.subscribersGained || 0)) - unsubscribes,
    };

    const derived = calculateDerivedMetrics(observed);
    const periodStart = p.periodStart ? new Date(p.periodStart as string) : new Date(Date.now() - 86400000);
    const periodEnd = p.periodEnd ? new Date(p.periodEnd as string) : new Date();
    const rawPayloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(rawPayload))
      .digest("hex")
      .slice(0, 16);

    return {
      platform: this.platform,
      periodStart,
      periodEnd,
      observed,
      derived,
      isSynthetic,
      syntheticLabel: isSynthetic ? "SYNTHETIC / DEMONSTRATION DATA" : null,
      dataSource,
      provenance: {
        adapter: "NewsletterMetricsAdapter",
        ingestedAt: new Date().toISOString(),
        rawPayloadHash,
        externalId: typeof p.externalId === "string" ? p.externalId : undefined,
      },
      metadata: (p.metadata as Record<string, unknown>) || {},
    };
  }
}

/**
 * Generic Platform Adapter
 */
export class GenericMetricsAdapter implements PlatformMetricsAdapter {
  readonly platform = "GENERIC" as const;

  validate(rawPayload: unknown): IngestionValidationResult {
    if (!rawPayload || typeof rawPayload !== "object") {
      return { valid: false, errors: ["Payload must be an object"] };
    }
    const p = rawPayload as Record<string, unknown>;
    const errors: string[] = [];

    errors.push(
      ...validateNonNegativeNumbers(p, [
        "impressions",
        "views",
        "engagements",
        "likes",
        "comments",
        "shares",
        "clicks",
        "watchTimeSeconds",
        "conversions",
        "subscribersGained",
      ])
    );

    return { valid: errors.length === 0, errors };
  }

  normalize(
    rawPayload: unknown,
    isSynthetic = false,
    dataSource = "MANUAL_INGESTION"
  ): NormalizedMetricPayload {
    const p = rawPayload as Record<string, unknown>;
    const impressions = Math.max(0, Number(p.impressions || 0));
    const views = Math.max(0, Number(p.views || 0));
    const engagements = Math.max(0, Number(p.engagements || 0));
    const likes = Math.max(0, Number(p.likes || 0));
    const comments = Math.max(0, Number(p.comments || 0));
    const shares = Math.max(0, Number(p.shares || 0));
    const clicks = Math.max(0, Number(p.clicks || 0));
    const watchTimeSeconds = Math.max(0, Number(p.watchTimeSeconds || 0));
    const conversions = Math.max(0, Number(p.conversions || 0));
    const subscribersGained = Math.max(0, Number(p.subscribersGained || 0));

    const observed: Required<RawObservedMetrics> = {
      impressions,
      views,
      engagements,
      likes,
      comments,
      shares,
      clicks,
      watchTimeSeconds,
      conversions,
      subscribersGained,
    };

    const derived = calculateDerivedMetrics(observed);
    const periodStart = p.periodStart ? new Date(p.periodStart as string) : new Date(Date.now() - 86400000);
    const periodEnd = p.periodEnd ? new Date(p.periodEnd as string) : new Date();
    const rawPayloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(rawPayload))
      .digest("hex")
      .slice(0, 16);

    return {
      platform: this.platform,
      periodStart,
      periodEnd,
      observed,
      derived,
      isSynthetic,
      syntheticLabel: isSynthetic ? "SYNTHETIC / DEMONSTRATION DATA" : null,
      dataSource,
      provenance: {
        adapter: "GenericMetricsAdapter",
        ingestedAt: new Date().toISOString(),
        rawPayloadHash,
        externalId: typeof p.externalId === "string" ? p.externalId : undefined,
      },
      metadata: (p.metadata as Record<string, unknown>) || {},
    };
  }
}

/**
 * Registry Factory for Platform Adapters
 */
export class PlatformAdapterRegistry {
  private static adapters: Record<string, PlatformMetricsAdapter> = {
    YOUTUBE: new YouTubeMetricsAdapter(),
    X: new XMetricsAdapter(),
    LINKEDIN: new LinkedInMetricsAdapter(),
    NEWSLETTER: new NewsletterMetricsAdapter(),
    GENERIC: new GenericMetricsAdapter(),
  };

  static getAdapter(platform: string): PlatformMetricsAdapter {
    const key = (platform || "").toUpperCase();
    return this.adapters[key] || this.adapters["GENERIC"];
  }
}

/**
 * Deterministic Idempotency Key Generator for Metric Ingestion
 * Prevents double-counting from duplicate imports or re-transmissions.
 */
export function generateMetricIdempotencyKey(params: {
  workspaceId: string;
  brandId: string;
  platform: string;
  contentAssetId?: string | null;
  campaignId?: string | null;
  periodStart: Date | string;
  periodEnd: Date | string;
  dataSource: string;
  externalId?: string;
}): string {
  const pStart = new Date(params.periodStart).toISOString().slice(0, 10);
  const pEnd = new Date(params.periodEnd).toISOString().slice(0, 10);
  const assetKey = params.contentAssetId || "none";
  const campaignKey = params.campaignId || "none";
  const extKey = params.externalId || "none";

  const rawKey = `${params.workspaceId}:${params.brandId}:${params.platform.toUpperCase()}:${assetKey}:${campaignKey}:${pStart}:${pEnd}:${params.dataSource}:${extKey}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}
