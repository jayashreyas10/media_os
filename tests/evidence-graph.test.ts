import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../src/server/db/prisma";
import { EvidenceGraphService } from "../src/server/services/evidence-graph-service";

describe("Source → Claim → Evidence Graph Subsystem", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.findFirst();
    if (ws) {
      workspaceId = ws.id;
    } else {
      const u = await prisma.user.create({
        data: { email: "evtest@mediaos.local", name: "EV Tester", passwordHash: "dummy" },
      });
      const newWs = await prisma.workspace.create({
        data: { name: "EV Workspace", slug: `ev-ws-${Date.now()}`, ownerId: u.id },
      });
      workspaceId = newWs.id;
    }
  });

  it("creates primary sources, links claims, and attaches verifiable evidence quotes", async () => {
    // 1. Create Source
    const source = await EvidenceGraphService.createSource({
      workspaceId,
      title: "State Machine Architectures for Deterministic AI Agents",
      url: "https://arxiv.org/abs/2402.12345",
      author: "Dr. Elena Vance et al.",
      publisher: "ArXiv Computing Research",
      publishDate: "2026-02-14",
      trustScore: 96,
      sourceNotes: "Peer-reviewed analysis of 500 multi-agent generation loops.",
      rawContent: "In a benchmark of 500 complex code generation tasks, finite-state constrained execution had a 92% completion rate vs 53% for open ReAct loops.",
    });

    expect(source.id).toBeDefined();
    expect(source.trustScore).toBe(96);

    // 2. Create Claim linked to Source
    const claim = await EvidenceGraphService.createClaim({
      workspaceId,
      primarySourceId: source.id,
      claimText: "Multi-agent systems using state machines reduce loop divergence by 74% compared to unconstrained ReAct loops.",
      confidence: 94,
      isFact: true,
      verificationStatus: "VERIFIED",
    });

    expect(claim.id).toBeDefined();
    expect(claim.primarySourceId).toBe(source.id);
    expect(claim.verificationStatus).toBe("VERIFIED");

    // 3. Attach verbatim Evidence quote snippet
    const evidence = await EvidenceGraphService.attachEvidence({
      claimId: claim.id,
      sourceId: source.id,
      quoteSnippet: "In a benchmark of 500 complex code generation tasks, finite-state constrained execution had a 92% completion rate vs 53% for open ReAct loops.",
      context: "Section 4.2 Benchmark Results, Table 3",
      pageOrTimestamp: "Page 8",
      verificationMethod: "EMPIRICAL_BENCHMARK",
    });

    expect(evidence.id).toBeDefined();
    expect(evidence.claimId).toBe(claim.id);
    expect(evidence.sourceId).toBe(source.id);

    // 4. Query full Graph for the Claim
    const fullClaim = await EvidenceGraphService.getClaim(claim.id);
    expect(fullClaim).not.toBeNull();
    expect(fullClaim?.primarySource?.id).toBe(source.id);
    expect(fullClaim?.evidence.length).toBe(1);
    expect(fullClaim?.evidence[0].quoteSnippet).toContain("92% completion rate");
    expect(fullClaim?.evidence[0].source.trustScore).toBe(96);
  });

  it("handles claim contradiction updates with audit notes", async () => {
    const claim = await EvidenceGraphService.createClaim({
      workspaceId,
      claimText: "Vendor X achieves 100% autonomous accuracy without human intervention.",
      confidence: 40,
      isFact: false,
      verificationStatus: "UNVERIFIED",
    });

    const updated = await EvidenceGraphService.updateClaimStatus(
      claim.id,
      "CONTRADICTED",
      "Independent replications fail to exceed 68% reliability without human-in-the-loop gates."
    );

    expect(updated.verificationStatus).toBe("CONTRADICTED");
    expect(updated.contradictionNote).toContain("Independent replications");
  });
});
