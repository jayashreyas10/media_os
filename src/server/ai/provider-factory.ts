import prisma from "../db/prisma";
import { AIProvider } from "./provider-interface";
import { MockAIProvider } from "./providers/mock-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import { OpenAIProvider } from "./providers/openai-provider";
import { AnthropicProvider } from "./providers/anthropic-provider";

export type AIMode = "LIVE" | "MOCK" | "DISABLED";

export class AIDisabledError extends Error {
  statusCode = 400;
  code = "AI_ASSISTANCE_DISABLED";

  constructor(
    message = "AI assistance is currently disabled. All workflows are fully available via manual mode."
  ) {
    super(message);
    this.name = "AIDisabledError";
  }
}

export interface ProviderSelectionOptions {
  workspaceId?: string;
  preferredProvider?: string;
}

export class ProviderFactory {
  private static mockInstance = new MockAIProvider();

  /**
   * Resolves current AI operational mode: LIVE, MOCK, or DISABLED.
   */
  static async getAIMode(workspaceId?: string): Promise<AIMode> {
    const envMode = (process.env.AI_MODE || "").toUpperCase().trim();
    if (envMode === "DISABLED" || process.env.AI_PROVIDER === "disabled") {
      return "DISABLED";
    }
    if (envMode === "LIVE") return "LIVE";
    if (envMode === "MOCK") return "MOCK";

    if (workspaceId) {
      try {
        const config = await prisma.aIProviderConfig.findFirst({
          where: { workspaceId, isDefault: true },
        });
        if (config?.providerName === "disabled" || config?.modelName === "disabled") {
          return "DISABLED";
        }
        if (
          config &&
          ["gemini", "openai", "anthropic"].includes(config.providerName.toLowerCase())
        ) {
          const name = config.providerName.toLowerCase();
          if (
            (name === "gemini" && process.env.GEMINI_API_KEY) ||
            (name === "openai" && process.env.OPENAI_API_KEY) ||
            (name === "anthropic" && process.env.ANTHROPIC_API_KEY)
          ) {
            return "LIVE";
          }
        }
      } catch {
        // Fall back to default evaluation
      }
    }

    if (
      process.env.AI_PROVIDER_DEFAULT !== "mock" &&
      process.env.AI_PROVIDER !== "mock" &&
      (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY)
    ) {
      return "LIVE";
    }

    return "MOCK";
  }

  /**
   * Resolves safe status for UI without exposing secrets.
   */
  static async getAIStatus(workspaceId?: string) {
    const mode = await this.getAIMode(workspaceId);
    let label = "Mock / Demo Mode";
    if (mode === "DISABLED") {
      label = "Disabled (Manual Mode)";
    } else if (mode === "LIVE") {
      label = "Live AI Enabled";
    }

    return {
      mode,
      label,
      provider: mode === "DISABLED" ? "none" : (process.env.AI_PROVIDER || "mock"),
      manualAvailable: true,
    };
  }

  /**
   * Resolves the appropriate AIProvider.
   * If AI is DISABLED, strictly throws AIDisabledError without making calls or generating fake responses.
   * If MOCK, returns the deterministic zero-cost MockAIProvider.
   * If LIVE, returns the configured provider.
   */
  static async getProvider(options?: ProviderSelectionOptions): Promise<AIProvider> {
    if (options?.preferredProvider === "disabled") {
      throw new AIDisabledError();
    }

    const mode = await this.getAIMode(options?.workspaceId);
    if (mode === "DISABLED") {
      throw new AIDisabledError();
    }

    const requestedName =
      options?.preferredProvider ||
      process.env.AI_PROVIDER ||
      (options?.workspaceId
        ? (
            await prisma.aIProviderConfig.findFirst({
              where: { workspaceId: options.workspaceId, isDefault: true },
            })
          )?.providerName
        : undefined) ||
      "mock";

    const normalized = requestedName.toLowerCase().trim();

    if (normalized === "disabled") {
      throw new AIDisabledError();
    }

    if (mode === "LIVE") {
      if (normalized === "gemini" && process.env.GEMINI_API_KEY) {
        return new GeminiProvider();
      } else if (normalized === "openai" && process.env.OPENAI_API_KEY) {
        return new OpenAIProvider();
      } else if (normalized === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        return new AnthropicProvider();
      }
    }

    // Default zero-cost offline mock provider
    return this.mockInstance;
  }

  /**
   * Records token usage and cost in AIProviderConfig and AgentRun if applicable.
   */
  static async recordUsage(
    workspaceId: string,
    providerName: string,
    costUsd: number
  ) {
    if (costUsd <= 0) return;

    try {
      await prisma.aIProviderConfig.updateMany({
        where: { workspaceId, providerName },
        data: {
          currentDailyCost: {
            increment: costUsd,
          },
        },
      });
    } catch {
      // Ignore if provider config is not explicitly pre-seeded
    }
  }
}
