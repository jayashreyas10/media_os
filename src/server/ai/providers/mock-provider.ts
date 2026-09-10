import { AIProvider, AgentRunRequest, AgentRunResult } from "../provider-interface";
import {
  SignalScoutOutputSchema,
  ResearchOutputSchema,
  StrategyOutputSchema,
  WriterOutputSchema,
  YouTubeLongFormOutputSchema,
  YouTubeShortOutputSchema,
  NewsletterOutputSchema,
  XThreadOutputSchema,
  LinkedInOutputSchema,
  DistributionOutputSchema,
  EditorOutputSchema,
  EditorialReviewOutputSchema,
  LearningEngineOutputSchema,
} from "../schemas/agent-outputs";

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async generate(request: AgentRunRequest): Promise<AgentRunResult> {
    const startTime = Date.now();
    const promptVersion = request.promptVersion || "v1.0";
    const topic = request.context.campaignTitle || "AI Agents in Production Engineering";

    try {
      let data;
      switch (request.agentType) {
        case "SIGNAL_SCOUT": {
          const raw = {
            scoutSummary: `Evaluated 14 industry signals against ${request.context.brandName || "Brand"} audience pillars. Identified high-resonance shift in autonomous agent infrastructure.`,
            recommendedSignalIndex: 0,
            signals: [
              {
                title: "Shift from Prompt Engineering to Agentic Determinism & Tool Sandboxing",
                event: "Major release of production orchestrators emphasizing state machines over raw conversational chains.",
                whyNow: "Teams are discarding unreliable autonomous loops in favor of strict, deterministic state machines with human-in-the-loop approvals.",
                audienceRelevance: 9,
                opportunityScore: 9,
                urgency: "HIGH" as const,
                suggestedAngle: "The End of Chatbot Gimmicks: Why Real AI Engineering Looks Like Traditional Distributed Systems.",
              },
              {
                title: "Local Inference Cost Parity with Cloud APIs",
                event: "Quantized 8B/70B models reaching 120 tokens/sec on consumer workstation hardware.",
                whyNow: "Solo founders can run full media pipelines without monthly recurring API billing.",
                audienceRelevance: 8,
                opportunityScore: 7,
                urgency: "MEDIUM" as const,
                suggestedAngle: "The Zero-Cost Media Studio: Running 6 Autonomous Roles on Local Silicon.",
              },
            ],
          };
          data = SignalScoutOutputSchema.parse(raw);
          break;
        }

        case "RESEARCHER": {
          const raw = {
            summary: `Fact-checked core technical benchmarks and developer survey results regarding ${topic}. Identified 2 primary sources and 2 verifiable claims with grounded quotes.`,
            claims: [
              {
                claimText: "Multi-agent systems using state machines reduce loop divergence by 74% compared to unconstrained ReAct loops.",
                confidence: 94,
                evidenceSnippet: "In an internal synthetic benchmark of 500 complex production workflows, finite-state constrained execution had a 92% completion rate vs 53% for open ReAct loops, reducing loop divergence by 74%.",
                sourceUrl: "https://mediaos.internal/synthetic/benchmarks/fsm-vs-react-2024",
                isFact: true,
                supportStance: "SUPPORTS" as const,
              },
              {
                claimText: "Human-in-the-loop editorial gates prevent hallucinated citations from reaching production publications.",
                confidence: 98,
                evidenceSnippet: "In this newsroom deployment study across 150 technical publications, automated editorial review gates caught 143 unverified claims across 150 test articles before publishing, establishing that human-in-the-loop review prevents hallucinated citations.",
                sourceUrl: "https://research.mediaos.local/reports/2026-agentic-benchmarks",
                isFact: true,
                supportStance: "SUPPORTS" as const,
              },
            ],
            contradictions: [
              "Certain vendor benchmarks claim 100% autonomous accuracy without human intervention, but independent replications fail to exceed 68% reliability.",
            ],
            unknowns: [
              "Long-term audience retention rates for AI-assisted technical newsletters vs purely human-written essays.",
            ],
            primarySources: [
              {
                title: "[SYNTHETIC / DEMONSTRATION DATA] Benchmark: State Machines vs Unconstrained ReAct Loops in Agent Workflows",
                url: "https://mediaos.internal/synthetic/benchmarks/fsm-vs-react-2024",
                author: "MediaOS Lab Test Environment",
                date: "2026-02-15",
                sourceType: "SYNTHETIC_BENCHMARK",
                isSynthetic: true,
                trustScore: 85,
              },
              {
                title: "Newsroom Fact-Checking & Editorial Review Gate Study 2026",
                url: "https://research.mediaos.local/reports/2026-agentic-benchmarks",
                author: "Apex Industry Lab",
                date: "2026-01-20",
                sourceType: "INDUSTRY_SURVEY",
                isSynthetic: false,
                trustScore: 92,
              },
            ],
          };
          data = ResearchOutputSchema.parse(raw);
          break;
        }

        case "STRATEGIST": {
          const raw = {
            targetReader: "Senior software engineers, technical founders, and solo media operators.",
            outcome: "Understand why deterministic systems beat open-ended chat, and how to build a resilient media pipeline.",
            centralTension: "Creators feel pressure to produce daily volume with generic chatbots, but audiences crave deeply researched, verified technical substance.",
            thesis: "The winning media companies of 2026 won't be pure humans or pure bots—they will be solo operators driving a deterministic multi-agent state machine with human-in-the-loop editorial gates.",
            whyNow: "Audiences have developed acute AI slop fatigue; authentic verified research is the rarest commodity on the internet.",
            flagshipFormat: "12-minute technical breakdown essay with YouTube video script companion",
            primaryHeadline: "Stop Using AI as a Chatbot. Build an Operating System.",
            alternativeHeadlines: [
              "How to Run a 6-Agent Media Company as a Solo Engineer",
              "The Architecture Behind High-Signal, Zero-Slop Technical Content",
            ],
            keySections: [
              {
                title: "The AI Slop Saturation Point",
                keyPoints: [
                  "Why conversational prompts fail at scale",
                  "The cost of hallucinated sources to creator reputation",
                ],
                purpose: "Establish acute problem and validate audience cynicism",
              },
              {
                title: "The 6-Agent Operating Model",
                keyPoints: [
                  "Scout, Researcher, Strategist, Writer, Distribution, Editor",
                  "Why state transitions must be enforced in the database",
                ],
                purpose: "Present the structural solution with concrete architecture",
              },
              {
                title: "The Human-in-the-Loop Safeguard",
                keyPoints: [
                  "Human signs off on irreversible actions",
                  "Brand Brain as editorial memory",
                ],
                purpose: "Provide actionable implementation principles",
              },
            ],
            distributionEntryPoints: [
              "X visual architecture diagram breakdown",
              "LinkedIn engineering leadership case study",
              "Newsletter deep-dive with code walkthrough",
            ],
          };

          // Incorporate accepted strategy recommendations from Phase 6 Learning Engine
          const acceptedRecs = (request.context.acceptedStrategyRecommendations as Array<{
            title?: string;
            recommendation?: string;
            targetPillar?: string;
            targetFormat?: string;
            actionType?: string;
          }>) || [];

          if (acceptedRecs.length > 0) {
            const recSummaries = acceptedRecs
              .map((r) => r.recommendation || r.title)
              .filter(Boolean)
              .join("; ");
            raw.thesis += ` Incorporates validated historical strategy learnings: ${recSummaries}.`;
            for (const r of acceptedRecs) {
              if (r.targetFormat) {
                raw.flagshipFormat = `Optimized ${r.targetFormat} (guided by validated historical performance learning)`;
              }
              if (r.actionType === "DOUBLE_DOWN" && r.targetPillar) {
                raw.keySections.push({
                  title: `Pillar Deep Dive: ${r.targetPillar}`,
                  keyPoints: [`Double-down directive from historical performance: ${r.recommendation || r.title}`],
                  purpose: "Directly execute human-accepted strategy recommendation",
                });
              }
            }
          }

          data = StrategyOutputSchema.parse(raw);
          break;
        }

        case "WRITER": {
          const inputPayload = (request.context.inputPayload as Record<string, unknown>) || {};
          const explicitFormat = (request.context.format as string) || (inputPayload.format as string);

          if (!explicitFormat) {
            // Backward-compatible Phase 1 generic Writer output
            const raw = {
              primaryTitle: "Stop Using AI as a Chatbot. Build an Operating System.",
              hook30s:
                "If you are still opening ChatGPT to write your content, you are fighting a losing battle. In the next 10 minutes, I'm showing you the exact architecture I use to run six specialized AI agents—with zero hallucinations.",
              scriptSections: [
                {
                  sectionName: "HOOK",
                  content:
                    "If you are still opening ChatGPT to write your content, you are fighting a losing battle against AI slop.",
                },
                {
                  sectionName: "CONTEXT",
                  content:
                    "Creators are facing immense pressure to publish high-volume content, but audiences are tired of generic, ungrounded AI chatter.",
                },
                {
                  sectionName: "PROBLEM",
                  content:
                    "The problem is unconstrained LLM loops diverge and fabricate sources without human review.",
                },
                {
                  sectionName: "CONCLUSION",
                  content:
                    "Build a deterministic multi-agent operating system with strict human-in-the-loop gates.",
                },
                {
                  sectionName: "CTA",
                  content:
                    "Clone the open-source repository below and subscribe for more deep-dives.",
                },
              ],
              fullScriptMarkdown:
                "# Stop Using AI as a Chatbot. Build an Operating System.\n\nFull script content...",
              thumbnailConcept:
                "Split screen: Messy chat prompt on left vs clean technical pipeline dashboard on right.",
              thumbnailText: "Stop Prompting. Start Engineering.",
              estimatedDurationMinutes: 10,
            };
            data = WriterOutputSchema.parse(raw);
            break;
          }

          const format = explicitFormat;
          const claims = (request.context.relevantClaims as Array<{ id: string; claimText: string }>) || [];
          const firstClaimId = claims[0]?.id;
          const secondClaimId = claims[1]?.id;

          if (format === "YOUTUBE_LONG_FORM") {
            const raw = {
              title: "Stop Using AI as a Chatbot. Build an Operating System.",
              hook: "If you are still opening ChatGPT to write your content, you are fighting a losing battle against AI slop. In the next 10 minutes, I'm showing you the exact architecture I use to run six specialized AI agents—with zero hallucinations and complete editorial control.",
              promise: "By the end of this video, you will have the complete blueprint to build a deterministic multi-agent state machine with human-in-the-loop editorial gates.",
              context: "Creators are facing immense pressure to publish high-volume content, but audiences are tired of generic, ungrounded AI chatter.",
              chapters: [
                {
                  chapterNumber: 1,
                  title: "The AI Slop Saturation Point",
                  narration: "Most creators use AI like a novelty toy. They ask a chatbot for ideas and get generic lists. The fundamental flaw is that chatbots have no memory and no verification layer.",
                  examples: "Look at standard chatbot workflows: divergence increases with every unconstrained loop.",
                  evidenceMoments: firstClaimId ? [
                    {
                      claimId: firstClaimId,
                      statement: "Multi-agent systems using state machines reduce loop divergence by 74% compared to unconstrained ReAct loops.",
                      statementType: "FACT" as const,
                      citation: "Apex Systems Benchmark 2026",
                    },
                  ] : [],
                  transition: "So how do we solve this? Let's look at the 6-agent operating model.",
                },
                {
                  chapterNumber: 2,
                  title: "The 6-Agent Operating Model",
                  narration: "Instead of one massive prompt, MediaOS breaks down production into discrete states: Discovery, Research, Strategy, Creation, Review, and Approval.",
                  examples: "The Evidence Researcher maps claims and links primary sources before drafting can begin.",
                  evidenceMoments: secondClaimId ? [
                    {
                      claimId: secondClaimId,
                      statement: "Human-in-the-loop editorial gates prevent hallucinated citations from reaching production publications.",
                      statementType: "FACT" as const,
                      citation: "Newsroom Fact-Checking Study 2026",
                    },
                  ] : [],
                  transition: "Now let's examine the critical human safeguard.",
                },
                {
                  chapterNumber: 3,
                  title: "The Human-in-the-Loop Safeguard",
                  narration: "The future doesn't belong to pure bots or pure humans. It belongs to the Centaur Creator who directs high-precision AI workers with strict approval gates.",
                  examples: "No content is ever published without explicit human approval.",
                  evidenceMoments: [],
                  transition: "Here is how you can implement this architecture today.",
                },
              ],
              conclusion: "Stop treating AI like a chatbot. Build an operating system that tracks evidence, enforces state transitions, and preserves your editorial reputation.",
              cta: "Clone the open-source MediaOS repository below and subscribe for the complete architecture deep-dive.",
              estimatedDurationMinutes: 10,
              thumbnailConcept: "Split screen: Messy chat prompt on left vs clean technical pipeline dashboard on right with green '100% Grounded' badge.",
            };
            data = YouTubeLongFormOutputSchema.parse(raw);
          } else if (format === "YOUTUBE_SHORT") {
            const raw = {
              title: "Why Chatbots Fail for Content Creators",
              hook: "Stop using ChatGPT to write your video scripts! Here is why:",
              body: "Unconstrained chat loops diverge and hallucinate citations. In production benchmarks, state machines reduce loop divergence by 74% and stop hallucinated claims before publishing.",
              payoff: "Build a deterministic state machine where every claim is backed by verified evidence before drafting.",
              cta: "Subscribe to MediaOS for the complete engineering breakdown.",
              targetDurationSeconds: 45,
              evidenceMoments: firstClaimId ? [
                {
                  claimId: firstClaimId,
                  statement: "State machines reduce loop divergence by 74%.",
                  statementType: "FACT" as const,
                },
              ] : [],
            };
            data = YouTubeShortOutputSchema.parse(raw);
          } else if (format === "NEWSLETTER") {
            const raw = {
              subject: "Stop Using AI as a Chatbot. Build an Operating System.",
              previewText: "Why the Centaur Creator model beats open-ended conversational prompts every single time.",
              opening: "Hey creators — if your audience is developing acute AI slop fatigue, you are not alone.",
              sections: [
                {
                  title: "The Illusion of Chatbot Speed",
                  content: "In 2024, everyone wanted speed. In 2026, everyone wants signal. Unconstrained conversational prompts decay over iterations and produce hallucinated citations.",
                  evidenceMoments: firstClaimId ? [
                    {
                      claimId: firstClaimId,
                      statement: "Multi-agent systems using state machines reduce loop divergence by 74% compared to unconstrained ReAct loops.",
                      statementType: "FACT" as const,
                    },
                  ] : [],
                },
                {
                  title: "The Centaur Media Company",
                  content: "By enforcing state transitions in a database and keeping human review mandatory, automated review gates prevent hallucinated citations from reaching production.",
                  evidenceMoments: secondClaimId ? [
                    {
                      claimId: secondClaimId,
                      statement: "Human-in-the-loop editorial gates prevent hallucinated citations from reaching production publications.",
                      statementType: "FACT" as const,
                    },
                  ] : [],
                },
              ],
              closing: "Build systems, not prompts. Until next week,\n— The MediaOS Engineering Team",
              cta: "Read the full case study on our technical engineering blog.",
            };
            data = NewsletterOutputSchema.parse(raw);
          } else if (format === "X_THREAD") {
            const raw = {
              threadHook: "Most creators use AI like a calculator when they need an operating system. Here is how a 6-agent state machine replaces 20 hours of fragmented drafting (1/5):",
              posts: [
                {
                  postNumber: 1,
                  text: "1/5 The fundamental problem with AI chatbots isn't the model—it's the missing database state. Chatbots have no memory and no evidence verification layer.",
                  claimIds: [],
                },
                {
                  postNumber: 2,
                  text: "2/5 Multi-agent systems using state machines reduce loop divergence by 74% compared to unconstrained ReAct loops.",
                  claimIds: firstClaimId ? [firstClaimId] : [],
                },
                {
                  postNumber: 3,
                  text: "3/5 Human-in-the-loop editorial gates prevent hallucinated citations from reaching production publications.",
                  claimIds: secondClaimId ? [secondClaimId] : [],
                },
                {
                  postNumber: 4,
                  text: "4/5 The 6 roles: Signal Scout, Evidence Researcher, Content Strategist, Format Writer, Distribution Agent, Editorial Reviewer.",
                  claimIds: [],
                },
                {
                  postNumber: 5,
                  text: "5/5 Stop prompting in a vacuum. Clone the open-source MediaOS architecture and build your media operating system today.",
                  claimIds: [],
                },
              ],
              cta: "Follow @MediaOS for daily agentic systems engineering breakdowns.",
            };
            data = XThreadOutputSchema.parse(raw);
          } else if (format === "LINKEDIN_POST") {
            const raw = {
              hook: "Why we killed the 'AI Copywriter' and replaced it with a 6-Agent State Machine:",
              body: [
                "In 2024, everyone wanted generative speed.",
                "In 2026, audiences crave verified signal.",
                "When we structured our content pipeline into discrete states (Discovery -> Research -> Strategy -> Creation -> Review -> Approval), our verification speed jumped 3x while hallucinated citations dropped to zero.",
                "Multi-agent systems using state machines reduce loop divergence by 74% compared to unconstrained ReAct loops.",
                "The takeaway: The winning media companies won't be pure humans or pure bots—they will be solo operators orchestrating a deterministic multi-agent state machine.",
              ],
              evidenceCallout: "Backed by 2026 newsroom deployment benchmark across 150 technical publications.",
              takeaway: "The Centaur Creator architecture wins on retention and substance.",
              cta: "Have you integrated state machines into your AI workflows? Drop your perspective in the comments.",
            };
            data = LinkedInOutputSchema.parse(raw);
          } else {
            // Legacy generic writer output
            const raw = {
              primaryTitle: "Stop Using AI as a Chatbot. Build an Operating System.",
              hook30s: "If you are still opening ChatGPT to write your content, you are fighting a losing battle against AI slop.",
              scriptSections: [
                {
                  sectionName: "HOOK" as const,
                  content: "Most creators use AI like a novelty toy.",
                },
                {
                  sectionName: "EXPLANATION" as const,
                  content: "Enter MediaOS: a deterministic operating system.",
                },
              ],
              fullScriptMarkdown: `# Stop Using AI as a Chatbot.\n\nBuild an Operating System.`,
              thumbnailConcept: "Split screen concept.",
              thumbnailText: "CHATBOT VS OS",
              estimatedDurationMinutes: 8,
            };
            data = WriterOutputSchema.parse(raw);
          }
          break;
        }

        case "DISTRIBUTION": {
          const raw = {
            xPost: "Most creators use AI like a calculator when they need a database. Here is how a 6-agent state machine replaces 20 hours of fragmented drafting:",
            xThread: [
              "1/7 Most creators use AI like a calculator when they need an operating system. Here is the breakdown:",
              "2/7 Problem: Chatbots have no persistent memory and hallucinate without consequence.",
              "3/7 Solution: 6 specialized roles operating on a single Brand Brain database.",
              "4/7 Step 1: Signal Scout scores opportunities before you waste 5 hours.",
              "5/7 Step 2: Evidence Researcher verifies primary sources and maps claims.",
              "6/7 Step 3: Human signs off on every irreversible step.",
              "7/7 The full architecture is open source in MediaOS. Link below.",
            ],
            linkedInPost: "Why we killed the 'AI Copywriter' and replaced it with a 6-Agent State Machine:\n\nIn 2024, everyone wanted speed.\nIn 2026, everyone wants signal.\n\nWhen we structured our content pipeline into discrete states (Discovery -> Research -> Strategy -> Review -> Approval), our verification speed jumped 3x while hallucinated claims dropped to zero.\n\nHere are the 3 engineering principles we learned...",
            newsletterExcerpt: "In this week's technical deep-dive, we break down why unconstrained conversational agents diverge, and how strict state machine transitions keep multi-agent systems rock-solid in production.",
            shortsConcept: "Show a creator typing furiously into a chatbot and getting generic text, then pan to MediaOS executing a 6-stage pipeline with one click and instant source links.",
          };
          data = DistributionOutputSchema.parse(raw);
          break;
        }

        case "EDITOR": {
          if (
            request.context.isStructuredReview ||
            request.context.assetId ||
            request.context.reviewMode === "STRUCTURED"
          ) {
            const blocks = (request.context.blocks as Array<{
              id?: string;
              blockType?: string;
              content?: string;
              unsupportedFlag?: boolean;
            }>) || [];
            const claims = (request.context.campaignClaims as Array<{
              id: string;
              claimText: string;
              verificationStatus: string;
            }>) || [];
            const brandVoice = request.context.brandVoice as {
              forbiddenWords?: string;
            } | null;

            const findings: Array<{
              category: "EVIDENCE_INTEGRITY" | "BRAND_VOICE" | "EDITORIAL_QUALITY" | "FORMAT_COMPLIANCE";
              severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
              blockId?: string;
              claimId?: string;
              description: string;
              evidence?: string;
              recommendation: string;
              requiresRevision: boolean;
            }> = [];

            // Check forbidden words
            if (brandVoice?.forbiddenWords) {
              const forbiddenList = brandVoice.forbiddenWords
                .split(",")
                .map((w) => w.trim().toLowerCase())
                .filter(Boolean);

              for (const block of blocks) {
                const contentLower = (block.content || "").toLowerCase();
                for (const word of forbiddenList) {
                  if (contentLower.includes(word)) {
                    findings.push({
                      category: "BRAND_VOICE",
                      severity: "ERROR",
                      blockId: block.id,
                      description: `Block contains forbidden buzzword: "${word}".`,
                      recommendation: `Remove or replace "${word}" with precise, technical terminology.`,
                      requiresRevision: true,
                    });
                  }
                }
              }
            }

            // Check contradicted claims or unsupported flags
            for (const block of blocks) {
              if (block.unsupportedFlag) {
                findings.push({
                  category: "EVIDENCE_INTEGRITY",
                  severity: "ERROR",
                  blockId: block.id,
                  description: `Block is flagged as unsupported factual claim.`,
                  recommendation: "Ground this statement with verified primary source evidence or rephrase as inference/opinion.",
                  requiresRevision: true,
                });
              }
            }

            const claimReferences = (request.context.claimReferences as Array<{
              id: string;
              claimId: string;
              claimText?: string;
              verificationStatus?: string;
            }>) || [];

            for (const cr of claimReferences) {
              if (cr.verificationStatus === "CONTRADICTED") {
                findings.push({
                  category: "EVIDENCE_INTEGRITY",
                  severity: "CRITICAL",
                  claimId: cr.claimId,
                  description: `Claim "${(cr.claimText || "").slice(0, 60)}..." is marked as CONTRADICTED by retrieved evidence.`,
                  recommendation: "Acknowledge the contradiction explicitly or remove the disputed statement.",
                  requiresRevision: true,
                });
              }
            }

            // Check format compliance
            const assetType = (request.context.assetType as string) || "";
            if (assetType === "X_THREAD") {
              for (const block of blocks) {
                if ((block.content || "").length > 280) {
                  findings.push({
                    category: "FORMAT_COMPLIANCE",
                    severity: "ERROR",
                    blockId: block.id,
                    description: `Tweet block exceeds Twitter 280 character limit (${(block.content || "").length} chars).`,
                    recommendation: "Shorten tweet to under 280 characters.",
                    requiresRevision: true,
                  });
                }
              }
            }

            const hasBlockers = findings.some(
              (f) => f.severity === "ERROR" || f.severity === "CRITICAL"
            );

            if (!hasBlockers && findings.length === 0) {
              findings.push({
                category: "EVIDENCE_INTEGRITY",
                severity: "INFO",
                description: "All factual statements are grounded in verified evidence with direct citations.",
                recommendation: "Maintain this evidence density in downstream derivatives.",
                requiresRevision: false,
              });
            }

            const revisionInstructions = findings
              .filter((f) => f.requiresRevision)
              .map((f) => ({
                blockId: f.blockId,
                instruction: f.recommendation,
                category: f.category,
                severity: f.severity,
              }));

            const verdict = hasBlockers ? ("REQUEST_REVISION" as const) : ("PASS" as const);
            const overallScore = hasBlockers ? 68 : 95;

            const structuredData = {
              verdict,
              scores: {
                evidenceScore: hasBlockers ? 60 : 96,
                brandScore: hasBlockers ? 70 : 94,
                qualityScore: 90,
                formatScore: hasBlockers ? 75 : 98,
                overallScore,
              },
              summary: hasBlockers
                ? "Editorial review identified issues requiring revision before publication can be considered."
                : "Exemplary adherence to Brand Brain voice and Evidence Graph integrity. Ready for human sign-off.",
              findings,
              revisionInstructions,
            };

            data = EditorialReviewOutputSchema.parse(structuredData);
            break;
          }

          // Legacy Phase 1 Editor Output
          const raw = {
            verdict: "APPROVE" as const,
            overallScore: 95,
            summary: "Exemplary adherence to Brand Brain tone and evidence requirements. All claims link to verified primary sources. Hook pacing is crisp.",
            issues: [
              {
                severity: "SUGGESTION" as const,
                ruleCategory: "PACING",
                description: "The demonstration section could highlight the exact database schema earlier.",
                suggestedFix: "Move the state transition diagram up by 15 seconds.",
              },
            ],
          };
          data = EditorOutputSchema.parse(raw);
          break;
        }

        case "LEARNING_ENGINE": {
          const inputPayload = (request.context.inputPayload as Record<string, unknown>) || {};
          const sampleSize = typeof inputPayload.sampleSize === "number" ? inputPayload.sampleSize : 4;
          const hasPassedStatisticalTest = inputPayload.hasPassedStatisticalTest === true;

          // Rule 1: Sample size alone is never statistical significance
          // N < 3 -> ANECDOTAL
          // 3 <= N < 10 -> DIRECTIONAL
          // N >= 10 -> ELIGIBLE_FOR_TESTING (unless actual statistical test passed)
          let significance: "ANECDOTAL" | "DIRECTIONAL" | "ELIGIBLE_FOR_TESTING" | "STATISTICALLY_SIGNIFICANT";
          if (sampleSize < 3) {
            significance = "ANECDOTAL";
          } else if (sampleSize >= 10) {
            significance = hasPassedStatisticalTest ? "STATISTICALLY_SIGNIFICANT" : "ELIGIBLE_FOR_TESTING";
          } else {
            significance = "DIRECTIONAL";
          }

          const confidenceScore =
            significance === "ANECDOTAL" ? 35 : significance === "STATISTICALLY_SIGNIFICANT" ? 92 : 65;

          const sampleSizeLimitation =
            sampleSize < 3
              ? "Sample size is strictly anecdotal (N < 3). Findings must not be treated as empirical proof. "
              : sampleSize < 10
              ? `Sample size is directional (N = ${sampleSize}). Preliminary trend subject to sample variance. `
              : hasPassedStatisticalTest
              ? `Empirical statistical test confirmed significance (p < 0.05, N = ${sampleSize}). `
              : `Sample size qualifies for statistical testing (N = ${sampleSize}), but no hypothesis test has confirmed significance. Treat as preliminary. `;

          const raw = {
            overviewSummary: `Analyzed ${sampleSize} historical content assets across platforms. Evaluated engagement, CTR, retention, and conversion patterns.`,
            totalAssetsAnalyzed: sampleSize,
            learnings: [
              {
                category: "FORMAT" as const,
                sentiment: "WINNING" as const,
                observation:
                  "YouTube Long-Form assets focused on architectural breakdowns achieve 2.4x higher average retention than generic summaries.",
                hypothesis:
                  "Technical audiences strongly prefer concrete code and state-machine schematics over high-level conceptual discussions.",
                sampleSize,
                confidenceScore,
                statisticalSignificance: significance,
                supportingMetrics: { avgRetention: 0.58, baselineRetention: 0.24, sampleSize },
                limitations:
                  sampleSizeLimitation + "External validity depends on technical niche.",
                recommendation: {
                  title: "Double Down on Technical Architecture Walkthroughs",
                  actionType: "DOUBLE_DOWN" as const,
                  guidance:
                    "Prioritize YouTube Long-Form format with full system diagrams and explicit state transitions for upcoming campaigns.",
                  targetFormat: "YOUTUBE_LONG_FORM",
                  targetPillar: "Architecture & Systems",
                },
              },
              {
                category: "HOOK" as const,
                sentiment: "WEAK" as const,
                observation:
                  "Question-based hooks exhibited a 42% lower CTR compared to tension-based declarative hooks.",
                hypothesis:
                  "Passive questions fail to signal authority; declarative tension hooks promise clear empirical answers.",
                sampleSize,
                confidenceScore: Math.min(confidenceScore, 65),
                statisticalSignificance: significance,
                supportingMetrics: { questionHookCtr: 0.021, declarativeHookCtr: 0.054, sampleSize },
                limitations:
                  sampleSizeLimitation +
                  "Confounded by variations in thumbnail imagery, publishing time of day, and audience segment familiarity.",
                recommendation: {
                  title: "Eliminate Passive Question Hooks",
                  actionType: "MODIFY_HOOK" as const,
                  guidance:
                    "Frame flagship hooks around acute industry tension rather than rhetorical questions.",
                  targetFormat: "YOUTUBE_LONG_FORM",
                },
              },
            ],
          };
          data = LearningEngineOutputSchema.parse(raw);
          break;
        }

        default:
          throw new Error(`Unsupported agent type: ${request.agentType}`);
      }

      const durationMs = Date.now() - startTime + 80; // simulate realistic fast execution
      return {
        success: true,
        data,
        rawJson: JSON.stringify(data),
        provider: "mock",
        model: "mock-mediaos-v1",
        promptVersion,
        inputTokens: 420,
        outputTokens: 380,
        estimatedCostUsd: 0.0,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        provider: "mock",
        model: "mock-mediaos-v1",
        promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0.0,
        durationMs,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
