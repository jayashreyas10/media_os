import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting MediaOS database seed...");

  // Clean existing demo data if re-running
  const existingUser = await prisma.user.findUnique({
    where: { email: "operator@mediaos.local" },
  });

  if (existingUser) {
    console.log("Cleaning previous demo seed data...");
    await prisma.user.delete({
      where: { id: existingUser.id },
    });
  }

  // 1. Create Demo Operator User
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const user = await prisma.user.create({
    data: {
      email: "operator@mediaos.local",
      name: "Alex Vance",
      passwordHash,
      role: "OWNER",
    },
  });
  console.log(`✓ Created User: ${user.email} (pass: Password123!)`);

  // 2. Create Demo Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: "Apex Media Lab",
      slug: "apex-media-lab",
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
    },
  });
  console.log(`✓ Created Workspace: ${workspace.name}`);

  // 3. Create AI Provider Config
  await prisma.aIProviderConfig.create({
    data: {
      workspaceId: workspace.id,
      providerName: "mock",
      modelName: "mock-mediaos-v1",
      isDefault: true,
      maxDailyCost: 50.0,
      currentDailyCost: 0.0,
    },
  });

  // 4. Create Demo Brand & Comprehensive Brand Brain
  const brand = await prisma.brand.create({
    data: {
      workspaceId: workspace.id,
      name: "TechOperator Media",
      slug: "techoperator-media",
      tagline: "High-Signal Autonomous Media Systems",
      description: "Technical media network for senior engineers and solo operators.",
      isDefault: true,
      identity: {
        create: {
          mission: "Publish high-signal, zero-slop technical insights backed by verifiable evidence.",
          vision: "Empower solo operators to out-produce legacy editorial rooms through deterministic AI agents.",
          positioning: "The authoritative engineering authority on agentic automation and production architectures.",
          values: "Evidence over confidence, Human in the loop, Determinism over conversational drift, Zero slop",
        },
      },
      audience: {
        create: {
          targetAudience: "Senior software engineers, technical founders, and solo media operators building high-output media engines.",
          painPoints: "Acute AI slop fatigue; lack of time to fact-check sources; fragmented content creation tools.",
          desires: "Clear mental models, actionable architectures, verifiable benchmark data, repeatable execution systems.",
          objections: "AI-generated content is usually shallow, inaccurate, hallucinated, or unoriginal.",
        },
      },
      voice: {
        create: {
          tone: "Direct, technical, analytical, authoritative, grounded, zero-fluff.",
          styleGuidelines: "Lead with the stakes. Use concrete nouns and architecture diagrams. Clearly distinguish fact from inference.",
          forbiddenWords: "delve, game-changer, revolutionary, supercharge, leverage, unleash, landscape, bespoke",
          signaturePhrases: "Build systems, not scripts; Evidence over confidence; The Centaur Operator; Deterministic by design",
        },
      },
      pillars: {
        create: [
          {
            name: "Agentic Engineering & Architecture",
            description: "Deep-dives into state machines, sandboxing, tool use, and multi-agent coordination.",
            priority: 1,
            weight: 35,
          },
          {
            name: "Solo Media Company Economics",
            description: "How one-person media companies generate outsized influence and revenue with modern toolchains.",
            priority: 2,
            weight: 30,
          },
          {
            name: "Fact-Checked Technical Breakdowns",
            description: "Rigorous analysis of real papers, benchmarks, and infrastructure postmortems.",
            priority: 3,
            weight: 35,
          },
        ],
      },
      goals: {
        create: [
          {
            objective: "Establish #1 authority in deterministic agentic workflows",
            keyResult: "Publish 24 verified flagship essays with >60% average retention",
            targetDate: "2026-12-31",
            status: "ACTIVE",
          },
          {
            objective: "Build 50,000 subscriber technical developer newsletter",
            keyResult: "Maintain >45% open rate with zero unsubscribes due to factual inaccuracies",
            targetDate: "2026-06-30",
            status: "ACTIVE",
          },
        ],
      },
      offers: {
        create: [
          {
            name: "The MediaOS Blueprint",
            valueProposition: "Complete production-grade codebase and architectural playbook for running a 6-agent media studio.",
            targetSegment: "Technical founders & creators",
            pricingModel: "Open Core / Enterprise Advisory",
          },
        ],
      },
      proofs: {
        create: [
          {
            claim: "Deterministic state machines reduce multi-agent loop divergence by 74%.",
            evidenceSnippet: "Measured across 500 complex generation benchmarks with formal finite-state constraints.",
            sourceUrl: "https://arxiv.org/abs/2402.12345",
            verificationStatus: "VERIFIED",
          },
          {
            claim: "Human-in-the-loop review catches 99% of hallucinated citations prior to publishing.",
            evidenceSnippet: "143 hallucinations intercepted across 150 test articles in controlled editorial trials.",
            sourceUrl: "https://research.mediaos.local/reports/2026-agentic-benchmarks",
            verificationStatus: "VERIFIED",
          },
        ],
      },
      editorialRules: {
        create: [
          {
            rule: "Every factual claim must cite a verified primary source or research benchmark.",
            category: "FACT_CHECKING",
            severity: "CRITICAL",
            rationale: "Unverified claims destroy brand authority and audience trust.",
          },
          {
            rule: "Never use forbidden buzzwords (delve, revolutionize, supercharge, game-changer).",
            category: "TONE",
            severity: "WARNING",
            rationale: "Empty buzzwords trigger audience AI-fatigue alarms.",
          },
          {
            rule: "Opening hook must demonstrate real stakes within the first 30 seconds.",
            category: "FORMAT",
            severity: "WARNING",
            rationale: "Technical audiences leave immediately if value proposition is delayed.",
          },
        ],
      },
    },
  });
  console.log(`✓ Created Brand & Brand Brain: ${brand.name}`);

  // 5. Create Demo Campaign
  const campaign = await prisma.campaign.create({
    data: {
      brandId: brand.id,
      title: "Autonomous Media Pipelines: How to Run a 6-Agent Production Studio",
      slug: "autonomous-media-pipelines-6-agent-studio",
      stage: "RESEARCH",
      priority: "HIGH",
      brief: "A definitive technical guide and video essay explaining how deterministic state machines replace unreliable chatbot prompts in modern media production.",
      isDemo: true,
      targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      stageHistory: {
        create: [
          {
            fromStage: "NONE",
            toStage: "DISCOVERY",
            reason: "Initial campaign creation (Demo seed)",
            transitionedById: user.id,
          },
          {
            fromStage: "DISCOVERY",
            toStage: "RESEARCH",
            reason: "Approved Signal Scout opportunity: State machine agents over open chat",
            transitionedById: user.id,
          },
        ],
      },
    },
  });
  console.log(`✓ Created Demo Campaign: ${campaign.title} (Stage: ${campaign.stage})`);

  // 6. Create Seed Tasks
  const task1 = await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      campaignId: campaign.id,
      taskType: "SIGNAL_SCOUT",
      agentName: "Signal Scout",
      status: "COMPLETED",
      priority: "HIGH",
      inputJson: JSON.stringify({ focus: "Agentic workflows and media automation" }),
      outputJson: JSON.stringify({
        scoutSummary: "Discovered acute market shift toward state-machine driven agents.",
        recommendedSignalIndex: 0,
        signals: [
          {
            title: "Shift from Prompt Engineering to Agentic Determinism",
            opportunityScore: 9,
            audienceRelevance: 9,
            urgency: "HIGH",
            whyNow: "Teams are discarding unreliable autonomous loops for deterministic state machines.",
          },
        ],
      }),
      startedAt: new Date(Date.now() - 3600 * 1000),
      completedAt: new Date(Date.now() - 3590 * 1000),
      attempts: {
        create: {
          attemptNumber: 1,
          status: "SUCCESS",
          durationMs: 820,
        },
      },
      agentRuns: {
        create: {
          agentName: "Signal Scout",
          provider: "mock",
          model: "mock-mediaos-v1",
          promptVersion: "v1.0",
          inputTokens: 420,
          outputTokens: 290,
          estimatedCostUsd: 0.0,
          durationMs: 820,
          status: "SUCCESS",
        },
      },
    },
  });

  const task2 = await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      campaignId: campaign.id,
      taskType: "RESEARCHER",
      agentName: "Researcher",
      status: "QUEUED",
      priority: "NORMAL",
      inputJson: JSON.stringify({
        signalTitle: "Shift from Prompt Engineering to Agentic Determinism",
      }),
      attempts: {
        create: [],
      },
    },
  });
  console.log(`✓ Seeded Tasks: Completed (#${task1.id.slice(0, 8)}) and Queued (#${task2.id.slice(0, 8)})`);

  // 7. Create Audit Log
  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      action: "DEMO_ENVIRONMENT_INITIALIZED",
      entityType: "Workspace",
      entityId: workspace.id,
      detailsJson: JSON.stringify({ seed: true, timestamp: new Date().toISOString() }),
    },
  });

  console.log("🎉 MediaOS seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
