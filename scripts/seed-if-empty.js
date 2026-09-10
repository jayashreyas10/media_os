const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function seedIfEmpty() {
  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log(`[seed-if-empty] Database already has ${userCount} user(s). Skipping initial seed.`);
      return;
    }

    console.log("[seed-if-empty] Database is empty. Seeding default demo operator...");
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const user = await prisma.user.create({
      data: {
        email: "operator@mediaos.local",
        name: "Alex Vance",
        passwordHash,
        role: "OWNER",
      },
    });

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

    await prisma.brand.create({
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
      },
    });

    console.log("[seed-if-empty] Successfully seeded demo operator (operator@mediaos.local / Password123!)");
  } catch (err) {
    console.warn("[seed-if-empty] Seed check non-blocking warning:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedIfEmpty();
