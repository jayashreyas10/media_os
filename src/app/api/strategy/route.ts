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

    const strategy = await StrategistService.developStrategy(
      session.workspace.id,
      campaignId
    );

    return NextResponse.json({ strategy });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Strategist execution failed" },
      { status: 500 }
    );
  }
}
