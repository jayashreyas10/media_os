import { NextRequest, NextResponse } from "next/server";
import { StrategyRecommendationService } from "@/server/services/strategy-recommendation-service";
import { AuthService } from "@/server/services/auth-service";
import { AuthorizationGuard, AuthorizationError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recommendationId = params.id;
    const body = await req.json();
    const { action, reviewNotes, reviewerType, userId } = body;

    // Enforce that AI reviewer types cannot review recommendations
    if (reviewerType === "AI" || reviewerType === "AI_EDITOR" || reviewerType === "AI_SYSTEM") {
      return NextResponse.json(
        { error: "AI agents are strictly prohibited from reviewing strategy recommendations. Human approval required." },
        { status: 403 }
      );
    }

    // Require human operator and detect identity spoofing
    AuthorizationGuard.requireHumanOperator(session, userId || session.user.id);

    if (action !== "ACCEPT" && action !== "REJECT") {
      return NextResponse.json(
        { error: "action must be either 'ACCEPT' or 'REJECT'" },
        { status: 400 }
      );
    }

    const updated = await StrategyRecommendationService.reviewRecommendation(
      session.workspace.id,
      {
        recommendationId,
        action,
        reviewNotes,
        userId: session.user.id,
      }
    );

    return NextResponse.json({
      success: true,
      recommendation: updated,
      message: `Recommendation successfully ${action === "ACCEPT" ? "accepted" : "rejected"}`,
    });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to review recommendation" },
      { status: 400 }
    );
  }
}
