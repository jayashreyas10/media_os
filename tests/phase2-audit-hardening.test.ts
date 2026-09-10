import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../src/server/db/prisma";
import { KnowledgeBaseService } from "../src/server/services/knowledge-service";
import { EvidenceGraphService } from "../src/server/services/evidence-graph-service";
import { TaskEngine } from "../src/server/services/task-engine";

describe("Phase 2 Engineering Audit & Hardening", () => {
  let ws1Id: string;
  let ws2Id: string;

  beforeAll(async () => {
    // Create two isolated workspaces for cross-tenant boundary testing
    const u1 = await prisma.user.create({
      data: { email: `tenant1_${Date.now()}@mediaos.local`, name: "Tenant 1", passwordHash: "dummy" },
    });
    const ws1 = await prisma.workspace.create({
      data: { name: "Tenant 1 Workspace", slug: `tenant-1-${Date.now()}`, ownerId: u1.id },
    });
    ws1Id = ws1.id;

    const u2 = await prisma.user.create({
      data: { email: `tenant2_${Date.now()}@mediaos.local`, name: "Tenant 2", passwordHash: "dummy" },
    });
    const ws2 = await prisma.workspace.create({
      data: { name: "Tenant 2 Workspace", slug: `tenant-2-${Date.now()}`, ownerId: u2.id },
    });
    ws2Id = ws2.id;
  });

  it("prevents cross-workspace access to knowledge items", async () => {
    const item = await KnowledgeBaseService.createItem({
      workspaceId: ws1Id,
      title: "Private Tenant 1 Strategy Document",
      content: "Confidential roadmap for Tenant 1 only.",
      type: "DOCUMENT",
    });

    // Tenant 1 can read it
    const readByOwner = await KnowledgeBaseService.getItem(item.id, ws1Id);
    expect(readByOwner).not.toBeNull();
    expect(readByOwner?.title).toBe("Private Tenant 1 Strategy Document");

    // Tenant 2 CANNOT read it
    const readByOther = await KnowledgeBaseService.getItem(item.id, ws2Id);
    expect(readByOther).toBeNull();

    // Tenant 2 CANNOT update it
    await expect(
      KnowledgeBaseService.updateItem(item.id, ws2Id, { title: "Hijacked Title" })
    ).rejects.toThrow(/not found in workspace/);

    // Tenant 2 CANNOT delete it
    await expect(
      KnowledgeBaseService.deleteItem(item.id, ws2Id)
    ).rejects.toThrow(/not found in workspace/);
  });

  it("prevents attaching evidence across workspace boundaries", async () => {
    // Source in Workspace 1
    const source1 = await EvidenceGraphService.createSource({
      workspaceId: ws1Id,
      title: "Tenant 1 Internal Lab Benchmark",
      trustScore: 90,
    });

    // Claim in Workspace 2
    const claim2 = await EvidenceGraphService.createClaim({
      workspaceId: ws2Id,
      claimText: "Tenant 2 claiming Tenant 1 internal evidence.",
      confidence: 50,
    });

    // Attempt to attach Workspace 1 source to Workspace 2 claim from Tenant 2 context
    await expect(
      EvidenceGraphService.attachEvidence(
        {
          claimId: claim2.id,
          sourceId: source1.id,
          quoteSnippet: "Unauthorized access excerpt",
        },
        ws2Id // context is ws2
      )
    ).rejects.toThrow(/does not belong to authorized workspace/);
  });

  it("detects and rejects circular task dependencies", async () => {
    // Create Task A
    const taskA = await TaskEngine.queueTask({
      workspaceId: ws1Id,
      taskType: "SIGNAL_SCOUT",
      agentName: "Signal Scout",
    });

    // Create Task B depending on Task A
    const taskB = await TaskEngine.queueTask({
      workspaceId: ws1Id,
      taskType: "RESEARCHER",
      agentName: "Researcher",
      dependsOnTaskIds: [taskA.id],
    });

    // Attempt to make Task A depend on Task B (circular self-loop)
    const isCircular = await TaskEngine.checkCircularDependency(taskA.id, [taskB.id]);
    expect(isCircular).toBe(true);
  });

  it("prevents tasks from executing while required dependencies remain incomplete", async () => {
    const parent = await TaskEngine.queueTask({
      workspaceId: ws1Id,
      taskType: "SIGNAL_SCOUT",
      agentName: "Signal Scout",
    });

    const child = await TaskEngine.queueTask({
      workspaceId: ws1Id,
      taskType: "RESEARCHER",
      agentName: "Researcher",
      dependsOnTaskIds: [parent.id],
    });

    expect(child.status).toBe("WAITING");

    // Attempting to execute child directly while parent is still QUEUED should keep child in WAITING
    const executionAttempt = await TaskEngine.executeTask(child.id);
    expect(executionAttempt?.status).toBe("WAITING");
  });

  it("propagates failure to downstream waiting tasks when an upstream task fails permanently", async () => {
    // Create task with maxAttempts = 1 so it fails immediately upon error
    const faultyTask = await prisma.task.create({
      data: {
        workspaceId: ws1Id,
        taskType: "SIGNAL_SCOUT",
        agentName: "Failing Scout",
        status: "QUEUED",
        inputJson: "{}",
        maxAttempts: 1,
        attemptCount: 1, // Already at max attempt
      },
    });

    const waitingChild = await TaskEngine.queueTask({
      workspaceId: ws1Id,
      taskType: "STRATEGIST",
      agentName: "Waiting Strategist",
      dependsOnTaskIds: [faultyTask.id],
    });

    expect(waitingChild.status).toBe("WAITING");

    // Trigger failure cancellation
    await TaskEngine.cancelDownstreamTasks(faultyTask.id, "Simulated upstream network timeout");

    const updatedChild = await prisma.task.findUnique({ where: { id: waitingChild.id } });
    expect(updatedChild?.status).toBe("CANCELLED");
    expect(updatedChild?.errorMessage).toContain("Upstream dependency task");
  });
});
