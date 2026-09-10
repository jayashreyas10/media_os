import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { StrategistService } from "@/server/services/strategist-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { campaignId } = body;

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    // Manual Strategy Construction
    if (body.isManual || body.action === "manual" || body.thesis || body.primaryHeadline) {
      const strategy = await StrategistService.createManualStrategy(
        session.workspace.id,
        campaignId,
        {
          primaryHeadline: body.primaryHeadline,
          thesis: body.thesis,
          centralTension: body.centralTension,
          targetReader: body.targetReader,
          desiredOutcome: body.desiredOutcome,
          flagshipFormat: body.flagshipFormat,
          contentPillars: body.contentPillars,
          distributionEntryPoints: body.distributionEntryPoints,
          keySections: body.keySections,
          cadence: body.cadence,
          hooks: body.hooks,
          ctas: body.ctas,
          successMetrics: body.successMetrics,
          constraints: body.constraints,
          notes: body.notes,
        },
        session.user.id
      );

      return NextResponse.json({ strategy, isManual: true }, { status: 201 });
    }

    // AI-Assisted Strategy Formulation
    const strategy = await StrategistService.developStrategy(
      session.workspace.id,
      campaignId
    );

    return NextResponse.json({ strategy });
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
      (err.message.includes("is required") || err.message.includes("not found"));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Strategist execution failed" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
