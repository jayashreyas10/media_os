import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { ResearcherService } from "@/server/services/researcher-service";
import { AuthorizationGuard, RateLimitError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit research calls per workspace
    await AuthorizationGuard.checkRateLimit(session, "RESEARCH");

    const body = await req.json();
    const { campaignId, topic, useLiveFetcher } = body;

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    const result = await ResearcherService.runResearch(
      session.workspace.id,
      campaignId,
      { topic, useLiveFetcher: Boolean(useLiveFetcher) }
    );

    return NextResponse.json({ result });
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Researcher execution failed" },
      { status: 500 }
    );
  }
}
