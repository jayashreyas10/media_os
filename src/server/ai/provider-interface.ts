import { AnyAgentOutput } from "./schemas/agent-outputs";

export type AgentType =
  | "SIGNAL_SCOUT"
  | "RESEARCHER"
  | "STRATEGIST"
  | "WRITER"
  | "DISTRIBUTION"
  | "EDITOR"
  | "LEARNING_ENGINE";

export interface AgentRunRequest {
  agentType: AgentType;
  promptVersion?: string;
  context: {
    brandName?: string;
    brandIdentity?: Record<string, unknown> | null;
    audienceProfile?: Record<string, unknown> | null;
    brandVoice?: Record<string, unknown> | null;
    contentPillars?: Array<Record<string, unknown>>;
    editorialRules?: Array<Record<string, unknown>>;
    campaignTitle?: string;
    campaignBrief?: string | null;
    inputPayload?: Record<string, unknown>;
    format?: string;
    relevantClaims?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

export interface AgentRunResult {
  success: boolean;
  data?: AnyAgentOutput;
  rawJson?: string;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  errorMessage?: string;
}

export interface AIProvider {
  readonly name: string;
  generate(request: AgentRunRequest): Promise<AgentRunResult>;
}
