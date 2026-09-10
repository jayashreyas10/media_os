import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../src/server/db/prisma";
import { EvidenceGraphService } from "../src/server/services/evidence-graph-service";
import { MockResearchTool } from "../src/server/ai/research-tool";

describe("Evidence Integrity Audit & Verification Subsystem", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `evidence_audit_${Date.now()}@mediaos.local`,
        name: "Evidence Auditor",
        passwordHash: "dummyHash",
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: "Evidence Audit Workspace",
        slug: `evidence-audit-${Date.now()}`,
        ownerId: user.id,
      },
    });
    workspaceId = workspace.id;
  });

  it("1. AI confidence cannot independently verify a claim & unsupported claim cannot become VERIFIED", async () => {
    // Model claims 99% confidence, but provides no evidence
    const unverifiedClaim = await EvidenceGraphService.createClaim({
      workspaceId,
      claimText: "Multi-agent autonomous loops achieve 100% determinism without state machines.",
      confidence: 99,
      isFact: true,
      // Default should be UNVERIFIED
    });

    expect(unverifiedClaim.verificationStatus).toBe("UNVERIFIED");

    // Recalculating status without supporting evidence must keep status UNVERIFIED
    const recalculated = await EvidenceGraphService.recalculateClaimVerificationStatus(unverifiedClaim.id);
    expect(recalculated.verificationStatus).toBe("UNVERIFIED");
  });

  it("2. fabricated quote cannot be treated as source evidence", async () => {
    // Source contains actual empirical text
    const source = await EvidenceGraphService.createSource({
      workspaceId,
      title: "Quarterly Systems Reliability Review",
      url: "https://reliability.mediaos.local/q3-review",
      sourceType: "PRIMARY_BENCHMARK",
      rawContent: "During the Q3 benchmark across 200 production workflows, average error latency was 420ms with 4 reported timeouts.",
    });

    const claim = await EvidenceGraphService.createClaim({
      workspaceId,
      primarySourceId: source.id,
      claimText: "Error latency was reduced to 10ms with zero timeouts.",
      confidence: 95,
      isFact: true,
    });

    // Attempt to attach a fabricated quote snippet that does NOT appear in the source text
    const evidence = await EvidenceGraphService.attachEvidence({
      claimId: claim.id,
      sourceId: source.id,
      quoteSnippet: "Average error latency was reduced to 10ms with zero timeouts in Q3.",
      supportStance: "SUPPORTS",
    });

    expect(evidence.isQuoteVerified).toBe(false);
    expect(evidence.groundingScore).toBe(0);

    // Refresh claim: must NOT be marked VERIFIED because quote failed grounding
    const refreshedClaim = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(refreshedClaim?.verificationStatus).toBe("UNVERIFIED");
    expect(refreshedClaim?.contradictionNote).toContain("could not be grounded");
  });

  it("3. supporting evidence verifiably extracted from source can verify a claim", async () => {
    const source = await EvidenceGraphService.createSource({
      workspaceId,
      title: "State Machine Constrained Execution Study",
      url: "https://mediaos.internal/study/fsm-convergence",
      sourceType: "PRIMARY_BENCHMARK",
      rawContent: "Empirical evaluation of 1000 generation runs demonstrated that finite-state constrained execution had a 92% completion rate vs 53% for open ReAct loops.",
    });

    const claim = await EvidenceGraphService.createClaim({
      workspaceId,
      primarySourceId: source.id,
      claimText: "Finite-state constrained execution achieves a 92% completion rate.",
      confidence: 90,
      isFact: true,
    });

    // Attach verbatim quote from rawContent
    const evidence = await EvidenceGraphService.attachEvidence({
      claimId: claim.id,
      sourceId: source.id,
      quoteSnippet: "finite-state constrained execution had a 92% completion rate vs 53% for open ReAct loops",
      supportStance: "SUPPORTS",
    });

    expect(evidence.isQuoteVerified).toBe(true);
    expect(evidence.groundingScore).toBe(100);

    // Claim should now be verified
    const refreshedClaim = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(refreshedClaim?.verificationStatus).toBe("VERIFIED");
    expect(refreshedClaim?.contradictionNote).toBeNull();
  });

  it("4. contradicting evidence prevents false verification and marks claim CONTRADICTED", async () => {
    const source = await EvidenceGraphService.createSource({
      workspaceId,
      title: "Independent ReAct Loop Replication",
      url: "https://independent-lab.org/replication-report",
      sourceType: "PEER_REVIEWED_PAPER",
      rawContent: "Independent replications across 500 trials failed to reproduce zero divergence, observing runaway looping in 68% of unconstrained runs.",
    });

    const claim = await EvidenceGraphService.createClaim({
      workspaceId,
      primarySourceId: source.id,
      claimText: "Unconstrained ReAct loops exhibit zero divergence in production.",
      confidence: 85,
      isFact: true,
    });

    const evidence = await EvidenceGraphService.attachEvidence({
      claimId: claim.id,
      sourceId: source.id,
      quoteSnippet: "observing runaway looping in 68% of unconstrained runs",
      supportStance: "CONTRADICTS",
    });

    expect(evidence.isQuoteVerified).toBe(true);

    const refreshedClaim = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(refreshedClaim?.verificationStatus).toBe("CONTRADICTED");
    expect(refreshedClaim?.contradictionNote).toContain("Direct contradiction");
  });

  it("5. multiple conflicting sources are represented correctly as UNRESOLVED", async () => {
    // Source A supports
    const sourceA = await EvidenceGraphService.createSource({
      workspaceId,
      title: "Vendor Benchmark Report A",
      url: "https://vendor-a.io/benchmark",
      rawContent: "Our benchmark indicates that architecture Alpha converges in 98% of cases within 5 seconds.",
    });

    // Source B contradicts
    const sourceB = await EvidenceGraphService.createSource({
      workspaceId,
      title: "Auditor Replication Report B",
      url: "https://auditor-b.org/audit",
      rawContent: "Independent testing demonstrates that architecture Alpha diverges in 45% of cases and fails to converge.",
    });

    const disputedClaim = await EvidenceGraphService.createClaim({
      workspaceId,
      claimText: "Architecture Alpha reliably converges in 98% of test cases.",
      confidence: 60,
      isFact: true,
    });

    // Attach supporting evidence from Source A
    await EvidenceGraphService.attachEvidence({
      claimId: disputedClaim.id,
      sourceId: sourceA.id,
      quoteSnippet: "architecture Alpha converges in 98% of cases within 5 seconds",
      supportStance: "SUPPORTS",
    });

    // Attach contradicting evidence from Source B
    await EvidenceGraphService.attachEvidence({
      claimId: disputedClaim.id,
      sourceId: sourceB.id,
      quoteSnippet: "architecture Alpha diverges in 45% of cases and fails to converge",
      supportStance: "CONTRADICTS",
    });

    const refreshed = await prisma.claim.findUnique({ where: { id: disputedClaim.id } });
    expect(refreshed?.verificationStatus).toBe("UNRESOLVED");
    expect(refreshed?.contradictionNote).toContain("Conflicting evidence detected");
    expect(refreshed?.contradictionNote).toContain("1 verified supporting source(s)");
    expect(refreshed?.contradictionNote).toContain("1 contradicting source(s)");
  });

  it("6. synthetic mock evidence is visibly marked and labeled", async () => {
    const tool = new MockResearchTool();
    const results = await tool.search("agent state machine", { maxResults: 1 });

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];

    expect(result.isSynthetic).toBe(true);
    expect(result.title).toContain("[SYNTHETIC / DEMONSTRATION DATA]");
    expect(result.sourceType).toBe("SYNTHETIC_BENCHMARK");

    const page = await tool.fetchPage(result.url);
    expect(page.retrievalStatus).toBe("SYNTHETIC");
    expect(page.text).toContain("SYNTHETIC DEMONSTRATION DATA");
  });

  it("7. source provenance is preserved completely in database", async () => {
    const timestamp = new Date("2026-02-15T10:00:00Z");
    const source = await EvidenceGraphService.createSource({
      workspaceId,
      title: "Comprehensive Provenance Benchmark",
      url: "https://provenance-archive.org/data-2026",
      author: "Lead Systems Architect",
      publisher: "Open Systems Foundation",
      publishDate: "2026-02-15",
      sourceType: "PRIMARY_BENCHMARK",
      trustScore: 94,
      retrievalStatus: "FETCHED",
      retrievedAt: timestamp,
      rawContent: "Full benchmark verbatim text establishing provenance.",
      isSynthetic: false,
      sourceNotes: "Retrieved via authenticated HTTP client.",
    });

    const retrieved = await EvidenceGraphService.getSource(source.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.url).toBe("https://provenance-archive.org/data-2026");
    expect(retrieved?.author).toBe("Lead Systems Architect");
    expect(retrieved?.publisher).toBe("Open Systems Foundation");
    expect(retrieved?.sourceType).toBe("PRIMARY_BENCHMARK");
    expect(retrieved?.trustScore).toBe(94);
    expect(retrieved?.retrievalStatus).toBe("FETCHED");
    expect(retrieved?.isSynthetic).toBe(false);
    expect(retrieved?.rawContent).toContain("Full benchmark verbatim text");
  });

  it("8. evidence with DOES_NOT_SUPPORT or CONTEXTUALIZES does not verify a claim", async () => {
    const source = await EvidenceGraphService.createSource({
      workspaceId,
      title: "Background Tech Ecosystem Overview",
      url: "https://ecosystem.org/overview",
      rawContent: "The cloud computing market grew substantially between 2020 and 2025 across all enterprise segments.",
    });

    const claim = await EvidenceGraphService.createClaim({
      workspaceId,
      claimText: "Cloud computing expansion directly caused agent adoption.",
      confidence: 80,
      isFact: false,
    });

    await EvidenceGraphService.attachEvidence({
      claimId: claim.id,
      sourceId: source.id,
      quoteSnippet: "cloud computing market grew substantially between 2020 and 2025",
      supportStance: "CONTEXTUALIZES",
    });

    const refreshed = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(refreshed?.verificationStatus).toBe("UNVERIFIED");
  });
});
