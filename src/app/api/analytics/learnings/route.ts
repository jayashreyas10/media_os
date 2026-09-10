import { NextRequest, NextResponse } from "next/server";
import { LearningEngineService } from "@/server/services/learning-engine-service";
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

    const learnings = await LearningEngineService.listLearnings(
      session.workspace.id,
      brandId
    );

    return NextResponse.json({ learnings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list learnings" },
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

    const body = await req.json().catch(() => ({}));
    const brandId = body.brandId || session.brand?.id;
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    const result = await LearningEngineService.analyzeHistoricalPerformance(
      session.workspace.id,
      brandId,
      {
        campaignId: body.campaignId,
        hasStatisticalTestProof: body.hasStatisticalTestProof,
      },
      session.user.id
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run learning analysis" },
      { status: 500 }
    );
  }
}
