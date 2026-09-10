import { AIProvider, AgentRunRequest, AgentRunResult } from "../provider-interface";
import { assertAIEnabled } from "../guard";
import {
  SignalScoutOutputSchema,
  ResearchOutputSchema,
  StrategyOutputSchema,
  WriterOutputSchema,
  DistributionOutputSchema,
  EditorOutputSchema,
} from "../schemas/agent-outputs";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = "claude-3-5-sonnet-20241022") {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.model = model;
  }

  async generate(request: AgentRunRequest): Promise<AgentRunResult> {
    assertAIEnabled();
    const startTime = Date.now();
    const promptVersion = request.promptVersion || "v1.0";

    if (!this.apiKey) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        durationMs: Date.now() - startTime,
        errorMessage: "ANTHROPIC_API_KEY is not configured.",
      };
    }

    try {
      const systemInstruction = `You are a specialized AI agent in MediaOS executing the role of ${request.agentType}.
Brand context:
- Brand: ${request.context.brandName || "Default Brand"}
- Voice: ${JSON.stringify(request.context.brandVoice || {})}
- Audience: ${JSON.stringify(request.context.audienceProfile || {})}
- Pillars: ${JSON.stringify(request.context.contentPillars || [])}
- Campaign Title: ${request.context.campaignTitle || "Untitled"}
- Campaign Brief: ${request.context.campaignBrief || "None"}

You must return valid JSON ONLY complying strictly with the schema for ${request.agentType}. Do not include markdown ticks or prose.`;

      const userPrompt = `Task input payload:\n${JSON.stringify(request.context.inputPayload || {}, null, 2)}\n\nRespond with valid JSON object only.`;

      const endpoint = "https://api.anthropic.com/v1/messages";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          system: systemInstruction,
          messages: [{ role: "user", content: userPrompt }],
          max_tokens: 4000,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      const rawText = resJson.content?.[0]?.text;
      if (!rawText) {
        throw new Error("Empty response from Anthropic API");
      }

      // Strip potential leading/trailing markdown code fences if model returned them
      const cleanedJson = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
      const parsedJson = JSON.parse(cleanedJson);
      let validatedData;

      switch (request.agentType) {
        case "SIGNAL_SCOUT":
          validatedData = SignalScoutOutputSchema.parse(parsedJson);
          break;
        case "RESEARCHER":
          validatedData = ResearchOutputSchema.parse(parsedJson);
          break;
        case "STRATEGIST":
          validatedData = StrategyOutputSchema.parse(parsedJson);
          break;
        case "WRITER":
          validatedData = WriterOutputSchema.parse(parsedJson);
          break;
        case "DISTRIBUTION":
          validatedData = DistributionOutputSchema.parse(parsedJson);
          break;
        case "EDITOR":
          validatedData = EditorOutputSchema.parse(parsedJson);
          break;
        default:
          throw new Error(`Unsupported agent type: ${request.agentType}`);
      }

      const usage = resJson.usage || {};
      const inputTokens = usage.input_tokens || 500;
      const outputTokens = usage.output_tokens || 600;
      // Claude 3.5 Sonnet: $3.00 / 1M input, $15.00 / 1M output
      const estimatedCostUsd = (inputTokens * 0.000003) + (outputTokens * 0.000015);

      return {
        success: true,
        data: validatedData,
        rawJson: rawText,
        provider: this.name,
        model: this.model,
        promptVersion,
        inputTokens,
        outputTokens,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        durationMs: Date.now() - startTime,
        errorMessage: err instanceof Error ? err.message : "Anthropic execution failed",
      };
    }
  }
}
