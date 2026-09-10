import { NextRequest, NextResponse } from "next/server";
import { StrategyRecommendationService } from "@/server/services/strategy-recommendation-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const brandId = searchParams.get("brandId") || session.brand?.id;
    const status = (searchParams.get("status") as "PENDING" | "ACCEPTED" | "REJECTED" | "ALL") || "ALL";

    const recommendations = await StrategyRecommendationService.listRecommendations(
      session.workspace.id,
      brandId,
      status
    );

    return NextResponse.json({ recommendations });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list recommendations" },
      { status: 500 }
    );
  }
}
