import { NextRequest, NextResponse } from "next/server";
import { PublishingService } from "@/server/services/publishing-service";
import { AuthService } from "@/server/services/auth-service";
import { AuthorizationGuard, AuthorizationError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace || !session.brand) {
      return NextResponse.json({ error: "Unauthorized. Authentication is required to preview publish payload." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { versionId, connectedAccountId, platform } = body;

    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }
    if (!connectedAccountId) {
      return NextResponse.json({ error: "connectedAccountId is required" }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ error: "platform is required" }, { status: 400 });
    }

    const preview = await PublishingService.previewPublishPayload({
      workspaceId: session.workspace.id,
      brandId: session.brand.id,
      assetId: params.id,
      versionId,
      connectedAccountId,
      platform,
      userId: session.user.id,
    });

    return NextResponse.json(preview, { status: 200 });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preview publishing payload" },
      { status: 400 }
    );
  }
}
