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

    const asset = await ContentStudioService.getAsset(params.id, session.workspace.id);
    return NextResponse.json({ asset });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get asset" },
      { status: err instanceof Error && err.message.includes("not found") ? 404 : 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const updated = await ContentStudioService.updateAssetStatus(
      params.id,
      status,
      session.workspace.id,
      session.user.id
    );

    return NextResponse.json({ asset: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update status" },
      { status: 400 }
    );
  }
}

