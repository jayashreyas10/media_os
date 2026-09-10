import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { SignalScoutService } from "@/server/services/signal-scout-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace || !session.brand) {
      return NextResponse.json({ error: "Unauthorized or brand missing" }, { status: 401 });
    }

    const body = await req.json();
    const { title, event, whyNow, suggestedAngle, opportunityScore } = body;

    if (!title || !whyNow || !suggestedAngle) {
      return NextResponse.json(
        { error: "title, whyNow, and suggestedAngle are required to promote signal" },
        { status: 400 }
      );
    }

    const campaign = await SignalScoutService.promoteSignalToCampaign(
      session.workspace.id,
      session.brand.id,
      {
        title,
        event: event || title,
        whyNow,
        suggestedAngle,
        opportunityScore: Number(opportunityScore) || 8,
      }
    );

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to promote signal" },
      { status: 500 }
    );
  }
}
