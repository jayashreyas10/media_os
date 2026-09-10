import { NextRequest, NextResponse } from "next/server";
import { WriterService } from "@/server/services/writer-service";
import { AuthService } from "@/server/services/auth-service";
import { AuthorizationGuard, RateLimitError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Rate limit generation per workspace
    await AuthorizationGuard.checkRateLimit(session, "GENERATION");

    const body = await req.json().catch(() => ({}));
    const { mode, targetSection, instructions } = body;

    const version = await WriterService.generateContent({
      workspaceId: session.workspace.id,
      assetId: params.id,
      mode: mode || "GENERATE",
      targetSection,
      instructions,
      userId: session.user.email,
    });

    return NextResponse.json({ version }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.name === "AIDisabledError") {
      return NextResponse.json(
        {
          error: err.message,
          code: "AI_ASSISTANCE_DISABLED",
          manualAvailable: true,
        },
        { status: 400 }
      );
    }

    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, code: err.code, retryAfter: err.retryAfterSeconds },
        {
          status: 429,
          headers: { "Retry-After": err.retryAfterSeconds.toString() },
        }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}

