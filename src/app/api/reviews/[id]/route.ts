import { NextRequest, NextResponse } from "next/server";
import { EditorialReviewerService } from "@/server/services/editorial-reviewer-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const review = await EditorialReviewerService.getReview(params.id, session.workspace.id);
    return NextResponse.json({ review });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get review" },
      { status: err instanceof Error && err.message.includes("not found") ? 404 : 500 }
    );
  }
}
