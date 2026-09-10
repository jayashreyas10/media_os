import { NextRequest, NextResponse } from "next/server";
import { EditorialReviewerService } from "@/server/services/editorial-reviewer-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const assetId = searchParams.get("assetId") || undefined;
    const campaignId = searchParams.get("campaignId") || undefined;
    const status = searchParams.get("status") || undefined;
    const reviewerType = searchParams.get("reviewerType") || undefined;

    const reviews = await EditorialReviewerService.listReviews(session.workspace.id, {
      assetId,
      campaignId,
      status,
      reviewerType,
    });

    return NextResponse.json({ reviews });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list reviews" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { assetId, versionId, reviewerType = "AI_EDITOR" } = body;

    if (!assetId) {
      return NextResponse.json({ error: "assetId is required" }, { status: 400 });
    }

    const review = await EditorialReviewerService.runReview({
      workspaceId: session.workspace.id,
      assetId,
      versionId,
      reviewerType,
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && (err.name === "AIDisabledError" || err.message.includes("AI assistance is currently disabled"))) {
      return NextResponse.json(
        {
          error: err.message,
          code: "AI_ASSISTANCE_DISABLED",
          manualAvailable: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run editorial review" },
      { status: 400 }
    );
  }
}
