import { NextRequest, NextResponse } from "next/server";
import { ApprovalService } from "@/server/services/approval-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const approvals = await ApprovalService.listApprovalHistory(params.id, session.workspace.id);
    return NextResponse.json({ approvals });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list approvals" },
      { status: 500 }
    );
  }
}
