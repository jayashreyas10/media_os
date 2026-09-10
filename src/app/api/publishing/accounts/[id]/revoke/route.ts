import { NextRequest, NextResponse } from "next/server";
import { PublishingService } from "@/server/services/publishing-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace || !session.brand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const revoked = await PublishingService.revokeConnectedAccount({
      workspaceId: session.workspace.id,
      brandId: session.brand.id,
      accountId: params.id,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true, account: revoked });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke account" },
      { status: 400 }
    );
  }
}
