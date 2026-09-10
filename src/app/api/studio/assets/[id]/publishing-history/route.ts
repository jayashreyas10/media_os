import { NextRequest, NextResponse } from "next/server";
import { PublishingService } from "@/server/services/publishing-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const history = await PublishingService.listPublishingHistory(
      params.id,
      session.workspace.id
    );

    return NextResponse.json({ history });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load publishing history" },
      { status: 500 }
    );
  }
}
