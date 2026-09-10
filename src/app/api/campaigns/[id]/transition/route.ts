import { NextRequest, NextResponse } from "next/server";
import { CampaignService } from "@/server/services/campaign-service";
import { AuthService } from "@/server/services/auth-service";
import { CampaignStage, InvalidStageTransitionError } from "@/server/domain/campaign-state-machine";
import { AuthorizationGuard, AuthorizationError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await AuthorizationGuard.requireCampaignAccess(session, params.id);

    const body = await req.json();
    const { targetStage, reason } = body;

    if (!targetStage) {
      return NextResponse.json({ error: "targetStage is required" }, { status: 400 });
    }

    const updated = await CampaignService.transitionStage(
      params.id,
      targetStage as CampaignStage,
      reason,
      session.user.id,
      session.workspace.id
    );

    return NextResponse.json({
      success: true,
      campaign: updated,
      message: `Successfully transitioned to ${targetStage}`,
    });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof InvalidStageTransitionError) {
      return NextResponse.json(
        {
          error: err.message,
          fromStage: err.fromStage,
          toStage: err.toStage,
          code: "INVALID_STAGE_TRANSITION",
        },
        { status: 422 }
      );
    }
    if (err instanceof Error && err.message.includes("not found")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transition failed" },
      { status: 400 }
    );
  }
}
