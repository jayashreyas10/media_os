export const CAMPAIGN_STAGES = [
  "DISCOVERY",
  "RESEARCH",
  "STRATEGY",
  "CREATION",
  "DISTRIBUTION",
  "REVIEW",
  "APPROVAL",
  "SCHEDULED",
  "PUBLISHED",
  "ANALYTICS",
  "LEARNING",
  "ARCHIVED",
] as const;

export type CampaignStage = (typeof CAMPAIGN_STAGES)[number];

export interface StageMetadata {
  stage: CampaignStage;
  label: string;
  description: string;
  stepNumber: number;
}

export const STAGE_METADATA: Record<CampaignStage, StageMetadata> = {
  DISCOVERY: {
    stage: "DISCOVERY",
    label: "Discovery",
    description: "Signal identification and opportunity scoring",
    stepNumber: 1,
  },
  RESEARCH: {
    stage: "RESEARCH",
    label: "Research",
    description: "Fact verification, source gathering, and claims mapping",
    stepNumber: 2,
  },
  STRATEGY: {
    stage: "STRATEGY",
    label: "Strategy",
    description: "Singular thesis formulation and narrative arc",
    stepNumber: 3,
  },
  CREATION: {
    stage: "CREATION",
    label: "Creation",
    description: "Flagship script and essay drafting",
    stepNumber: 4,
  },
  DISTRIBUTION: {
    stage: "DISTRIBUTION",
    label: "Distribution",
    description: "Platform-native asset generation",
    stepNumber: 5,
  },
  REVIEW: {
    stage: "REVIEW",
    label: "Review",
    description: "Editorial review and fact checking",
    stepNumber: 6,
  },
  APPROVAL: {
    stage: "APPROVAL",
    label: "Approval",
    description: "Mandatory human sign-off",
    stepNumber: 7,
  },
  SCHEDULED: {
    stage: "SCHEDULED",
    label: "Scheduled",
    description: "Slated on publishing calendar",
    stepNumber: 8,
  },
  PUBLISHED: {
    stage: "PUBLISHED",
    label: "Published",
    description: "Dispatched to destinations",
    stepNumber: 9,
  },
  ANALYTICS: {
    stage: "ANALYTICS",
    label: "Analytics",
    description: "Performance metrics ingestion",
    stepNumber: 10,
  },
  LEARNING: {
    stage: "LEARNING",
    label: "Learning",
    description: "Keep / Test / Stop insights and playbook updates",
    stepNumber: 11,
  },
  ARCHIVED: {
    stage: "ARCHIVED",
    label: "Archived",
    description: "Preserved historical campaign",
    stepNumber: 12,
  },
};

/**
 * Valid stage transition mapping.
 * Forward progress, revisions, and archival.
 */
export const VALID_TRANSITIONS: Record<CampaignStage, CampaignStage[]> = {
  DISCOVERY: ["RESEARCH", "ARCHIVED"],
  RESEARCH: ["STRATEGY", "DISCOVERY", "ARCHIVED"],
  STRATEGY: ["CREATION", "RESEARCH", "ARCHIVED"],
  CREATION: ["DISTRIBUTION", "STRATEGY", "ARCHIVED"],
  DISTRIBUTION: ["REVIEW", "CREATION", "ARCHIVED"],
  REVIEW: ["APPROVAL", "CREATION", "ARCHIVED"], // Revision transition back to CREATION
  APPROVAL: ["SCHEDULED", "REVIEW", "CREATION", "ARCHIVED"], // Can send back to review or creation
  SCHEDULED: ["PUBLISHED", "APPROVAL", "ARCHIVED"],
  PUBLISHED: ["ANALYTICS", "ARCHIVED"],
  ANALYTICS: ["LEARNING", "ARCHIVED"],
  LEARNING: ["ARCHIVED"],
  ARCHIVED: ["DISCOVERY"], // Restore
};

export class InvalidStageTransitionError extends Error {
  constructor(public fromStage: string, public toStage: string) {
    super(
      `Invalid campaign stage transition from '${fromStage}' to '${toStage}'. Allowed transitions: ${
        VALID_TRANSITIONS[fromStage as CampaignStage]?.join(", ") || "none"
      }.`
    );
    this.name = "InvalidStageTransitionError";
  }
}

export function isValidTransition(from: CampaignStage, to: CampaignStage): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertValidTransition(from: CampaignStage, to: CampaignStage): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidStageTransitionError(from, to);
  }
}
