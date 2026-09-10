import { NextRequest, NextResponse } from "next/server";
import { PublishingService } from "@/server/services/publishing-service";
import { AuthService } from "@/server/services/auth-service";
import { AuthorizationGuard, AuthorizationError, RateLimitError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace || !session.brand) {
      return NextResponse.json({ error: "Unauthorized. Authentication is required to publish content." }, { status: 401 });
    }

    // Tenant-scoped rate limit for publishing actions
    await AuthorizationGuard.checkRateLimit(session, "PUBLISHING");

    const body = await req.json().catch(() => ({}));
    const { versionId, connectedAccountId, platform, isAI, reviewerType } = body;

    // Hard server barrier against AI directly publishing
    if (isAI || reviewerType === "AI_EDITOR" || (typeof reviewerType === "string" && reviewerType.startsWith("AI"))) {
      return NextResponse.json(
        {
          error: "AI agents are strictly prohibited from publishing. Only authenticated human operators can trigger external publication.",
        },
        { status: 403 }
      );
    }

    // Verify human operator identity
    AuthorizationGuard.requireHumanOperator(session);

    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }
    if (!connectedAccountId) {
      return NextResponse.json({ error: "connectedAccountId is required" }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ error: "platform is required" }, { status: 400 });
    }

    const result = await PublishingService.publishAsset({
      workspaceId: session.workspace.id,
      brandId: session.brand.id,
      assetId: params.id,
      versionId,
      connectedAccountId,
      platform,
      userId: session.user.id,
      isAI: false,
    });

    return NextResponse.json(result, { status: result.isDuplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, code: err.code, retryAfter: err.retryAfterSeconds },
        {
          status: 429,
          headers: { "Retry-After": err.retryAfterSeconds.toString() },
        }
      );
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publishing failed" },
      { status: 400 }
    );
  }
}
