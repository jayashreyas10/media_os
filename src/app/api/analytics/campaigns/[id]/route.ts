import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/server/services/analytics-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const analytics = await AnalyticsService.getCampaignAnalytics(
      session.workspace.id,
      campaignId
    );

    return NextResponse.json(analytics);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load campaign analytics" },
      { status: 500 }
    );
  }
}
