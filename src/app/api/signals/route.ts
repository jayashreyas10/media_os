import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { SignalScoutService } from "@/server/services/signal-scout-service";
import { KnowledgeBaseService } from "@/server/services/knowledge-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Retrieve saved signal records from knowledge base
    const savedSignals = await KnowledgeBaseService.listItems(session.workspace.id, {
      tag: "signal",
      limit: 20,
    });

    return NextResponse.json({ signals: savedSignals });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch signals" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Manual Signal Creation workflow
    if (body.isManual || body.action === "manual" || body.description) {
      const signal = await SignalScoutService.addManualSignal(
        session.workspace.id,
        body.brandId || session.brand?.id,
        {
          title: body.title,
          description: body.description || body.event || "",
          source: body.source,
          sourceUrl: body.sourceUrl,
          observedAt: body.observedAt,
          topic: body.topic,
          relevance: body.relevance ?? body.opportunityScore,
          notes: body.notes,
          evidence: body.evidence,
          campaignId: body.campaignId,
        },
        session.user.id
      );

      return NextResponse.json({ signal, isManual: true }, { status: 201 });
    }

    // AI-Assisted Signal Scout Scan
    const { topic, useLiveFetcher } = body;

    const result = await SignalScoutService.scanSignals(
      session.workspace.id,
      session.brand?.id,
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

    const isValidation =
      err instanceof Error &&
      (err.message.includes("Unsafe URL") ||
        err.message.includes("Invalid protocol") ||
        err.message.includes("Malformed URL") ||
        err.message.includes("title is required"));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signal Scout failed" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
