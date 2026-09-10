import { NextRequest, NextResponse } from "next/server";
import { PublishingService } from "@/server/services/publishing-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandId = session.brand?.id;
    if (!brandId) {
      return NextResponse.json({ accounts: [] });
    }

    const accounts = await PublishingService.listConnectedAccounts(
      session.workspace.id,
      brandId
    );

    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list connected accounts" },
      { status: 500 }
    );
  }
}
