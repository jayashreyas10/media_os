import { NextResponse } from "next/server";
import { AuditService } from "@/server/services/audit-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const logs = await AuditService.listLogs(session.workspace.id);
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load audit logs" },
      { status: 500 }
    );
  }
}
