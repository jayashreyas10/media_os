import { NextRequest, NextResponse } from "next/server";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const duplicated = await ContentStudioService.duplicateAsset(
      params.id,
      session.workspace.id,
      session.user.email
    );

    return NextResponse.json({ asset: duplicated }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to duplicate asset" },
      { status: 500 }
    );
  }
}

