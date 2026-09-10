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
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { versionId, reason, instructions } = body;

    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const result = await ApprovalService.rejectVersion({
      workspaceId: session.workspace.id,
      assetId: params.id,
      versionId,
      userId: session.user.id,
      reason,
      instructions,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reject version" },
      { status: 400 }
    );
  }
}
