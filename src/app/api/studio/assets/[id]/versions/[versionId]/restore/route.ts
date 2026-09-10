import { NextRequest, NextResponse } from "next/server";
import { WriterService } from "@/server/services/writer-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const restoredVersion = await WriterService.restoreVersion({
      workspaceId: session.workspace.id,
      assetId: params.id,
      versionId: params.versionId,
      userId: session.user.email,
    });

    return NextResponse.json({ version: restoredVersion }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to restore version" },
      { status: 500 }
    );
  }
}

