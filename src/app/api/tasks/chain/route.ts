import { NextRequest, NextResponse } from "next/server";
import { TaskEngine } from "@/server/services/task-engine";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { campaignId, chainSteps } = body;

    // Default 3-step chain if not provided
    const steps = chainSteps || [
      {
        taskType: "SIGNAL_SCOUT",
        agentName: "Signal Scout",
        inputData: { focus: "Industry trends scan" },
      },
      {
        taskType: "RESEARCHER",
        agentName: "Evidence Researcher",
        inputData: { depth: "Fact verification" },
      },
      {
        taskType: "STRATEGIST",
        agentName: "Content Strategist",
        inputData: { objective: "Flagship thesis" },
      },
    ];

    const tasks = await TaskEngine.createChain(
      session.workspace.id,
      campaignId || null,
      steps
    );

    return NextResponse.json({
      success: true,
      chainLength: tasks.length,
      tasks,
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "AIDisabledError" || err.message.includes("AI assistance is currently disabled"))) {
      return NextResponse.json(
        {
          error: err.message,
          code: "AI_ASSISTANCE_DISABLED",
          manualAvailable: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create task chain" },
      { status: 500 }
    );
  }
}
