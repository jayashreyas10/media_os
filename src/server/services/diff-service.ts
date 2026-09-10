export interface BlockSnapshot {
  id?: string;
  blockType: string;
  orderIndex: number;
  title?: string | null;
  content: string;
  example?: string | null;
  transition?: string | null;
  statementType?: string;
  unsupportedFlag?: boolean;
}

export interface StructuredDiffItem {
  blockType: string;
  orderIndex: number;
  changeType: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  title?: { old?: string | null; new?: string | null; changed: boolean };
  contentDiff: Array<{ type: "added" | "removed" | "unchanged"; value: string }>;
  exampleDiff?: { old?: string | null; new?: string | null; changed: boolean };
  transitionDiff?: { old?: string | null; new?: string | null; changed: boolean };
  statementTypeDiff?: { old?: string; new?: string; changed: boolean };
}

export interface TextDiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

export interface VersionDiffResult {
  v1VersionNumber: number;
  v2VersionNumber: number;
  v1Author?: string | null;
  v2Author?: string | null;
  v1CreatedAt: string;
  v2CreatedAt: string;
  v2ChangeSummary: string;
  structuredDiff: StructuredDiffItem[];
  textDiff: TextDiffLine[];
  summary: {
    blocksAdded: number;
    blocksRemoved: number;
    blocksModified: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

export class DiffService {
  /**
   * Compares two ContentVersions, producing both a structured block-by-block diff
   * and a line-by-line text diff.
   */
  static compare(
    v1: {
      versionNumber: number;
      author?: string | null;
      createdAt: Date | string;
      blocks: BlockSnapshot[];
    },
    v2: {
      versionNumber: number;
      author?: string | null;
      createdAt: Date | string;
      changeSummary: string;
      blocks: BlockSnapshot[];
    }
  ): VersionDiffResult {
    const v1Blocks = [...v1.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const v2Blocks = [...v2.blocks].sort((a, b) => a.orderIndex - b.orderIndex);

    const structuredDiff: StructuredDiffItem[] = [];
    let blocksAdded = 0;
    let blocksRemoved = 0;
    let blocksModified = 0;

    // Track matching by index or blockType
    const maxLen = Math.max(v1Blocks.length, v2Blocks.length);

    for (let i = 0; i < maxLen; i++) {
      const b1 = v1Blocks[i];
      const b2 = v2Blocks[i];

      if (b1 && !b2) {
        // Block removed in v2
        blocksRemoved++;
        structuredDiff.push({
          blockType: b1.blockType,
          orderIndex: b1.orderIndex,
          changeType: "REMOVED",
          title: { old: b1.title, new: null, changed: true },
          contentDiff: [{ type: "removed", value: b1.content }],
        });
      } else if (!b1 && b2) {
        // Block added in v2
        blocksAdded++;
        structuredDiff.push({
          blockType: b2.blockType,
          orderIndex: b2.orderIndex,
          changeType: "ADDED",
          title: { old: null, new: b2.title, changed: true },
          contentDiff: [{ type: "added", value: b2.content }],
        });
      } else if (b1 && b2) {
        // Both exist: check for modifications
        const titleChanged = (b1.title || "") !== (b2.title || "");
        const contentChanged = b1.content.trim() !== b2.content.trim();
        const exampleChanged = (b1.example || "") !== (b2.example || "");
        const transitionChanged = (b1.transition || "") !== (b2.transition || "");
        const statementTypeChanged = (b1.statementType || "FACT") !== (b2.statementType || "FACT");

        const isModified =
          titleChanged || contentChanged || exampleChanged || transitionChanged || statementTypeChanged;

        if (isModified) {
          blocksModified++;
        }

        const contentDiff = this.diffSentences(b1.content, b2.content);

        structuredDiff.push({
          blockType: b2.blockType,
          orderIndex: b2.orderIndex,
          changeType: isModified ? "MODIFIED" : "UNCHANGED",
          title: { old: b1.title, new: b2.title, changed: titleChanged },
          contentDiff,
          exampleDiff: { old: b1.example, new: b2.example, changed: exampleChanged },
          transitionDiff: { old: b1.transition, new: b2.transition, changed: transitionChanged },
          statementTypeDiff: { old: b1.statementType, new: b2.statementType, changed: statementTypeChanged },
        });
      }
    }

    // Compute continuous Prose/Text Diff
    const text1 = this.renderBlocksToProse(v1Blocks);
    const text2 = this.renderBlocksToProse(v2Blocks);
    const textDiff = this.diffLines(text1, text2);

    const linesAdded = textDiff.filter((l) => l.type === "added").length;
    const linesRemoved = textDiff.filter((l) => l.type === "removed").length;

    return {
      v1VersionNumber: v1.versionNumber,
      v2VersionNumber: v2.versionNumber,
      v1Author: v1.author,
      v2Author: v2.author,
      v1CreatedAt: new Date(v1.createdAt).toISOString(),
      v2CreatedAt: new Date(v2.createdAt).toISOString(),
      v2ChangeSummary: v2.changeSummary,
      structuredDiff,
      textDiff,
      summary: {
        blocksAdded,
        blocksRemoved,
        blocksModified,
        linesAdded,
        linesRemoved,
      },
    };
  }

  /**
   * Performs a sentence/clause level diff for modified block content.
   */
  private static diffSentences(text1: string, text2: string): Array<{ type: "added" | "removed" | "unchanged"; value: string }> {
    if (text1.trim() === text2.trim()) {
      return [{ type: "unchanged", value: text1 }];
    }

    const s1 = text1.split(/(?<=[.!?])\s+/).filter(Boolean);
    const s2 = text2.split(/(?<=[.!?])\s+/).filter(Boolean);

    const diff: Array<{ type: "added" | "removed" | "unchanged"; value: string }> = [];
    const set1 = new Set(s1);
    const set2 = new Set(s2);

    for (const sent of s1) {
      if (set2.has(sent)) {
        diff.push({ type: "unchanged", value: sent });
      } else {
        diff.push({ type: "removed", value: sent });
      }
    }

    for (const sent of s2) {
      if (!set1.has(sent)) {
        diff.push({ type: "added", value: sent });
      }
    }

    return diff;
  }

  /**
   * Computes a line-by-line text diff using standard dynamic programming LCS.
   */
  private static diffLines(text1: string, text2: string): TextDiffLine[] {
    const lines1 = text1.split(/\r?\n/);
    const lines2 = text2.split(/\r?\n/);

    const n = lines1.length;
    const m = lines2.length;

    // LCS table
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (lines1[i - 1] === lines2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find diff
    const result: TextDiffLine[] = [];
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
        result.unshift({ type: "unchanged", text: lines1[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: "added", text: lines2[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        result.unshift({ type: "removed", text: lines1[i - 1] });
        i--;
      }
    }

    return result;
  }

  private static renderBlocksToProse(blocks: BlockSnapshot[]): string {
    return blocks
      .map((b) => {
        const parts = [];
        if (b.title) parts.push(`### ${b.title}`);
        if (b.content) parts.push(b.content);
        if (b.example) parts.push(`*Example: ${b.example}*`);
        if (b.transition) parts.push(`_Transition: ${b.transition}_`);
        return parts.join("\n\n");
      })
      .join("\n\n---\n\n");
  }
}
