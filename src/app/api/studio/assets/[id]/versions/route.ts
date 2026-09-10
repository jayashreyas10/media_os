import { NextRequest, NextResponse } from "next/server";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const versions = await ContentStudioService.listVersions(params.id, session.workspace.id);
    return NextResponse.json({ versions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list versions" },
      { status: 500 }
    );
  }
}

