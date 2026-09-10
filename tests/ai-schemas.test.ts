import { describe, it, expect } from "vitest";
import { MockAIProvider } from "../src/server/ai/providers/mock-provider";
import {
  SignalScoutOutputSchema,
  ResearchOutputSchema,
  StrategyOutputSchema,
  WriterOutputSchema,
  DistributionOutputSchema,
  EditorOutputSchema,
} from "../src/server/ai/schemas/agent-outputs";

describe("AI Mock Provider & Zod Schema Validation", () => {
  const provider = new MockAIProvider();

  it("produces valid Signal Scout output conforming to Zod schema", async () => {
    const result = await provider.generate({
      agentType: "SIGNAL_SCOUT",
      context: { brandName: "Test Brand", campaignTitle: "Testing Agents" },
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("mock");
    const parsed = SignalScoutOutputSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.signals.length).toBeGreaterThan(0);
      expect(parsed.data.signals[0].opportunityScore).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces valid Researcher output conforming to Zod schema", async () => {
    const result = await provider.generate({
      agentType: "RESEARCHER",
      context: { brandName: "Test Brand", campaignTitle: "Testing Agents" },
    });

    expect(result.success).toBe(true);
    const parsed = ResearchOutputSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.claims.length).toBeGreaterThan(0);
      expect(parsed.data.primarySources.length).toBeGreaterThan(0);
    }
  });

  it("produces valid Strategy output conforming to Zod schema", async () => {
    const result = await provider.generate({
      agentType: "STRATEGIST",
      context: { brandName: "Test Brand", campaignTitle: "Testing Agents" },
    });

    expect(result.success).toBe(true);
    const parsed = StrategyOutputSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.thesis.length).toBeGreaterThan(10);
      expect(parsed.data.keySections.length).toBeGreaterThan(0);
    }
  });

  it("produces valid Writer output conforming to Zod schema", async () => {
    const result = await provider.generate({
      agentType: "WRITER",
      context: { brandName: "Test Brand", campaignTitle: "Testing Agents" },
    });

    expect(result.success).toBe(true);
    const parsed = WriterOutputSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scriptSections.length).toBeGreaterThan(0);
      expect(parsed.data.hook30s.length).toBeGreaterThan(10);
    }
  });

  it("produces valid Distribution output conforming to Zod schema", async () => {
    const result = await provider.generate({
      agentType: "DISTRIBUTION",
      context: { brandName: "Test Brand", campaignTitle: "Testing Agents" },
    });

    expect(result.success).toBe(true);
    const parsed = DistributionOutputSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.xThread.length).toBeGreaterThan(0);
      expect(parsed.data.linkedInPost.length).toBeGreaterThan(10);
    }
  });

  it("produces valid Editor output conforming to Zod schema", async () => {
    const result = await provider.generate({
      agentType: "EDITOR",
      context: { brandName: "Test Brand", campaignTitle: "Testing Agents" },
    });

    expect(result.success).toBe(true);
    const parsed = EditorOutputSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(["APPROVE", "REQUEST_REVISION", "REJECT"]).toContain(parsed.data.verdict);
      expect(parsed.data.overallScore).toBeGreaterThanOrEqual(0);
    }
  });
});
