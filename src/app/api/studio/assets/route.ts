import { NextRequest, NextResponse } from "next/server";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || undefined;
    const type = searchParams.get("type") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;

    const assets = await ContentStudioService.listAssets(session.workspace.id, {
      campaignId,
      type,
      status,
      search,
    });

    return NextResponse.json({ assets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list assets" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { campaignId, type, title, strategyId } = body;

    if (!campaignId || !type || !title) {
      return NextResponse.json(
        { error: "campaignId, type, and title are required" },
        { status: 400 }
      );
    }

    const asset = await ContentStudioService.createAsset({
      workspaceId: session.workspace.id,
      campaignId,
      type,
      title,
      strategyId,
      createdBy: session.user.email,
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create asset" },
      { status: 500 }
    );
  }
}

