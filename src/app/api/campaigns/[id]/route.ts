import { NextRequest, NextResponse } from "next/server";
import { CampaignService } from "@/server/services/campaign-service";
import { AuthService } from "@/server/services/auth-service";
import { AuthorizationGuard, AuthorizationError } from "@/server/auth/authorization-guard";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await AuthorizationGuard.requireCampaignAccess(session, params.id);

    const campaign = await CampaignService.getCampaign(params.id, session.workspace.id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load campaign" },
      { status: 500 }
    );
  }
}
