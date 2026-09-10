import { z } from "zod";

// 1. Signal Scout Output Schema
export const SignalScoutOutputSchema = z.object({
  signals: z.array(
    z.object({
      title: z.string().min(3),
      event: z.string().min(5),
      whyNow: z.string().min(5),
      audienceRelevance: z.number().min(1).max(10),
      opportunityScore: z.number().min(1).max(10),
      urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
      suggestedAngle: z.string().min(5),
      rejectionReason: z.string().optional(),
    })
  ).min(1),
  recommendedSignalIndex: z.number().default(0),
  scoutSummary: z.string(),
});
export type SignalScoutOutput = z.infer<typeof SignalScoutOutputSchema>;

// 2. Researcher Output Schema
export const ResearchOutputSchema = z.object({
  summary: z.string().min(10),
  claims: z.array(
    z.object({
      claimText: z.string(),
      confidence: z.number().min(0).max(100),
      evidenceSnippet: z.string(),
      sourceUrl: z.string(),
      isFact: z.boolean(),
      supportStance: z
        .enum(["SUPPORTS", "CONTRADICTS", "CONTEXTUALIZES", "DOES_NOT_SUPPORT"])
        .default("SUPPORTS"),
    })
  ).min(1),
  contradictions: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  primarySources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      author: z.string().optional(),
      date: z.string().optional(),
      sourceType: z.string().optional(),
      isSynthetic: z.boolean().default(false),
      trustScore: z.number().min(1).max(100).optional(),
    })
  ),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// 3. Strategist Output Schema
export const StrategyOutputSchema = z.object({
  targetReader: z.string(),
  outcome: z.string(),
  centralTension: z.string(),
  thesis: z.string(),
  whyNow: z.string(),
  flagshipFormat: z.string(),
  primaryHeadline: z.string(),
  alternativeHeadlines: z.array(z.string()),
  keySections: z.array(
    z.object({
      title: z.string(),
      keyPoints: z.array(z.string()),
      purpose: z.string(),
    })
  ),
  distributionEntryPoints: z.array(z.string()),
});
export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;

// 4. Generic Writer Output Schema (Legacy)
export const WriterOutputSchema = z.object({
  primaryTitle: z.string(),
  hook30s: z.string(),
  scriptSections: z.array(
    z.object({
      sectionName: z.enum([
        "HOOK",
        "CONTEXT",
        "PROBLEM",
        "STAKES",
        "EXPLANATION",
        "EXAMPLES",
        "DEMONSTRATION",
        "INSIGHT",
        "CONCLUSION",
        "CTA",
      ]),
      content: z.string(),
    })
  ),
  fullScriptMarkdown: z.string(),
  thumbnailConcept: z.string(),
  thumbnailText: z.string(),
  estimatedDurationMinutes: z.number(),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

// Phase 4 Format-Specific Output Schemas
export const EvidenceMomentSchema = z.object({
  claimId: z.string().optional(),
  statement: z.string(),
  statementType: z.enum(["FACT", "INFERENCE", "OPINION", "RECOMMENDATION"]).default("FACT"),
  citation: z.string().optional(),
});
export type EvidenceMoment = z.infer<typeof EvidenceMomentSchema>;

export const YouTubeLongFormOutputSchema = z.object({
  title: z.string(),
  hook: z.string(),
  promise: z.string(),
  context: z.string(),
  chapters: z.array(
    z.object({
      chapterNumber: z.number(),
      title: z.string(),
      narration: z.string(),
      examples: z.string().optional(),
      evidenceMoments: z.array(EvidenceMomentSchema).default([]),
      transition: z.string().optional(),
    })
  ).min(1),
  conclusion: z.string(),
  cta: z.string(),
  estimatedDurationMinutes: z.number().default(10),
  thumbnailConcept: z.string().optional(),
});
export type YouTubeLongFormOutput = z.infer<typeof YouTubeLongFormOutputSchema>;

export const YouTubeShortOutputSchema = z.object({
  title: z.string(),
  hook: z.string(),
  body: z.string(),
  payoff: z.string(),
  cta: z.string(),
  targetDurationSeconds: z.number().default(45),
  evidenceMoments: z.array(EvidenceMomentSchema).default([]),
});
export type YouTubeShortOutput = z.infer<typeof YouTubeShortOutputSchema>;

export const NewsletterOutputSchema = z.object({
  subject: z.string(),
  previewText: z.string(),
  opening: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      evidenceMoments: z.array(EvidenceMomentSchema).default([]),
    })
  ).min(1),
  closing: z.string(),
  cta: z.string(),
});
export type NewsletterOutput = z.infer<typeof NewsletterOutputSchema>;

