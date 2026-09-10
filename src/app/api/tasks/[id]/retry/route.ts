import { NextRequest, NextResponse } from "next/server";
import { TaskEngine } from "@/server/services/task-engine";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const task = await TaskEngine.executeTask(params.id, session.workspace.id);
    return NextResponse.json({ task });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to retry task" },
      { status: err instanceof Error && err.message.includes("not found") ? 404 : 500 }
    );
  }
}
