import { NextRequest, NextResponse } from "next/server";
import { EditorialReviewerService } from "@/server/services/editorial-reviewer-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { assetId, versionId, verdict, summary, scores, findings } = body;

    if (!assetId || !verdict) {
      return NextResponse.json(
        { error: "assetId and verdict (PASS, REQUEST_REVISION, FAIL) are required" },
        { status: 400 }
      );
    }

    const review = await EditorialReviewerService.performHumanReview({
      workspaceId: session.workspace.id,
      assetId,
      versionId,
      userId: session.user.email || session.user.id,
      verdict,
      summary,
      scores,
      findings,
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Human editorial review failed" },
      { status: 400 }
    );
  }
}
