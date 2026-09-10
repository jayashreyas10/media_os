import { NextRequest, NextResponse } from "next/server";
import { OAuthService } from "@/server/services/oauth-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { platform: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace || !session.brand) {
      return NextResponse.json({ error: "Unauthorized. Active brand required." }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const stateToken = searchParams.get("state");
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.json(
        { error: `OAuth authorization denied by user or provider: ${error}` },
        { status: 400 }
      );
    }

    if (!stateToken || !code) {
      return NextResponse.json(
        { error: "Missing state or code query parameter" },
        { status: 400 }
      );
    }

    const connectedAccount = await OAuthService.handleOAuthCallback({
      stateToken,
      code,
      workspaceId: session.workspace.id,
      brandId: session.brand.id,
      userId: session.user.id,
    });

    // If request has Accept: text/html, redirect to publishing console with success flag
    const acceptHeader = req.headers.get("accept") || "";
    if (acceptHeader.includes("text/html")) {
      const origin = req.nextUrl.origin || "http://localhost:3000";
      return NextResponse.redirect(`${origin}/publishing?connected=${connectedAccount.id}`);
    }

    return NextResponse.json({ success: true, account: connectedAccount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth callback processing failed" },
      { status: 400 }
    );
  }
}
