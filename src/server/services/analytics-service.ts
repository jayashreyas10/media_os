import prisma from "../db/prisma";
import {
  PlatformAdapterRegistry,
  generateMetricIdempotencyKey,
  RawObservedMetrics,
} from "../analytics/platform-adapters";
import { AuditService } from "./audit-service";

export interface IngestMetricInput {
  platform: string;
  brandId: string;
  campaignId?: string | null;
  contentAssetId?: string | null;
  periodStart?: string | Date;
  periodEnd?: string | Date;
  isSynthetic?: boolean;
  dataSource?: string;
  externalId?: string;
  rawMetrics: RawObservedMetrics & {
    retentionRate?: number;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export class AnalyticsService {
  /**
   * Ingests a performance snapshot with platform validation, idempotency guard,
   * strict separation of raw vs derived metrics, and clear synthetic labeling.
   */
  static async ingestMetricSnapshot(
    workspaceId: string,
    input: IngestMetricInput,
    userId?: string
  ) {
    const brand = await prisma.brand.findUnique({
      where: { id: input.brandId },
    });

    if (!brand || brand.workspaceId !== workspaceId) {
      throw new Error("Brand not found in this workspace");
    }

    if (input.contentAssetId) {
      const asset = await prisma.contentAsset.findUnique({
        where: { id: input.contentAssetId },
      });
      if (!asset || asset.workspaceId !== workspaceId) {
        throw new Error("Content asset not found in this workspace");
      }
    }

    if (input.campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: input.campaignId },
      });
      if (!campaign || campaign.brandId !== input.brandId) {
        throw new Error("Campaign not found in this brand");
      }
    }

    const adapter = PlatformAdapterRegistry.getAdapter(input.platform);
    const validation = adapter.validate(input.rawMetrics);
    if (!validation.valid) {
      throw new Error(`Metric validation failed: ${validation.errors.join("; ")}`);
    }

    const isSynthetic = Boolean(input.isSynthetic);
    const dataSource = input.dataSource || (isSynthetic ? "SYNTHETIC_GENERATOR" : "MANUAL_INGESTION");

