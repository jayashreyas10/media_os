import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { ResearcherService } from "@/server/services/researcher-service";
import { EvidenceGraphService } from "@/server/services/evidence-graph-service";
import { AuthorizationGuard, RateLimitError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Manual Research Bundle creation workflow
    if (body.isManual || body.action === "manual" || (body.source && body.claim)) {
      const bundle = await EvidenceGraphService.addManualResearchBundle(
        session.workspace.id,
        {
          campaignId: body.campaignId,
          source: body.source,
          claim: body.claim,
          evidence: body.evidence,
        },
        session.user.id
      );

      return NextResponse.json({ bundle, isManual: true }, { status: 201 });
    }

    // Rate limit research calls per workspace
    await AuthorizationGuard.checkRateLimit(session, "RESEARCH");

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

    const isValidation =
      err instanceof Error &&
      (err.message.includes("Unsafe URL") ||
        err.message.includes("Invalid protocol") ||
        err.message.includes("Malformed URL") ||
        err.message.includes("required"));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Researcher execution failed" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
