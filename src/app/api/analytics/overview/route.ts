import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/server/services/analytics-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const brandId = searchParams.get("brandId") || undefined;
    const timeframe = (searchParams.get("timeframe") as "7d" | "30d" | "90d" | "all") || "30d";

    const overview = await AnalyticsService.getWorkspaceOverview(
      session.workspace.id,
      brandId,
      timeframe
    );

    const targetBrandId = brandId || session.brand?.id;
    let formatAnalytics: unknown[] = [];
    let topBottomPerformers: { top: unknown[]; bottom: unknown[]; totalRankedAssets: number } = {
      top: [],
      bottom: [],
      totalRankedAssets: 0,
    };

    if (targetBrandId) {
      formatAnalytics = await AnalyticsService.getFormatAnalytics(
        session.workspace.id,
        targetBrandId
      );
      topBottomPerformers = await AnalyticsService.getTopAndBottomPerformers(
        session.workspace.id,
        targetBrandId
      );
    }

    return NextResponse.json({
      ...overview,
      formatAnalytics,
      topPerformers: topBottomPerformers.top,
      bottomPerformers: topBottomPerformers.bottom,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load analytics overview" },
      { status: 500 }
    );
  }
}
