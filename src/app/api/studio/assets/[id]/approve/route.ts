import { NextRequest, NextResponse } from "next/server";
import { ApprovalService } from "@/server/services/approval-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized. Authentication is required to approve content." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { versionId, comment, isAI, reviewerType } = body;

    // Hard check against AI attempts
    if (isAI || reviewerType === "AI_EDITOR" || (typeof reviewerType === "string" && reviewerType.startsWith("AI"))) {
      return NextResponse.json(
        {
          error:
            "AI agents are strictly prohibited from granting approval. Only authenticated human operators may approve content assets.",
        },
        { status: 403 }
      );
    }

    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    if (!comment || comment.trim().length === 0) {
      return NextResponse.json(
        { error: "A comment is mandatory when granting human approval." },
        { status: 400 }
      );
    }

    const result = await ApprovalService.approveVersion({
      workspaceId: session.workspace.id,
      assetId: params.id,
      versionId,
      userId: session.user.id,
      comment,
      isAI: false,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to approve version" },
      { status: 400 }
    );
  }
}
