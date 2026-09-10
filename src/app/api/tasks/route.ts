import { NextRequest, NextResponse } from "next/server";
import prisma from "@/server/db/prisma";
import { TaskEngine } from "@/server/services/task-engine";
import { AuthService } from "@/server/services/auth-service";
import { AgentType } from "@/server/ai/provider-interface";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = req.nextUrl.searchParams.get("campaignId");
    const status = req.nextUrl.searchParams.get("status");
    const includeAllWorkspaces = req.nextUrl.searchParams.get("includeAllWorkspaces") === "true";

    const tasks = await prisma.task.findMany({
      where: {
        ...(includeAllWorkspaces ? {} : { workspaceId: session.workspace.id }),
        ...(campaignId ? { campaignId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        attempts: true,
        agentRuns: true,
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        campaign: {
          select: {
            id: true,
            title: true,
            stage: true,
          },
        },
      },
    });

    return NextResponse.json({ tasks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tasks" },
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
      taskType,
      agentName,
      campaignId,
      inputData = {},
      autoExecute = true,
      idempotencyKey,
    } = body;

    if (!taskType) {
      return NextResponse.json({ error: "taskType is required" }, { status: 400 });
    }

    const friendlyAgentName =
      agentName ||
      {
        SIGNAL_SCOUT: "Signal Scout",
        RESEARCHER: "Evidence Researcher",
        STRATEGIST: "Content Strategist",
        WRITER: "Long-form Writer",
        DISTRIBUTION: "Distribution Agent",
        EDITOR: "Editorial Reviewer",
        LEARNING_ENGINE: "Learning Engine",
      }[taskType as AgentType] ||
      taskType;

    // Queue task with idempotency check
    const task = await TaskEngine.queueTask({
      workspaceId: session.workspace.id,
      campaignId,
      taskType: taskType as AgentType,
      agentName: friendlyAgentName,
      inputData,
      idempotencyKey,
    });

    // If autoExecute is true, execute immediately
    if (autoExecute && task.status === "QUEUED") {
      const executed = await TaskEngine.executeTask(task.id);
      return NextResponse.json({ task: executed });
    }

    return NextResponse.json({ task });
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
      { error: err instanceof Error ? err.message : "Failed to queue task" },
      { status: 400 }
    );
  }
}
