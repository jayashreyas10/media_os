import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/server/services/analytics-service";
import { AuthService } from "@/server/services/auth-service";
import { AuthorizationGuard, RateLimitError } from "@/server/auth/authorization-guard";
import prisma from "@/server/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const brandId = searchParams.get("brandId") || undefined;
    const campaignId = searchParams.get("campaignId") || undefined;
    const contentAssetId = searchParams.get("contentAssetId") || undefined;

    const where: Record<string, unknown> = { workspaceId: session.workspace.id };
    if (brandId) where.brandId = brandId;
    if (campaignId) where.campaignId = campaignId;
    if (contentAssetId) where.contentAssetId = contentAssetId;

    const snapshots = await prisma.metricSnapshot.findMany({
      where,
      include: {
        contentAsset: true,
        campaign: true,
      },
      orderBy: { periodStart: "desc" },
      take: 100,
    });

    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list snapshots" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Multi-tenant rate limiting on metric ingestion
    await AuthorizationGuard.checkRateLimit(session, "METRICS_INGESTION");

    const body = await req.json();
    const {
      platform,
      brandId,
      campaignId,
      contentAssetId,
      periodStart,
      periodEnd,
      isSynthetic,
      dataSource,
      externalId,
      rawMetrics,
      metadata,
    } = body;

    const resolvedBrandId = brandId || session.brand?.id;
    if (!resolvedBrandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ error: "platform is required" }, { status: 400 });
    }
    if (!rawMetrics || typeof rawMetrics !== "object") {
      return NextResponse.json({ error: "rawMetrics object is required" }, { status: 400 });
    }

    const result = await AnalyticsService.ingestMetricSnapshot(
      session.workspace.id,
      {
        platform,
        brandId: resolvedBrandId,
        campaignId,
        contentAssetId,
        periodStart,
        periodEnd,
        isSynthetic,
        dataSource,
        externalId,
        rawMetrics,
        metadata,
      },
      session.user.id
    );

    return NextResponse.json(result, { status: result.isDuplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, code: err.code, retryAfter: err.retryAfterSeconds },
        {
          status: 429,
          headers: { "Retry-After": err.retryAfterSeconds.toString() },
        }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to ingest metric snapshot" },
      { status: 400 }
    );
  }
}
