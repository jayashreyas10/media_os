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
    const { topic, useLiveFetcher } = body;

    const result = await SignalScoutService.scanSignals(
      session.workspace.id,
      session.brand?.id,
      { topic, useLiveFetcher: Boolean(useLiveFetcher) }
    );

    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signal Scout scan failed" },
      { status: 500 }
    );
  }
}
