import { NextRequest, NextResponse } from "next/server";
import { OAuthService, SupportedPlatform, SUPPORTED_PLATFORMS } from "@/server/services/oauth-service";
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

    const platformUpper = params.platform.toUpperCase();
    if (!SUPPORTED_PLATFORMS.includes(platformUpper as SupportedPlatform)) {
      return NextResponse.json(
        { error: `Unsupported platform: "${params.platform}". Allowed: ${SUPPORTED_PLATFORMS.join(", ")}` },
        { status: 400 }
      );
    }

    const configuredBaseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    let origin = configuredBaseUrl;

    if (!origin) {
      const forwardedProto = req.headers.get("x-forwarded-proto") || "http";
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      if (host) {
        origin = `${forwardedProto}://${host}`;
      } else {
        origin = req.nextUrl.origin || "http://localhost:3000";
      }
    }

    // In production, enforce production-domain redirect URI
    if (process.env.NODE_ENV === "production" && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
      if (configuredBaseUrl) {
        origin = configuredBaseUrl;
      }
    }

    const redirectUri = `${origin.replace(/\/$/, "")}/api/oauth/${params.platform.toLowerCase()}/callback`;

    const result = await OAuthService.initiateOAuth({
      workspaceId: session.workspace.id,
      brandId: session.brand.id,
      userId: session.user.id,
      platform: platformUpper as SupportedPlatform,
      redirectUri,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate OAuth" },
      { status: 500 }
    );
  }
}
