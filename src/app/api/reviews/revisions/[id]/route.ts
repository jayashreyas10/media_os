import { NextRequest, NextResponse } from "next/server";
import { RevisionLoopService } from "@/server/services/revision-loop-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { status, notes } = body;

    if (!status || !["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status (OPEN, IN_PROGRESS, RESOLVED, DISMISSED) is required" },
        { status: 400 }
      );
    }

    const updated = await RevisionLoopService.updateRevisionRequestStatus({
      workspaceId: session.workspace.id,
      revisionRequestId: params.id,
      status,
      userId: session.user.email || session.user.id,
      notes,
    });

    return NextResponse.json({ revisionRequest: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update revision request" },
      { status: 400 }
    );
  }
}
