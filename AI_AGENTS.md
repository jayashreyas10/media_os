# MediaOS AI Agent Subsystem

MediaOS organizes AI generation not as a conversational chatbot, but as six specialized roles executing structured tasks with strict Zod validation.

---

## The Six Specialized Roles

### 1. Signal Scout
- **Mission**: Scans industry events, audience objections, and technical papers to identify high-potential production opportunities.
- **Context Loaded**: Brand Audience, Content Pillars, Strategic Goals.
- **Output Schema**: `SignalScoutOutputSchema` (title, event, whyNow, audienceRelevance 1-10, opportunityScore 1-10, urgency, suggestedAngle).

### 2. Evidence Researcher
- **Mission**: Converts approved signals into verified claims backed by primary sources.
- **Context Loaded**: Signal details, Audience skepticism, Proof records, Editorial fact-checking rules.
- **Output Schema**: `ResearchOutputSchema` (summary, claims with confidence scores, contradictions, unknowns, primarySources).

### 3. Content Strategist
- **Mission**: Formulates a singular high-conviction editorial direction, central tension, and narrative arc.
- **Context Loaded**: Research claims, Brand Identity, Positioning, Content Pillars.
- **Output Schema**: `StrategyOutputSchema` (targetReader, outcome, centralTension, thesis, whyNow, primaryHeadline, alternativeHeadlines, keySections, distributionEntryPoints).

### 4. Long-form Writer
- **Mission**: Transforms strategy and verified evidence into a high-retention flagship script or essay.
- **Context Loaded**: Strategy, Brand Voice, Forbidden words, Signature phrases.
- **Output Schema**: `WriterOutputSchema` (primaryTitle, hook30s, scriptSections [HOOK, CONTEXT, PROBLEM, STAKES, EXPLANATION, DEMONSTRATION, INSIGHT, CONCLUSION, CTA], fullScriptMarkdown, thumbnailConcept, thumbnailText).

### 5. Distribution Agent
- **Mission**: Repurposes flagship content into native assets designed specifically for individual platforms.
- **Context Loaded**: Script, Audience Profile, Brand Voice.
- **Output Schema**: `DistributionOutputSchema` (xPost, xThread, linkedInPost, newsletterExcerpt, shortsConcept).

### 6. Editorial Reviewer
- **Mission**: Rigorous automated fact-checking and brand alignment audit prior to human sign-off.
- **Context Loaded**: Script, Research Claims, Forbidden Words, Editorial Rules.
- **Output Schema**: `EditorOutputSchema` (verdict [APPROVE | REQUEST_REVISION | REJECT], overallScore 1-100, summary, issues list with severity and suggested fixes).

---

## AI Provider Architecture & Fallback Protocol

MediaOS decouples agent domain logic from vendor SDKs via the `AIProvider` interface and `ProviderFactory`:

- **Deterministic Mock Provider (`MockAIProvider`)**: Default, zero-cost, fully offline provider. Guarantees deterministic outputs for tests, local execution, and staging without external network dependencies.
- **Google Gemini Adapter (`GeminiProvider`)**: Direct integration with Gemini 1.5 Flash via REST API with native JSON mode (`responseMimeType: application/json`).
- **OpenAI Adapter (`OpenAIProvider`)**: Native chat completions integration with JSON mode (`response_format: { type: "json_object" }`).
- **Anthropic Adapter (`AnthropicProvider`)**: Native Claude 3.5 Sonnet / Haiku integration via Messages API with structured JSON extraction.

### Fallback Guarantee
If live API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) are missing, `ProviderFactory.getProvider` automatically falls back to `MockAIProvider`. **Paid calls are never executed in Mock mode**.

---

## Research Tool & Prompt Injection Defense

All web intelligence is ingested via the `ResearchTool` interface:

- `MockResearchTool`: Provides deterministic research benchmarks, developer surveys, and technical case studies.
- `LiveWebFetcher`: Executes HTTP fetching with:
  - 5-second bounded timeout via `AbortSignal.timeout(5000)`.
  - HTML tag and script removal.
  - 4KB length bounding to eliminate context flooding and copyright bloat.
  - **Prompt Injection Neutralization**: Known adversarial instruction patterns (e.g. `ignore previous instructions`, `system prompt`, `you are now in developer mode`) are defused into `[DEFUSED_INSTRUCTION]`.
  - Content is enclosed in explicit `<<<BEGIN_UNTRUSTED_EXTERNAL_DATA>>>` and `<<<END_UNTRUSTED_EXTERNAL_DATA>>>` boundary tags instructing models to analyze the payload as third-party evidence, never as instructions.