export const XThreadOutputSchema = z.object({
  threadHook: z.string().max(280),
  posts: z.array(
    z.object({
      postNumber: z.number(),
      text: z.string().max(280),
      claimIds: z.array(z.string()).default([]),
    })
  ).min(2),
  cta: z.string().max(280),
});
export type XThreadOutput = z.infer<typeof XThreadOutputSchema>;

export const LinkedInOutputSchema = z.object({
  hook: z.string(),
  body: z.array(z.string()).min(1),
  evidenceCallout: z.string().optional(),
  takeaway: z.string(),
  cta: z.string(),
});
export type LinkedInOutput = z.infer<typeof LinkedInOutputSchema>;

// 5. Distribution Agent Output Schema
export const DistributionOutputSchema = z.object({
  xPost: z.string(),
  xThread: z.array(z.string()),
  linkedInPost: z.string(),
  newsletterExcerpt: z.string(),
  shortsConcept: z.string(),
});
export type DistributionOutput = z.infer<typeof DistributionOutputSchema>;

// 6. Editor Output Schema (Legacy)
export const EditorOutputSchema = z.object({
  verdict: z.enum(["APPROVE", "REQUEST_REVISION", "REJECT"]),
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["CRITICAL", "WARNING", "SUGGESTION"]),
      ruleCategory: z.string(),
      description: z.string(),
      suggestedFix: z.string(),
    })
  ),
});
export type EditorOutput = z.infer<typeof EditorOutputSchema>;

// Phase 5 Structured Editorial Review Schemas
export const EditorialFindingSchema = z.object({
  category: z.enum([
    "EVIDENCE_INTEGRITY",
    "BRAND_VOICE",
    "EDITORIAL_QUALITY",
    "FORMAT_COMPLIANCE",
  ]),
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  blockId: z.string().optional(),
  claimId: z.string().optional(),
  description: z.string(),
  evidence: z.string().optional(),
  recommendation: z.string(),
  requiresRevision: z.boolean(),
});
export type EditorialFinding = z.infer<typeof EditorialFindingSchema>;

export const EditorialReviewOutputSchema = z.object({
  verdict: z.enum(["PASS", "REQUEST_REVISION", "FAIL"]),
  scores: z.object({
    evidenceScore: z.number().min(0).max(100),
    brandScore: z.number().min(0).max(100),
    qualityScore: z.number().min(0).max(100),
    formatScore: z.number().min(0).max(100),
    overallScore: z.number().min(0).max(100),
  }),
  summary: z.string(),
  findings: z.array(EditorialFindingSchema),
  revisionInstructions: z
    .array(
      z.object({
        blockId: z.string().optional(),
        instruction: z.string(),
        category: z.string(),
        severity: z.string(),
      })
    )
    .default([]),
});
export type EditorialReviewOutput = z.infer<typeof EditorialReviewOutputSchema>;

// Phase 6 Learning Engine Schemas
export const LearningInsightSchema = z.object({
  category: z.enum([
    "TOPIC",
    "HOOK",
    "FORMAT",
    "PILLAR",
    "CTA",
    "RETENTION",
    "ENGAGEMENT",
    "PUBLISHING_TIME",
  ]),
  sentiment: z.enum(["WINNING", "WEAK", "NEUTRAL", "OPPORTUNITY"]),
  observation: z.string(),
  hypothesis: z.string().optional(),
  sampleSize: z.number().int().min(0),
  confidenceScore: z.number().min(0).max(100),
  statisticalSignificance: z.enum([
    "STATISTICALLY_SIGNIFICANT",
    "DIRECTIONAL",
    "ANECDOTAL",
    "ELIGIBLE_FOR_TESTING",
  ]),
  supportingMetrics: z.record(z.unknown()).default({}),
  limitations: z.string(),
  recommendation: z.object({
    title: z.string(),
    actionType: z.enum([
      "KEEP",
      "TEST",
      "STOP",
      "DOUBLE_DOWN",
      "MODIFY_HOOK",
      "ADJUST_CTA",
    ]),
    guidance: z.string(),
    targetFormat: z.string().optional(),
    targetPillar: z.string().optional(),
  }),
});
export type LearningInsight = z.infer<typeof LearningInsightSchema>;

export const LearningEngineOutputSchema = z.object({
  overviewSummary: z.string(),
  totalAssetsAnalyzed: z.number().int().min(0),
  learnings: z.array(LearningInsightSchema),
});
export type LearningEngineOutput = z.infer<typeof LearningEngineOutputSchema>;

export type AnyAgentOutput =
  | SignalScoutOutput
  | ResearchOutput
  | StrategyOutput
  | WriterOutput
  | YouTubeLongFormOutput
  | YouTubeShortOutput
  | NewsletterOutput
  | XThreadOutput
  | LinkedInOutput
  | DistributionOutput
  | EditorOutput
  | EditorialReviewOutput
  | LearningEngineOutput;


