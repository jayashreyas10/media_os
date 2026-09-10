import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { RateLimiter } from "@/server/security/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }
    return NextResponse.json({ authenticated: true, ...session }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch session" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action");

  try {
    const body = await req.json().catch(() => ({}));

    if (action === "register" || action === "login") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
      const rateKey = body.email ? `auth:${body.email.toLowerCase()}:${ip}` : `auth:${ip}`;
      const rateLimitResult = RateLimiter.consume(rateKey, "AUTH");

      if (!rateLimitResult.allowed) {
        return RateLimiter.createResponse(rateLimitResult, "Too many authentication attempts. Please try again later.");
      }
    }

    if (action === "register") {
      const { email, password, name } = body;
      if (!email || !password || !name) {
        return NextResponse.json(
          { error: "Email, password, and name are required." },
          { status: 400 }
        );
      }
      const user = await AuthService.register(email, password, name);
      // Auto login after registration
      await AuthService.login(email, password);
      return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    }

    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
      }
      const user = await AuthService.login(email, password);
      return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    }

    if (action === "logout") {
      await AuthService.logout();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action parameter" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Authentication error" },
      { status: 400 }
    );
  }
}
