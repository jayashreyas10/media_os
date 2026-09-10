import { NextRequest, NextResponse } from "next/server";
import { RevisionLoopService } from "@/server/services/revision-loop-service";
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
    const { maxCycles, customInstructions } = body;

    const result = await RevisionLoopService.executeRevisionCycle({
      workspaceId: session.workspace.id,
      assetId: params.id,
      userId: session.user.id,
      maxCycles,
      customInstructions,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to execute revision cycle" },
      { status: 400 }
    );
  }
}
