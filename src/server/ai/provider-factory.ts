import prisma from "../db/prisma";
import { AIProvider } from "./provider-interface";
import { MockAIProvider } from "./providers/mock-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import { OpenAIProvider } from "./providers/openai-provider";
import { AnthropicProvider } from "./providers/anthropic-provider";

export interface ProviderSelectionOptions {
  workspaceId?: string;
  preferredProvider?: string;
}

export class ProviderFactory {
  private static mockInstance = new MockAIProvider();

  /**
   * Resolves the appropriate AIProvider.
   * If no live provider is configured or API keys are missing,
   * it safely falls back to the deterministic zero-cost MockAIProvider.
   */
  static async getProvider(options?: ProviderSelectionOptions): Promise<AIProvider> {
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

    if (normalized === "gemini") {
      if (process.env.GEMINI_API_KEY) {
        return new GeminiProvider();
      }
    } else if (normalized === "openai") {
      if (process.env.OPENAI_API_KEY) {
        return new OpenAIProvider();
      }
    } else if (normalized === "anthropic") {
      if (process.env.ANTHROPIC_API_KEY) {
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
