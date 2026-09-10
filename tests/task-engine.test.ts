import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../src/server/db/prisma";
import { TaskEngine } from "../src/server/services/task-engine";

describe("Task Engine & Idempotency", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.findFirst();
    if (ws) {
      workspaceId = ws.id;
    } else {
      const u = await prisma.user.create({
        data: {
          email: "test@mediaos.local",
          name: "Test User",
          passwordHash: "dummy",
        },
      });
      const newWs = await prisma.workspace.create({
        data: {
          name: "Test Workspace",
          slug: `test-ws-${Date.now()}`,
          ownerId: u.id,
        },
      });
      workspaceId = newWs.id;
    }
  });

  it("queues and executes a task in Mock AI mode with attempt and agent run records", async () => {
    const task = await TaskEngine.queueTask({
      workspaceId,
      taskType: "SIGNAL_SCOUT",
      agentName: "Signal Scout",
      inputData: { focus: "Automated test focus" },
    });

    expect(task).toBeDefined();
    expect(task.status).toBe("QUEUED");

    const executed = await TaskEngine.executeTask(task.id);
    expect(executed).toBeDefined();
    expect(executed!.status).toBe("COMPLETED");
    expect(executed!.outputJson).toBeDefined();

    const attempts = await prisma.taskAttempt.findMany({
      where: { taskId: task.id },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0].status).toBe("SUCCESS");

    const agentRuns = await prisma.agentRun.findMany({
      where: { taskId: task.id },
    });
    expect(agentRuns.length).toBe(1);
    expect(agentRuns[0].provider).toBe("mock");
  });

  it("enforces idempotency to prevent duplicate task generation", async () => {
    const key = `idem_${Date.now()}_test`;

    const task1 = await TaskEngine.queueTask({
      workspaceId,
      taskType: "WRITER",
      agentName: "Lead Writer",
      idempotencyKey: key,
    });

    const task2 = await TaskEngine.queueTask({
      workspaceId,
      taskType: "WRITER",
      agentName: "Lead Writer",
      idempotencyKey: key,
    });

    expect(task1.id).toBe(task2.id);
  });
});
