import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { ProviderFactory } from "@/server/ai/provider-factory";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    const workspaceId = session?.workspace?.id;
    const status = await ProviderFactory.getAIStatus(workspaceId);

    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      {
        mode: "MOCK",
        label: "Mock / Demo Mode",
        provider: "mock",
        manualAvailable: true,
      },
      { status: 200 }
    );
  }
}
