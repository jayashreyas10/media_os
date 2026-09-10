import { AIProvider, AgentRunRequest, AgentRunResult } from "../provider-interface";
import {
  SignalScoutOutputSchema,
  ResearchOutputSchema,
  StrategyOutputSchema,
  WriterOutputSchema,
  DistributionOutputSchema,
  EditorOutputSchema,
} from "../schemas/agent-outputs";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = "gemini-1.5-flash") {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.model = model;
  }

  async generate(request: AgentRunRequest): Promise<AgentRunResult> {
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
        errorMessage: "GEMINI_API_KEY is not configured.",
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

You must return valid JSON strictly complying with the schema for ${request.agentType}. Do not include markdown fences.`;

      const userPrompt = `Task input payload:\n${JSON.stringify(request.context.inputPayload || {}, null, 2)}`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error("Empty response from Gemini API");
      }

      const parsedJson = JSON.parse(rawText);
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

      const usage = resJson.usageMetadata || {};
      const inputTokens = usage.promptTokenCount || 500;
      const outputTokens = usage.candidatesTokenCount || 600;
      // Gemini 1.5 Flash: $0.075 / 1M input, $0.30 / 1M output
      const estimatedCostUsd = (inputTokens * 0.000000075) + (outputTokens * 0.0000003);

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
        errorMessage: err instanceof Error ? err.message : "Gemini execution failed",
      };
    }
  }
}
