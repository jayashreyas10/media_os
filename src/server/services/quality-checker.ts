export interface QualityBlock {
  title?: string | null;
  content: string;
  statementType?: string;
  unsupportedFlag?: boolean;
  claimId?: string | null;
}

export interface EditorialRuleItem {
  rule: string;
  category: string;
  severity?: string;
}

export interface QualityMetadata {
  wordCount: number;
  sectionCount: number;
  estimatedSpeakingDurationMinutes: number;
  estimatedReadingDurationMinutes: number;
  readabilityScore: number;
  readabilityGrade: string;
  evidenceCoveragePercent: number;
  unsupportedClaimCount: number;
  brandRuleWarnings: string[];
}

export class QualityChecker {
  /**
   * Deterministically calculates content quality diagnostics and rule warnings.
   */
  static analyze(
    blocks: QualityBlock[],
    editorialRules: EditorialRuleItem[] = [],
    forbiddenWordsStr: string = ""
  ): QualityMetadata {
    let totalWords = 0;
    let totalSentences = 0;
    let totalSyllables = 0;
    let factualBlocks = 0;
    let supportedFactualBlocks = 0;
    let unsupportedCount = 0;
    const ruleWarnings: string[] = [];

    const forbiddenWords = forbiddenWordsStr
      ? forbiddenWordsStr.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
      : [];

    for (const b of blocks) {
      const text = `${b.title || ""} ${b.content || ""}`.trim();
      if (!text) continue;

      const words = text.split(/\s+/).filter(Boolean);
      totalWords += words.length;

      const sentences = text.split(/[.!?]+/).filter(Boolean);
      totalSentences += Math.max(1, sentences.length);

      for (const word of words) {
        totalSyllables += this.estimateSyllables(word);

        // Check forbidden words from Brand Voice
        const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (forbiddenWords.includes(cleanWord)) {
          const warning = `Forbidden brand word detected: "${cleanWord}"`;
          if (!ruleWarnings.includes(warning)) {
            ruleWarnings.push(warning);
          }
        }
      }

      // Check editorial rules
      for (const rule of editorialRules) {
        if (rule.category === "TONE" || rule.category === "FACT_CHECKING") {
          const buzzwords = ["revolutionary", "synergy", "paradigm shift", "game-changing", "disruptive", "silver bullet"];
          for (const bw of buzzwords) {
            if (rule.rule.toLowerCase().includes(bw) && text.toLowerCase().includes(bw)) {
              const warning = `Rule violation (${rule.category}): Avoid buzzword "${bw}"`;
              if (!ruleWarnings.includes(warning)) {
                ruleWarnings.push(warning);
              }
            }
          }
        }
      }

      // Track claim coverage
      if (b.statementType === "FACT") {
        factualBlocks++;
        if (b.claimId && !b.unsupportedFlag) {
          supportedFactualBlocks++;
        } else {
          unsupportedCount++;
        }
      } else if (b.unsupportedFlag) {
        unsupportedCount++;
      }
    }

    // Flesch Reading Ease calculation
    let readabilityScore = 65;
    if (totalWords > 0 && totalSentences > 0) {
      const wordsPerSentence = totalWords / totalSentences;
      const syllablesPerWord = totalSyllables / totalWords;
      const rawScore = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
      readabilityScore = Math.max(0, Math.min(100, Math.round(rawScore)));
    }

    let readabilityGrade = "Standard (Plain English)";
    if (readabilityScore >= 80) readabilityGrade = "Easy / Conversational";
    else if (readabilityScore >= 60) readabilityGrade = "Standard Technical";
    else if (readabilityScore >= 40) readabilityGrade = "Advanced / Academic";
    else readabilityGrade = "Dense / Highly Technical";

    const evidenceCoveragePercent =
      factualBlocks > 0
        ? Math.round((supportedFactualBlocks / factualBlocks) * 100)
        : 100;

    return {
      wordCount: totalWords,
      sectionCount: blocks.length,
      estimatedSpeakingDurationMinutes: Math.max(1, Math.round((totalWords / 150) * 10) / 10),
      estimatedReadingDurationMinutes: Math.max(1, Math.round((totalWords / 200) * 10) / 10),
      readabilityScore,
      readabilityGrade,
      evidenceCoveragePercent,
      unsupportedClaimCount: unsupportedCount,
      brandRuleWarnings: ruleWarnings,
    };
  }

  private static estimateSyllables(word: string): number {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!cleaned) return 1;
    if (cleaned.length <= 3) return 1;

    const matches = cleaned.match(/[aeiouy]{1,2}/g);
    let count = matches ? matches.length : 1;

    if (cleaned.endsWith("e") && !cleaned.endsWith("le")) {
      count = Math.max(1, count - 1);
    }
    return count;
  }
}
