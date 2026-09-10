import { NextRequest, NextResponse } from "next/server";
import { EvidenceGraphService } from "@/server/services/evidence-graph-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { sourceId, quoteSnippet, context, pageOrTimestamp, verificationMethod, supportStance } = body;

    if (!sourceId || !quoteSnippet) {
      return NextResponse.json(
        { error: "sourceId and quoteSnippet are required" },
        { status: 400 }
      );
    }

    const evidence = await EvidenceGraphService.attachEvidence(
      {
        claimId: params.id,
        sourceId,
        quoteSnippet,
        context,
        pageOrTimestamp,
        supportStance,
        verificationMethod: verificationMethod || "PRIMARY_SOURCE",
      },
      session.workspace.id
    );

    return NextResponse.json({ evidence }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to attach evidence" },
      { status: 500 }
    );
  }
}
