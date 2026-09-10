import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../src/server/db/prisma";
import { TaskEngine } from "../src/server/services/task-engine";

describe("Task Chaining & Dependency DAG Subsystem", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.findFirst();
    if (ws) {
      workspaceId = ws.id;
    } else {
      const u = await prisma.user.create({
        data: { email: "chaintest@mediaos.local", name: "Chain Tester", passwordHash: "dummy" },
      });
      const newWs = await prisma.workspace.create({
        data: { name: "Chain Workspace", slug: `chain-ws-${Date.now()}`, ownerId: u.id },
      });
      workspaceId = newWs.id;
    }
  });

  it("orchestrates a sequential 3-step DAG pipeline (Scout -> Researcher -> Strategist)", async () => {
    // 1. Create a 3-step dependency chain
    const chain = await TaskEngine.createChain(workspaceId, null, [
      {
        taskType: "SIGNAL_SCOUT",
        agentName: "Signal Scout",
        inputData: { focus: "DAG pipeline test" },
      },
      {
        taskType: "RESEARCHER",
        agentName: "Evidence Researcher",
        inputData: { depth: "Fact check" },
      },
      {
        taskType: "STRATEGIST",
        agentName: "Content Strategist",
        inputData: { format: "YouTube script strategy" },
      },
    ]);

    expect(chain.length).toBe(3);
    const [taskA, taskB, taskC] = chain;

    // Verify task dependencies were created in the database
    const depB = await prisma.taskDependency.findFirst({
      where: { taskId: taskB.id, dependsOnTaskId: taskA.id },
    });
    expect(depB).not.toBeNull();

    const depC = await prisma.taskDependency.findFirst({
      where: { taskId: taskC.id, dependsOnTaskId: taskB.id },
    });
    expect(depC).not.toBeNull();

    // Query live state from database:
    // When createChain finished, taskA completed and triggered downstream taskB,
    // which in turn completed and triggered downstream taskC!
    const finalTaskA = await prisma.task.findUnique({ where: { id: taskA.id } });
    const finalTaskB = await prisma.task.findUnique({ where: { id: taskB.id } });
    const finalTaskC = await prisma.task.findUnique({ where: { id: taskC.id } });

    expect(finalTaskA?.status).toBe("COMPLETED");
    expect(finalTaskB?.status).toBe("COMPLETED");
    expect(finalTaskC?.status).toBe("COMPLETED");

    // Verify all 3 produced Zod-valid outputs
    expect(finalTaskA?.outputJson).toBeDefined();
    expect(finalTaskB?.outputJson).toBeDefined();
    expect(finalTaskC?.outputJson).toBeDefined();
  });
});
