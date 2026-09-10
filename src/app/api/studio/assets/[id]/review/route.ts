import { NextRequest, NextResponse } from "next/server";
import { EditorialReviewerService } from "@/server/services/editorial-reviewer-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { versionId, reviewerType = "AI_EDITOR", verdict, summary, scores, findings } = body;

    // Human Editorial Review dispatch
    if (reviewerType === "HUMAN" || verdict) {
      const review = await EditorialReviewerService.performHumanReview({
        workspaceId: session.workspace.id,
        assetId: params.id,
        versionId,
        userId: session.user.email || session.user.id,
        verdict: verdict || "PASS",
        summary,
        scores,
        findings,
      });

      return NextResponse.json({ review, isHumanReview: true }, { status: 201 });
    }

    // AI Editorial Review
    const review = await EditorialReviewerService.runReview({
      workspaceId: session.workspace.id,
      assetId: params.id,
      versionId,
      reviewerType,
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === "AIDisabledError") {
      return NextResponse.json(
        {
          error: err.message,
          code: "AI_ASSISTANCE_DISABLED",
          manualAvailable: true,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run review" },
      { status: 400 }
    );
  }
}
