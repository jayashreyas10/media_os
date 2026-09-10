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

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const brandId = body.brandId || session.brand?.id;
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    const recommendation = await StrategyRecommendationService.createManualRecommendation(
      session.workspace.id,
      {
        brandId,
        title: body.title,
        recommendation: body.recommendation,
        actionType: body.actionType,
        targetFormat: body.targetFormat,
        targetPillar: body.targetPillar,
        rationale: body.rationale,
        learningId: body.learningId,
      },
      session.user.id
    );

    return NextResponse.json({ recommendation, isManual: true }, { status: 201 });
  } catch (err) {
    const isValidation =
      err instanceof Error &&
      (err.message.includes("is required") || err.message.includes("not found"));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create recommendation" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
