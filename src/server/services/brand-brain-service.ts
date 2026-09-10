import prisma from "../db/prisma";

export class BrandBrainService {
  /**
   * Fetch complete Brand Brain package for a brand or workspace.
   */
  static async getBrandBrain(arg1: string, arg2?: string) {
    const brandId = arg2 || arg1;
    let brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        identity: true,
        audience: true,
        voice: true,
        pillars: { orderBy: { priority: "asc" } },
        goals: { orderBy: { targetDate: "asc" } },
        offers: true,
        proofs: true,
        editorialRules: { orderBy: { severity: "desc" } },
      },
    });

    if (!brand && arg1) {
      brand = await prisma.brand.findFirst({
        where: { workspaceId: arg1 },
        include: {
          identity: true,
          audience: true,
          voice: true,
          pillars: { orderBy: { priority: "asc" } },
          goals: { orderBy: { targetDate: "asc" } },
          offers: true,
          proofs: true,
          editorialRules: { orderBy: { severity: "desc" } },
        },
      });
    }

    if (!brand) {
      throw new Error(`Brand ${brandId} not found`);
    }

    return {
      brand,
      identity: brand.identity,
      audience: brand.audience,
      voice: brand.voice,
      contentPillars: brand.pillars,
      pillars: brand.pillars,
      editorialRules: brand.editorialRules,
      goals: brand.goals,
      offers: brand.offers,
      proofs: brand.proofs,
    };
  }

  /**
   * Update core Identity, Audience, or Voice.
   */
  static async updateIdentity(
    brandId: string,
    data: { mission: string; vision?: string; positioning: string; values: string }
  ) {
    return await prisma.brandIdentity.upsert({
      where: { brandId },
      update: data,
      create: { ...data, brandId },
    });
  }

  static async updateAudience(
    brandId: string,
    data: { targetAudience: string; painPoints: string; desires: string; objections: string }
  ) {
    return await prisma.audienceProfile.upsert({
      where: { brandId },
      update: data,
      create: { ...data, brandId },
    });
  }

  static async updateVoice(
    brandId: string,
    data: { tone: string; styleGuidelines: string; forbiddenWords: string; signaturePhrases: string }
  ) {
    return await prisma.brandVoice.upsert({
      where: { brandId },
      update: data,
      create: { ...data, brandId },
    });
  }

  /**
   * Pillar operations
   */
  static async addPillar(
    brandId: string,
    name: string,
    description: string,
    priority: number = 1,
    weight: number = 25
  ) {
    return await prisma.contentPillar.create({
      data: { brandId, name, description, priority, weight },
    });
  }

  static async createContentPillar(data: {
    workspaceId?: string;
    brandId?: string;
    name: string;
    description: string;
    targetRatio?: number;
    priority?: number;
  }) {
    let brandId = data.brandId;
    if (!brandId && data.workspaceId) {
      const b = await prisma.brand.findFirst({ where: { workspaceId: data.workspaceId } });
      brandId = b?.id;
    }
    if (!brandId) throw new Error("brandId required for content pillar");
    return await this.addPillar(
      brandId,
      data.name,
      data.description,
      data.priority || 1,
      data.targetRatio || 25
    );
  }

  static async deletePillar(pillarId: string, brandId?: string) {
    if (brandId) {
      const item = await prisma.contentPillar.findFirst({
        where: { id: pillarId, brandId },
      });
      if (!item) throw new Error(`Content pillar ${pillarId} not found in brand`);
    }
    return await prisma.contentPillar.delete({
      where: { id: pillarId },
    });
  }

  /**
   * Editorial Rules
   */
  static async addEditorialRule(
    brandId: string,
    rule: string,
    category: string,
    severity: string = "WARNING",
    rationale?: string
  ) {
    return await prisma.editorialRule.create({
      data: { brandId, rule, category, severity, rationale },
    });
  }

  static async createEditorialRule(data: {
    workspaceId?: string;
    brandId?: string;
    rule: string;
    category?: string;
    severity?: string;
    rationale?: string;
  }) {
    let brandId = data.brandId;
    if (!brandId && data.workspaceId) {
      const b = await prisma.brand.findFirst({ where: { workspaceId: data.workspaceId } });
      brandId = b?.id;
    }
    if (!brandId) throw new Error("brandId required for editorial rule");
    return await this.addEditorialRule(
      brandId,
      data.rule,
      data.category || "GENERAL",
      data.severity || "WARNING",
      data.rationale
    );
  }

  static async deleteEditorialRule(ruleId: string, brandId?: string) {
    if (brandId) {
      const item = await prisma.editorialRule.findFirst({
        where: { id: ruleId, brandId },
      });
      if (!item) throw new Error(`Editorial rule ${ruleId} not found in brand`);
    }
    return await prisma.editorialRule.delete({
      where: { id: ruleId },
    });
  }

  static async updateAudienceProfile(
    workspaceIdOrBrandId: string,
    data: {
      primaryPersona?: string;
      targetAudience?: string;
      painPoints?: string;
      desires?: string;
      objections?: string;
      technicalLevel?: string;
    }
  ) {
    let brand = await prisma.brand.findUnique({ where: { id: workspaceIdOrBrandId } });
    if (!brand) {
      brand = await prisma.brand.findFirst({ where: { workspaceId: workspaceIdOrBrandId } });
    }
    if (!brand) throw new Error("Brand not found");

    return await this.updateAudience(brand.id, {
      targetAudience: data.primaryPersona || data.targetAudience || "Advanced Developers & Founders",
      painPoints: data.painPoints || "Unreliable workflows and high API costs",
      desires: data.desires || "Deterministic autonomous media pipelines",
      objections: data.objections || "AI outputs can hallucinate or loop",
    });
  }

  /**
   * Proof claims
   */
  static async addProof(brandId: string, claim: string, evidenceSnippet: string, sourceUrl?: string) {
    return await prisma.proof.create({
      data: { brandId, claim, evidenceSnippet, sourceUrl, verificationStatus: "VERIFIED" },
    });
  }

  static async deleteProof(proofId: string, brandId?: string) {
    if (brandId) {
      const item = await prisma.proof.findFirst({
        where: { id: proofId, brandId },
      });
      if (!item) throw new Error(`Proof ${proofId} not found in brand`);
    }
    return await prisma.proof.delete({
      where: { id: proofId },
    });
  }
}
