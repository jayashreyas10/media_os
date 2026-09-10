import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../src/server/db/prisma";
import { KnowledgeBaseService } from "../src/server/services/knowledge-service";

describe("Knowledge Base Subsystem", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.findFirst();
    if (ws) {
      workspaceId = ws.id;
    } else {
      const u = await prisma.user.create({
        data: { email: "kbtest@mediaos.local", name: "KB Tester", passwordHash: "dummy" },
      });
      const newWs = await prisma.workspace.create({
        data: { name: "KB Workspace", slug: `kb-ws-${Date.now()}`, ownerId: u.id },
      });
      workspaceId = newWs.id;
    }
  });

  it("creates, retrieves, and filters knowledge items by type and tags", async () => {
    const item1 = await KnowledgeBaseService.createItem({
      workspaceId,
      title: "State Machine Automata in Multi-Agent Execution",
      content: "Formal verification prevents infinite conversational recursion in multi-agent tool loops.",
      type: "RESEARCH",
      sourceUrl: "https://arxiv.org/abs/2402.12345",
      tags: "agents, architecture, benchmarks",
      confidence: 95,
    });

    expect(item1.id).toBeDefined();
    expect(item1.type).toBe("RESEARCH");
    expect(item1.confidence).toBe(95);

    const item2 = await KnowledgeBaseService.createItem({
      workspaceId,
      title: "High-Retention Hook Blueprint",
      content: "Demonstrate immediate architectural stakes within 30 seconds to minimize dropoff.",
      type: "PLAYBOOK",
      tags: "hooks, youtube, video",
      confidence: 90,
    });

    // Test listing with type filter
    const researchItems = await KnowledgeBaseService.listItems(workspaceId, {
      type: "RESEARCH",
    });
    expect(researchItems.some((i) => i.id === item1.id)).toBe(true);
    expect(researchItems.every((i) => i.type === "RESEARCH")).toBe(true);

    // Test text search
    const searchResults = await KnowledgeBaseService.listItems(workspaceId, {
      search: "infinite conversational",
    });
    expect(searchResults.some((i) => i.id === item1.id)).toBe(true);

    // Test tag search
    const tagResults = await KnowledgeBaseService.listItems(workspaceId, {
      tag: "youtube",
    });
    expect(tagResults.some((i) => i.id === item2.id)).toBe(true);
  });

  it("updates and deletes knowledge items cleanly", async () => {
    const item = await KnowledgeBaseService.createItem({
      workspaceId,
      title: "Temporary Knowledge Note",
      content: "To be updated and deleted.",
      type: "NOTE",
    });

    const updated = await KnowledgeBaseService.updateItem(item.id, {
      title: "Updated Knowledge Note",
      confidence: 88,
    });
    expect(updated.title).toBe("Updated Knowledge Note");
    expect(updated.confidence).toBe(88);

    await KnowledgeBaseService.deleteItem(item.id);
    const fetched = await KnowledgeBaseService.getItem(item.id);
    expect(fetched).toBeNull();
  });
});
