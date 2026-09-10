import { NextRequest, NextResponse } from "next/server";
import { WriterService } from "@/server/services/writer-service";
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
    const { blocks, changeSummary } = body;

    if (!Array.isArray(blocks)) {
      return NextResponse.json({ error: "blocks array is required" }, { status: 400 });
    }

    const version = await WriterService.saveManualEdit({
      workspaceId: session.workspace.id,
      assetId: params.id,
      blocks,
      changeSummary: changeSummary || "Manual human edit",
      userId: session.user.email,
    });

    return NextResponse.json({ version }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save edits" },
      { status: 500 }
    );
  }
}

