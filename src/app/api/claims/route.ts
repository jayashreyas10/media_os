import { NextRequest, NextResponse } from "next/server";
import { EvidenceGraphService } from "@/server/services/evidence-graph-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = req.nextUrl.searchParams.get("campaignId") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;

    const claims = await EvidenceGraphService.listClaims(session.workspace.id, {
      campaignId,
      verificationStatus: status,
    });

    return NextResponse.json({ claims });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load claims" },
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

    const body = await req.json();
    const {
      claimText,
      campaignId,
      primarySourceId,
      confidence,
      isFact,
    } = body;

    if (!claimText) {
      return NextResponse.json({ error: "claimText is required" }, { status: 400 });
    }

    const claim = await EvidenceGraphService.createClaim({
      workspaceId: session.workspace.id,
      campaignId: campaignId || undefined,
      primarySourceId: primarySourceId || undefined,
      claimText,
      confidence: confidence ? Number(confidence) : 90,
      isFact: isFact !== false,
      verificationStatus: "UNVERIFIED",
    });

    return NextResponse.json({ claim }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create claim" },
      { status: 400 }
    );
  }
}