    const periodStart = input.periodStart ? new Date(input.periodStart) : new Date(Date.now() - 86400000);
    const periodEnd = input.periodEnd ? new Date(input.periodEnd) : new Date();

    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new Error("periodEnd cannot be earlier than periodStart");
    }

    // Idempotency check: deterministic key
    const idempotencyKey = generateMetricIdempotencyKey({
      workspaceId,
      brandId: input.brandId,
      platform: adapter.platform,
      contentAssetId: input.contentAssetId,
      campaignId: input.campaignId,
      periodStart,
      periodEnd,
      dataSource,
      externalId: input.externalId,
    });

    const existing = await prisma.metricSnapshot.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return {
        snapshot: existing,
        isDuplicate: true,
        message: "Metric snapshot already ingested (idempotent duplicate skipped)",
      };
    }

    const normalized = adapter.normalize(
      {
        ...input.rawMetrics,
        periodStart,
        periodEnd,
        externalId: input.externalId,
        metadata: input.metadata,
      },
      isSynthetic,
      dataSource
    );

    let snapshot;
    try {
      snapshot = await prisma.metricSnapshot.create({
        data: {
          workspaceId,
          brandId: input.brandId,
          campaignId: input.campaignId || null,
          contentAssetId: input.contentAssetId || null,
          idempotencyKey,
          platform: normalized.platform,
          periodStart: normalized.periodStart,
          periodEnd: normalized.periodEnd,
          snapshotDate: new Date(),

          // Observed raw metrics (immutable historical values)
          impressions: normalized.observed.impressions,
          views: normalized.observed.views,
          engagements: normalized.observed.engagements,
          likes: normalized.observed.likes,
          comments: normalized.observed.comments,
          shares: normalized.observed.shares,
          clicks: normalized.observed.clicks,
          watchTimeSeconds: normalized.observed.watchTimeSeconds,
          conversions: normalized.observed.conversions,
          subscribersGained: normalized.observed.subscribersGained,

          // Derived metrics (calculated separately, never overwriting raw values)
          ctr: normalized.derived.ctr,
          engagementRate: normalized.derived.engagementRate,
          avgViewDurationSeconds: normalized.derived.avgViewDurationSeconds,
          retentionRate: normalized.derived.retentionRate,
          conversionRate: normalized.derived.conversionRate,

          // Provenance & Synthetic Flagging
          isSynthetic: normalized.isSynthetic,
          syntheticLabel: normalized.syntheticLabel,
          dataSource: normalized.dataSource,
          metricProvenanceJson: JSON.stringify(normalized.provenance),
          metadataJson: JSON.stringify(input.metadata || {}),
        },
      });
    } catch (err: unknown) {
      // Graceful handling of concurrent duplicate ingestion (Prisma P2002 Unique Constraint Violation)
      const isUniqueConstraint =
        Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") ||
        (err instanceof Error && err.message.includes("Unique constraint"));

      if (isUniqueConstraint) {
        const concurrentExisting = await prisma.metricSnapshot.findUnique({
          where: { idempotencyKey },
        });
        if (concurrentExisting) {
          return {
            snapshot: concurrentExisting,
            isDuplicate: true,
            message: "Metric snapshot already ingested (concurrent duplicate handled)",
          };
        }
      }
      throw err;
    }

    await AuditService.log({
      workspaceId,
      userId: userId || null,
      action: "METRIC_SNAPSHOT_INGESTED",
      entityType: "MetricSnapshot",
      entityId: snapshot.id,
      details: {
        platform: snapshot.platform,
        isSynthetic: snapshot.isSynthetic,
        syntheticLabel: snapshot.syntheticLabel,
        idempotencyKey,
        views: snapshot.views,
        impressions: snapshot.impressions,
      },
    });

    return {
      snapshot,
      isDuplicate: false,
      message: "Metric snapshot successfully ingested",
    };
  }

  /**
   * Returns workspace-level performance overview, KPI totals, time-series data,
   * and synthetic data warning flags.
   */
  static async getWorkspaceOverview(
    workspaceId: string,
    brandId?: string,
    timeframe: "7d" | "30d" | "90d" | "all" = "30d"
  ) {
    const whereClause: Record<string, unknown> = { workspaceId };
    if (brandId) whereClause.brandId = brandId;

    if (timeframe !== "all") {
      const days = timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : 90;
      const cutoff = new Date(Date.now() - days * 86400000);
      whereClause.periodStart = { gte: cutoff };
    }

    const snapshots = await prisma.metricSnapshot.findMany({
      where: whereClause,
      include: {
        contentAsset: true,
        campaign: true,
      },
      orderBy: { periodStart: "asc" },
    });

    let totalImpressions = 0;
    let totalViews = 0;
    let totalEngagements = 0;
    let totalClicks = 0;
    let totalWatchTimeSeconds = 0;
    let totalConversions = 0;
    let totalSubscribersGained = 0;
    let hasSyntheticData = false;

    // Time-series daily aggregation
    const timelineMap: Record<
      string,
      {
        date: string;
        views: number;
        impressions: number;
        engagements: number;
        clicks: number;
      }
    > = {};

    for (const s of snapshots) {
      totalImpressions += s.impressions;
      totalViews += s.views;
      totalEngagements += s.engagements;
      totalClicks += s.clicks;
      totalWatchTimeSeconds += s.watchTimeSeconds;
      totalConversions += s.conversions;
      totalSubscribersGained += s.subscribersGained;
      if (s.isSynthetic) hasSyntheticData = true;

      const dayKey = s.periodStart.toISOString().slice(0, 10);
      if (!timelineMap[dayKey]) {
        timelineMap[dayKey] = {
          date: dayKey,
          views: 0,
          impressions: 0,
          engagements: 0,
          clicks: 0,
        };
      }
      timelineMap[dayKey].views += s.views;
      timelineMap[dayKey].impressions += s.impressions;
      timelineMap[dayKey].engagements += s.engagements;
      timelineMap[dayKey].clicks += s.clicks;
    }

    const avgCtr =
      totalImpressions > 0
        ? Number((totalClicks / totalImpressions).toFixed(4))
        : totalViews > 0
        ? Number((totalClicks / totalViews).toFixed(4))
        : 0;

    const avgEngagementRate =
      totalImpressions > 0
        ? Number((totalEngagements / totalImpressions).toFixed(4))
        : totalViews > 0
        ? Number((totalEngagements / totalViews).toFixed(4))
        : 0;

    const avgViewDurationSeconds =
      totalViews > 0
        ? Number((totalWatchTimeSeconds / totalViews).toFixed(2))
        : 0;

    const timeline = Object.values(timelineMap).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return {
      kpis: {
        totalImpressions,
        totalViews,
        totalEngagements,
        totalClicks,
        totalWatchTimeSeconds,
        totalConversions,
        totalSubscribersGained,
        avgCtr,
        avgEngagementRate,
        avgViewDurationSeconds,
        snapshotCount: snapshots.length,
      },
      hasSyntheticData,
      syntheticNotice: hasSyntheticData
        ? "INCLUDES SYNTHETIC / DEMONSTRATION DATA (clearly labelled for testing)"
        : null,
      timeline,
      snapshots,
    };
  }

  /**
   * Compares performance by content format across brand assets.
   */
  static async getFormatAnalytics(workspaceId: string, brandId: string) {
    const snapshots = await prisma.metricSnapshot.findMany({
      where: { workspaceId, brandId },
      include: { contentAsset: true },
    });

    const formatMap: Record<
      string,
      {
        format: string;
        assetCount: Set<string>;
        impressions: number;
        views: number;
        engagements: number;
        clicks: number;
        watchTimeSeconds: number;
      }
    > = {};

    const FORMATS = [
      "YOUTUBE_LONG_FORM",
      "YOUTUBE_SHORT",
      "NEWSLETTER",
      "X_THREAD",
      "LINKEDIN_POST",
      "GENERIC_SOCIAL",
    ];

    for (const fmt of FORMATS) {
      formatMap[fmt] = {
        format: fmt,
        assetCount: new Set(),
        impressions: 0,
        views: 0,
        engagements: 0,
        clicks: 0,
        watchTimeSeconds: 0,
      };
    }

    for (const s of snapshots) {
      const fmt = s.contentAsset?.type || "GENERIC_SOCIAL";
      if (!formatMap[fmt]) {
        formatMap[fmt] = {
          format: fmt,
          assetCount: new Set(),
          impressions: 0,
          views: 0,
          engagements: 0,
          clicks: 0,
          watchTimeSeconds: 0,
        };
      }
      if (s.contentAssetId) formatMap[fmt].assetCount.add(s.contentAssetId);
      formatMap[fmt].impressions += s.impressions;
      formatMap[fmt].views += s.views;
      formatMap[fmt].engagements += s.engagements;
      formatMap[fmt].clicks += s.clicks;
      formatMap[fmt].watchTimeSeconds += s.watchTimeSeconds;
    }

    return Object.values(formatMap).map((f) => {
      const impressions = f.impressions;
      const views = f.views;
      const engagements = f.engagements;
      const clicks = f.clicks;
      const ctr = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0;
      const engagementRate =
        impressions > 0
          ? Number((engagements / impressions).toFixed(4))
          : views > 0
          ? Number((engagements / views).toFixed(4))
          : 0;

      return {
        format: f.format,
        uniqueAssets: f.assetCount.size,
        impressions,
        views,
        engagements,
        clicks,
        watchTimeSeconds: f.watchTimeSeconds,
        ctr,
        engagementRate,
      };
    });
  }

  /**
   * Retrieves top and bottom performing content assets.
   */
  static async getTopAndBottomPerformers(
    workspaceId: string,
    brandId: string,
    limit = 5
  ) {
    const snapshots = await prisma.metricSnapshot.findMany({
      where: { workspaceId, brandId, contentAssetId: { not: null } },
      include: { contentAsset: true },
    });

    const assetMap: Record<
      string,
      {
        assetId: string;
        title: string;
        format: string;
        views: number;
        impressions: number;
        engagements: number;
        clicks: number;
        engagementRate: number;
        isSynthetic: boolean;
      }
    > = {};

    for (const s of snapshots) {
      if (!s.contentAssetId || !s.contentAsset) continue;
      if (!assetMap[s.contentAssetId]) {
        assetMap[s.contentAssetId] = {
          assetId: s.contentAssetId,
          title: s.contentAsset.title,
          format: s.contentAsset.type,
          views: 0,
          impressions: 0,
          engagements: 0,
          clicks: 0,
          engagementRate: 0,
          isSynthetic: s.isSynthetic,
        };
      }
      assetMap[s.contentAssetId].views += s.views;
      assetMap[s.contentAssetId].impressions += s.impressions;
      assetMap[s.contentAssetId].engagements += s.engagements;
      assetMap[s.contentAssetId].clicks += s.clicks;
      if (s.isSynthetic) assetMap[s.contentAssetId].isSynthetic = true;
    }

    const items = Object.values(assetMap).map((a) => {
      const engRate =
        a.impressions > 0
          ? Number((a.engagements / a.impressions).toFixed(4))
          : a.views > 0
          ? Number((a.engagements / a.views).toFixed(4))
          : 0;
      return { ...a, engagementRate: engRate };
    });

    const sorted = items.sort((a, b) => b.views + b.engagements - (a.views + a.engagements));
    const top = sorted.slice(0, limit);
    const bottom = sorted.length > limit ? sorted.slice(-limit).reverse() : [];

    return { top, bottom, totalRankedAssets: sorted.length };
  }

  /**
   * Retrieves campaign performance analytics.
   */
  static async getCampaignAnalytics(workspaceId: string, campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        brand: true,
        contentAssets: true,
        metricSnapshots: {
          include: { contentAsset: true },
        },
      },
    });

    if (!campaign || campaign.brand.workspaceId !== workspaceId) {
      throw new Error("Campaign not found in workspace");
    }

    let totalViews = 0;
    let totalImpressions = 0;
    let totalEngagements = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let hasSyntheticData = false;

    for (const s of campaign.metricSnapshots) {
      totalViews += s.views;
      totalImpressions += s.impressions;
      totalEngagements += s.engagements;
      totalClicks += s.clicks;
      totalConversions += s.conversions;
      if (s.isSynthetic) hasSyntheticData = true;
    }

    return {
      campaign: {
        id: campaign.id,
        title: campaign.title,
        stage: campaign.stage,
        brandId: campaign.brandId,
      },
      metrics: {
        totalViews,
        totalImpressions,
        totalEngagements,
        totalClicks,
        totalConversions,
        ctr: totalImpressions > 0 ? Number((totalClicks / totalImpressions).toFixed(4)) : 0,
        engagementRate:
          totalImpressions > 0 ? Number((totalEngagements / totalImpressions).toFixed(4)) : 0,
      },
      hasSyntheticData,
      snapshots: campaign.metricSnapshots,
    };
  }
}
