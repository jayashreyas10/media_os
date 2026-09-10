import { NextRequest, NextResponse } from "next/server";
import { CampaignService } from "@/server/services/campaign-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.brand) {
      return NextResponse.json({ error: "Unauthorized or no brand selected" }, { status: 401 });
    }

    const brandId = req.nextUrl.searchParams.get("brandId") || session.brand.id;
    const campaigns = await CampaignService.listCampaigns(brandId, session.workspace.id);
    return NextResponse.json({ campaigns });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.brand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, brief, priority, targetDate } = body;

    if (!title) {
      return NextResponse.json({ error: "Campaign title is required" }, { status: 400 });
    }

    const campaign = await CampaignService.createCampaign({
      brandId: session.brand.id,
      title,
      brief,
      priority: priority || "MEDIUM",
      targetDate: targetDate ? new Date(targetDate) : undefined,
      userId: session.user.id,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create campaign" },
      { status: 400 }
    );
  }
}
