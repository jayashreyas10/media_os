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
    const { versionId, reviewerType = "AI_EDITOR" } = body;

    const review = await EditorialReviewerService.runReview({
      workspaceId: session.workspace.id,
      assetId: params.id,
      versionId,
      reviewerType,
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run review" },
      { status: 400 }
    );
  }
}
