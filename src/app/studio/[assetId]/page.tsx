"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FileEdit,
  ArrowLeft,
  Sparkles,
  Save,
  GitCompare,
  Copy,
  History,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  ExternalLink,
  ChevronDown,
  RotateCcw,
  CheckCircle2,
  Clock,
  BookOpen,
  Info,
  X,
  Layers,
  Send,
  Globe,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

interface ClaimReferenceItem {
  id: string;
  claimId: string;
  citationText?: string | null;
  isGrounded: boolean;
  claim: {
    id: string;
    claimText: string;
    verificationStatus: string;
    primarySource?: {
      id: string;
      title: string;
      url?: string | null;
      isSynthetic: boolean;
    } | null;
    evidence?: Array<{
      id: string;
      quoteSnippet: string;
      supportStance: string;
      isQuoteVerified: boolean;
    }>;
  };
}

interface ContentBlockItem {
  id: string;
  blockType: string;
  orderIndex: number;
  title?: string | null;
  content: string;
  example?: string | null;
  transition?: string | null;
  statementType: string;
  unsupportedFlag: boolean;
  claimReferences: ClaimReferenceItem[];
}

interface ContentVersionItem {
  id: string;
  versionNumber: number;
  changeSummary: string;
  sourceType: string;
  author?: string | null;
  contentSnapshot: string;
  createdAt: string;
  blocks: ContentBlockItem[];
}

interface AssetDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  currentVersionId?: string | null;
  qualityMetadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
  campaign: {
    id: string;
    title: string;
    stage: string;
    strategy?: {
      id: string;
      primaryHeadline: string;
      thesis: string;
    } | null;
    claims: Array<{
      id: string;
      claimText: string;
      verificationStatus: string;
      primarySource?: {
        id: string;
        title: string;
        url?: string | null;
        isSynthetic: boolean;
      } | null;
      evidence: Array<{
        quoteSnippet: string;
        supportStance: string;
        isQuoteVerified: boolean;
      }>;
    }>;
  };
  versions: ContentVersionItem[];
}

export default function StudioAssetEditorPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.assetId as string;

  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Active version and local blocks state for editing
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [blocks, setBlocks] = useState<ContentBlockItem[]>([]);
  const [activeTab, setActiveTab] = useState<"editorial" | "evidence" | "diagnostics" | "history">("editorial");

  // Editorial Review & Approval Gate State
  const [latestReview, setLatestReview] = useState<any>(null);
  const [approvalHistory, setApprovalHistory] = useState<any[]>([]);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);
  const [revisionLoopRunning, setRevisionLoopRunning] = useState(false);

  // Visual Diff Modal State
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffV1Id, setDiffV1Id] = useState("");
  const [diffV2Id, setDiffV2Id] = useState("");
  const [diffResult, setDiffResult] = useState<any>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffViewMode, setDiffViewMode] = useState<"structured" | "text">("structured");

  // AI Prompt Modal
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiMode, setAiMode] = useState<string>("GENERATE");
  const [aiInstructions, setAiInstructions] = useState("");

  // Phase 7 Publishing State
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [publishing, setPublishing] = useState(false);
  const [latestPublishRecord, setLatestPublishRecord] = useState<any>(null);

  // Human Editorial Review Modal State
  const [humanReviewModalOpen, setHumanReviewModalOpen] = useState(false);
  const [humanVerdict, setHumanVerdict] = useState<"PASS" | "REQUEST_REVISION" | "FAIL">("PASS");
  const [humanReviewSummary, setHumanReviewSummary] = useState("");
  const [humanReviewScore, setHumanReviewScore] = useState(90);
  const [humanReviewing, setHumanReviewing] = useState(false);

  // Publishing Preview State
  const [publishPreview, setPublishPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchAsset = async () => {

    try {
      setLoading(true);
      const res = await fetch(`/api/studio/assets/${assetId}`);
      const json = await res.json();
      if (res.ok && json.asset) {
        setAsset(json.asset);
        if (json.asset.versions?.length > 0) {
          const current =
            json.asset.versions.find((v: ContentVersionItem) => v.id === json.asset.currentVersionId) ||
            json.asset.versions[0];
          setSelectedVersionId(current.id);
          setBlocks(current.blocks || []);
        }
      }

      // Fetch latest review
      const revRes = await fetch(`/api/reviews?assetId=${assetId}`);
      if (revRes.ok) {
        const revData = await revRes.json();
        if (revData.reviews?.length > 0) {
          // Fetch full detail of latest review
          const detailRes = await fetch(`/api/reviews/${revData.reviews[0].id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setLatestReview(detailData.review);
          }
        } else {
          setLatestReview(null);
        }
      }

      // Fetch approvals history
      const appRes = await fetch(`/api/studio/assets/${assetId}/approvals`);
      if (appRes.ok) {
        const appData = await appRes.json();
        setApprovalHistory(appData.approvals || []);
      }

      // Fetch publishing history
      const pubRes = await fetch(`/api/studio/assets/${assetId}/publishing-history`);
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        if (pubData.history?.length > 0) {
          setLatestPublishRecord(pubData.history[0]);
        } else {
          setLatestPublishRecord(null);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAsset();
  }, [assetId]);

  // When user switches selected version in dropdown
  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    const ver = asset?.versions.find((v) => v.id === versionId);
    if (ver) {
      setBlocks(ver.blocks || []);
    }
  };

  // Block editing handlers
  const handleUpdateBlockContent = (index: number, content: string) => {
    const updated = [...blocks];
    updated[index] = { ...updated[index], content };
    setBlocks(updated);
  };

  const handleUpdateBlockTitle = (index: number, title: string) => {
    const updated = [...blocks];
    updated[index] = { ...updated[index], title };
    setBlocks(updated);
  };

  const handleMoveBlock = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === blocks.length - 1) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const updated = [...blocks];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    updated.forEach((b, i) => (b.orderIndex = i));
    setBlocks(updated);
  };

  const handleDuplicateBlock = (index: number) => {
    const target = blocks[index];
    const newBlock: ContentBlockItem = {
      ...target,
      id: `client-${Date.now()}`,
      title: target.title ? `${target.title} (Copy)` : "Section Copy",
      orderIndex: index + 1,
    };
    const updated = [...blocks.slice(0, index + 1), newBlock, ...blocks.slice(index + 1)];
    updated.forEach((b, i) => (b.orderIndex = i));
    setBlocks(updated);
  };

  const handleDeleteBlock = (index: number) => {
    if (blocks.length <= 1) return;
    const updated = blocks.filter((_, i) => i !== index);
    updated.forEach((b, i) => (b.orderIndex = i));
    setBlocks(updated);
  };

  const handleAddChapter = () => {
    const chapterNum = blocks.filter((b) => b.blockType === "CHAPTER").length + 1;
    const newBlock: ContentBlockItem = {
      id: `client-${Date.now()}`,
      blockType: "CHAPTER",
      orderIndex: blocks.length,
      title: `Chapter ${chapterNum}: New Section`,
      content: "Write narration and analysis here...",
      statementType: "FACT",
      unsupportedFlag: false,
      claimReferences: [],
    };
    setBlocks([...blocks, newBlock]);
  };

  // Save edits as a new immutable version
  const handleSaveEdits = async () => {
    try {
      setSaving(true);
      const res = await fetch(`/api/studio/assets/${assetId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: blocks.map((b) => ({
            blockType: b.blockType,
            orderIndex: b.orderIndex,
            title: b.title,
            content: b.content,
            example: b.example,
            transition: b.transition,
            statementType: b.statementType,
            claimId: b.claimReferences?.[0]?.claimId || null,
          })),
          changeSummary: "Manual edits in Content Studio",
        }),
      });

      if (res.ok) {
        await fetchAsset();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Trigger AI generation
  const handleTriggerGeneration = async (mode = "GENERATE") => {
    try {
      setGenerating(true);
      setAiModalOpen(false);
      const res = await fetch(`/api/studio/assets/${assetId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          instructions: aiInstructions || undefined,
        }),
      });

      if (res.ok) {
        setAiInstructions("");
        await fetchAsset();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  // Restore old version
  const handleRestoreVersion = async (versionId: string) => {
    try {
      const res = await fetch(`/api/studio/assets/${assetId}/versions/${versionId}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchAsset();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Status transition handler
  const handleStatusTransition = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/studio/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchAsset();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger AI Editorial Review
  const handleRunReview = async () => {
    try {
      setReviewRunning(true);
      const res = await fetch(`/api/studio/assets/${assetId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: selectedVersionId }),
      });
      if (res.ok) {
        setActiveTab("editorial");
        await fetchAsset();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReviewRunning(false);
    }
  };

  // Human Approval Action
  const handleHumanApprove = async () => {
    if (!approvalComment.trim()) return;
    try {
      const res = await fetch(`/api/studio/assets/${assetId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: selectedVersionId,
          comment: approvalComment.trim(),
        }),
      });
      if (res.ok) {
        setApprovalModalOpen(false);
        setApprovalComment("");
        await fetchAsset();
      } else {
        const data = await res.json();
        alert(data.error || "Approval failed");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Human Rejection Action
  const handleHumanReject = async () => {
    if (!rejectionReason.trim()) return;
    try {
      const res = await fetch(`/api/studio/assets/${assetId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: selectedVersionId,
          reason: rejectionReason.trim(),
        }),
      });
      if (res.ok) {
        setRejectionModalOpen(false);
        setRejectionReason("");
        await fetchAsset();
      } else {
        const data = await res.json();
        alert(data.error || "Rejection failed");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Revoke Approval Action
  const handleRevokeApproval = async () => {
    if (!revokeReason.trim()) return;
    try {
      const res = await fetch(`/api/studio/assets/${assetId}/revoke-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: selectedVersionId,
          reason: revokeReason.trim(),
        }),
      });
      if (res.ok) {
        setRevokeModalOpen(false);
        setRevokeReason("");
        await fetchAsset();
      } else {
        const data = await res.json();
        alert(data.error || "Revocation failed");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPublishPreview = async (accountId: string) => {
    const acc = connectedAccounts.find((a) => a.id === accountId);
    if (!acc) return;
    try {
      setLoadingPreview(true);
      const res = await fetch(`/api/studio/assets/${assetId}/publish/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: selectedVersionId,
          connectedAccountId: accountId,
          platform: acc.platform,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPublishPreview(data);
      }
    } catch {
      // preview non-blocking
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecuteHumanReview = async () => {
    if (!humanReviewSummary.trim()) return;
    try {
      setHumanReviewing(true);
      const res = await fetch("/api/reviews/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          versionId: selectedVersionId,
          verdict: humanVerdict,
          summary: humanReviewSummary.trim(),
          scores: { overallScore: humanReviewScore },
        }),
      });
      if (res.ok) {
        setHumanReviewModalOpen(false);
        setHumanReviewSummary("");
        setActiveTab("editorial");
        await fetchAsset();
      } else {
        const data = await res.json();
        alert(data.error || "Human review failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error submitting human review");
    } finally {
      setHumanReviewing(false);
    }
  };

  // Phase 7 Publishing Handlers
  const handleOpenPublishModal = async () => {
    try {
      const res = await fetch("/api/publishing/accounts");
      if (res.ok) {
        const data = await res.json();
        const accs = data.accounts || [];
        setConnectedAccounts(accs);
        if (accs.length > 0) {
          const match = accs.find((a: any) =>
            asset?.type.includes("YOUTUBE") ? a.platform === "YOUTUBE" :
            asset?.type.includes("X_") ? a.platform === "X" :
            asset?.type.includes("LINKEDIN") ? a.platform === "LINKEDIN" :
            asset?.type.includes("NEWSLETTER") ? a.platform === "NEWSLETTER" : true
          );
          const chosenId = match ? match.id : accs[0].id;
          setSelectedAccountId(chosenId);
          // Preview publication payload
          setTimeout(() => fetchPublishPreview(chosenId), 50);
        }
      }
      setPublishModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  };


  const handleExecutePublish = async () => {
    if (!selectedAccountId) return;
    const targetAccount = connectedAccounts.find((a) => a.id === selectedAccountId);
    if (!targetAccount) return;

    try {
      setPublishing(true);
      const res = await fetch(`/api/studio/assets/${assetId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: selectedVersionId,
          connectedAccountId: selectedAccountId,
          platform: targetAccount.platform,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPublishModalOpen(false);
        await fetchAsset();
      } else {
        alert(data.error || "Publishing failed");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPublishing(false);
    }
  };

  // Apply Revision Loop with Writer
  const handleApplyRevisionLoop = async () => {
    try {
      setRevisionLoopRunning(true);
      const res = await fetch(`/api/studio/assets/${assetId}/revision-loop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchAsset();
      } else {
        const data = await res.json();
        alert(data.error || "Revision cycle failed");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRevisionLoopRunning(false);
    }
  };

  // Compute visual diff
  const handleOpenDiff = async () => {
    if (!asset || asset.versions.length < 2) return;
    const v2 = asset.versions[0].id;
    const v1 = asset.versions[1].id;
    setDiffV1Id(v1);
    setDiffV2Id(v2);
    setDiffModalOpen(true);
    fetchDiff(v1, v2);
  };

  const fetchDiff = async (v1: string, v2: string) => {
    try {
      setDiffLoading(true);
      const res = await fetch(`/api/studio/assets/${assetId}/diff?v1=${v1}&v2=${v2}`);
      const json = await res.json();
      if (res.ok && json.diff) {
        setDiffResult(json.diff);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDiffLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-xs font-mono text-zinc-500">
        Loading content studio workspace...
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="py-24 text-center space-y-3">
        <p className="text-sm text-zinc-400">Content Asset not found.</p>
        <Link href="/studio" className="text-xs text-blue-400 hover:underline">
          Return to Studio
        </Link>
      </div>
    );
  }

  const selectedVersion = asset.versions.find((v) => v.id === selectedVersionId) || asset.versions[0];
  const meta = asset.qualityMetadataJson ? JSON.parse(asset.qualityMetadataJson) : null;

  return (
    <div className="space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/studio"
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase bg-blue-950/80 text-blue-400 border border-blue-800/80 px-2 py-0.5 rounded font-semibold">
                {asset.type}
              </span>
              <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 font-semibold">
                {asset.status}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1">{asset.title}</h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Version Selector */}
          {asset.versions.length > 0 && (
            <select
              value={selectedVersionId}
              onChange={(e) => handleSelectVersion(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-3 py-2 rounded-lg font-mono focus:outline-none focus:border-zinc-700"
            >
              {asset.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} ({v.sourceType}) — {v.changeSummary.slice(0, 30)}
                </option>
              ))}
            </select>
          )}

          {/* Visual Diff Button */}
          {asset.versions.length >= 2 && (
            <button
              onClick={handleOpenDiff}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5 text-blue-400" />
              Diff Versions
            </button>
          )}

          {/* Save Button */}
          <button
            onClick={handleSaveEdits}
            disabled={saving}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3.5 py-2 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            {saving ? "Saving..." : "Save Version"}
          </button>

          {/* Human Editorial Review Trigger */}
          <button
            onClick={() => setHumanReviewModalOpen(true)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold px-3.5 py-2 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1.5"
          >
            <span>✍️</span> Human Review
          </button>

          {/* AI Editorial Review Trigger */}
          <button
            onClick={handleRunReview}
            disabled={reviewRunning}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${reviewRunning ? "animate-spin" : ""}`} />
            {reviewRunning ? "Reviewing..." : "Run AI Review"}
          </button>

          {/* Status Transitions & Approval Gate */}
          {asset.status === "GENERATED" && (
            <button
              onClick={() => handleStatusTransition("EDITING")}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
            >
              Move to Editing
            </button>
          )}

          {asset.status === "EDITING" && (
            <button
              onClick={() => handleStatusTransition("READY_FOR_REVIEW")}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
            >
              Submit for Review
            </button>
          )}

          {(asset.status === "READY_FOR_REVIEW" || asset.status === "REVIEW_PASSED") && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setRejectionModalOpen(true)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-2 rounded-lg border border-zinc-700"
              >
                Request Revisions
              </button>
              <button
                onClick={() => setApprovalModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve (Human Sign-off)
              </button>
            </div>
          )}

          {asset.status === "REVISION_REQUIRED" && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleApplyRevisionLoop}
                disabled={revisionLoopRunning}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${revisionLoopRunning ? "animate-spin" : ""}`} />
                {revisionLoopRunning ? "Applying Revisions..." : "Apply Revisions with Writer"}
              </button>
              <button
                onClick={() => handleStatusTransition("EDITING")}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-2 rounded-lg border border-zinc-700"
              >
                Manual Edit
              </button>
            </div>
          )}

          {asset.status === "REQUIRES_HUMAN_INTERVENTION" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs bg-red-950/90 text-red-400 border border-red-800 px-2.5 py-1.5 rounded-lg font-mono font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Intervention Required
              </span>
              <button
                onClick={() => setApprovalModalOpen(true)}
                className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                Human Override & Approve
              </button>
            </div>
          )}

          {asset.status === "APPROVED" && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-3 py-1.5 rounded-lg font-mono font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Human Approved
              </span>
              <button
                onClick={handleOpenPublishModal}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                Publish to Channel
              </button>
              <button
                onClick={() => setRevokeModalOpen(true)}
                className="bg-red-950/70 hover:bg-red-900/90 text-red-300 border border-red-800/80 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Revoke Approval
              </button>
            </div>
          )}

          {asset.status === "PUBLISHING" && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-950 text-blue-400 border border-blue-800 px-3 py-1.5 rounded-lg font-mono font-bold flex items-center gap-1.5 animate-pulse">
                <Globe className="w-4 h-4 animate-spin" />
                Publishing to Channel...
              </span>
            </div>
          )}

          {asset.status === "PUBLISHED" && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-3 py-1.5 rounded-lg font-mono font-bold flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-400" />
                Live on Channel
              </span>
              {latestPublishRecord?.externalPostUrl && (
                <a
                  href={latestPublishRecord.externalPostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1"
                >
                  View Post <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Generation Bar */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-zinc-200">AI Writer Controls:</span>
          <span className="text-[11px] text-zinc-500 font-mono">
            {asset.campaign.strategy
              ? `Strategy: "${asset.campaign.strategy.primaryHeadline}"`
              : "Using Brand Brain & Verified Claims"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handleTriggerGeneration("GENERATE")}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating ? "Generating..." : "Generate from Strategy"}
          </button>
          <button
            onClick={() => {
              setAiMode("REWRITE_SELECTION");
              setAiModalOpen(true);
            }}
            disabled={generating}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
          >
            Rewrite
          </button>
          <button
            onClick={() => {
              setAiMode("EXPAND");
              setAiModalOpen(true);
            }}
            disabled={generating}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
          >
            Expand
          </button>
          <button
            onClick={() => {
              setAiMode("SHORTEN");
              setAiModalOpen(true);
            }}
            disabled={generating}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
          >
            Shorten
          </button>
          <button
            onClick={() => {
              setAiMode("CHANGE_TONE");
              setAiModalOpen(true);
            }}
            disabled={generating}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
          >
            Change Tone
          </button>
        </div>
      </div>

      {/* Main Studio Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Center / Left Column: Structured Block Editor (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-zinc-400 font-semibold tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Structured Blocks ({blocks.length})
            </span>

            {asset.type === "YOUTUBE_LONG_FORM" && (
              <button
                onClick={handleAddChapter}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-2.5 py-1 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Chapter
              </button>
            )}
          </div>

          {blocks.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl p-8 space-y-3">
              <p className="text-sm text-zinc-400">No content blocks in this version yet.</p>
              <p className="text-xs text-zinc-500">
                Click "Generate from Strategy" above to generate a complete structured script.
              </p>
              <button
                onClick={() => handleTriggerGeneration("GENERATE")}
                disabled={generating}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate Now
              </button>
            </div>
          ) : (
            blocks.map((block, idx) => {
              const hasClaim = block.claimReferences?.length > 0;
              const isTweet = block.blockType === "TWEET" || block.blockType === "THREAD_HOOK";
              const charCount = block.content.length;

              return (
                <div
                  id={block.id}
                  key={block.id || idx}
                  className={`bg-zinc-900/70 border rounded-xl p-4 space-y-3 transition-all ${
                    highlightedBlockId === block.id
                      ? "ring-2 ring-indigo-500 border-indigo-500 bg-indigo-950/30 shadow-lg"
                      : block.unsupportedFlag
                      ? "border-amber-700/80 bg-amber-950/20"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {/* Block Header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-semibold border border-zinc-700">
                        {block.blockType}
                      </span>

                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          block.statementType === "FACT"
                            ? "bg-blue-950/80 text-blue-400 border-blue-800"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {block.statementType}
                      </span>

                      {/* Evidence Pill */}
                      {hasClaim && (
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Grounded in Claim
                        </span>
                      )}

                      {block.unsupportedFlag && (
                        <span className="text-[9px] font-mono text-amber-400 bg-amber-950/90 border border-amber-800 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                          <AlertTriangle className="w-2.5 h-2.5" /> UNSUPPORTED CLAIM
                        </span>
                      )}
                    </div>

                    {/* Block Order Controls */}
                    <div className="flex items-center gap-1">
                      {isTweet && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            charCount > 280
                              ? "bg-red-950 text-red-400 font-bold border border-red-800"
                              : "text-zinc-500"
                          }`}
                        >
                          {charCount}/280
                        </span>
                      )}
                      <button
                        onClick={() => handleMoveBlock(idx, "up")}
                        disabled={idx === 0}
                        className="p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
                        title="Move Up"
                      >
                        <MoveUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveBlock(idx, "down")}
                        disabled={idx === blocks.length - 1}
                        className="p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
                        title="Move Down"
                      >
                        <MoveDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicateBlock(idx)}
                        className="p-1 text-zinc-400 hover:text-zinc-100"
                        title="Duplicate Section"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteBlock(idx)}
                        className="p-1 text-zinc-400 hover:text-rose-400"
                        title="Delete Section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Editable Title if block has title */}
                  {block.title !== null && block.title !== undefined && (
                    <input
                      type="text"
                      value={block.title || ""}
                      onChange={(e) => handleUpdateBlockTitle(idx, e.target.value)}
                      placeholder="Section Title"
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-100 px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  )}

                  {/* Editable Narration / Content */}
                  <textarea
                    rows={4}
                    value={block.content}
                    onChange={(e) => handleUpdateBlockContent(idx, e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
                  />

                  {/* Attached Claim Reference Details */}
                  {hasClaim && block.claimReferences[0]?.claim && (
                    <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/80 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                        <span className="text-zinc-400 font-semibold">Evidence Provenance:</span>
                        <span className="text-emerald-400">
                          {block.claimReferences[0].claim.verificationStatus}
                        </span>
                      </div>
                      <p className="text-zinc-300 italic font-mono">
                        "{block.claimReferences[0].claim.claimText}"
                      </p>
                      {block.claimReferences[0].claim.primarySource && (
                        <p className="text-[10px] text-zinc-500 font-mono">
                          Source: {block.claimReferences[0].claim.primarySource.title}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Tabbed Inspector (Evidence, Diagnostics, History) (1 col) */}
        <div className="space-y-4">
          {/* Tab Buttons */}
          <div className="flex border-b border-zinc-800 gap-1 pb-1 flex-wrap">
            <button
              onClick={() => setActiveTab("editorial")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === "editorial"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              Review & Approvals
            </button>
            <button
              onClick={() => setActiveTab("evidence")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === "evidence"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Evidence
            </button>
            <button
              onClick={() => setActiveTab("diagnostics")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === "diagnostics"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Diagnostics
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === "history"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Versions ({asset.versions.length})
            </button>
          </div>

          {/* Tab 0: Editorial Review & Approval Gate Panel */}
          {activeTab === "editorial" && (
            <div className="space-y-4">
              {/* Latest Review Banner */}
              {latestReview ? (
                <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono uppercase font-bold ${
                        latestReview.status === "PASSED"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-amber-950 text-amber-400 border border-amber-800"
                      }`}
                    >
                      {latestReview.status === "PASSED" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {latestReview.status}
                    </span>

                    <span className="text-[11px] font-mono text-zinc-400">
                      Score: <strong className="text-white">{latestReview.overallScore ?? 0}/100</strong>
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">{latestReview.summary}</p>

                  {/* Scores breakdown */}
                  {latestReview.scoresJson && (() => {
                    const sc = JSON.parse(latestReview.scoresJson);
                    return (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80 text-[11px] font-mono">
                        <div className="text-zinc-400">Evidence: <span className="text-emerald-400 font-bold">{sc.evidenceScore}%</span></div>
                        <div className="text-zinc-400">Brand Voice: <span className="text-blue-400 font-bold">{sc.brandScore}%</span></div>
                        <div className="text-zinc-400">Format: <span className="text-purple-400 font-bold">{sc.formatScore}%</span></div>
                        <div className="text-zinc-400">Quality: <span className="text-zinc-200 font-bold">{sc.qualityScore}%</span></div>
                      </div>
                    );
                  })()}

                  {/* Findings */}
                  {latestReview.findingsJson && (() => {
                    const findings = JSON.parse(latestReview.findingsJson);
                    if (!findings || findings.length === 0) return null;

                    return (
                      <div className="space-y-2 pt-3 border-t border-zinc-800">
                        <span className="text-[11px] font-mono uppercase text-zinc-400 font-semibold flex items-center justify-between">
                          <span>Findings ({findings.length})</span>
                          <span className="text-[10px] text-zinc-500">Click to focus block</span>
                        </span>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {findings.map((f: any, idx: number) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (f.blockId) {
                                  setHighlightedBlockId(f.blockId);
                                  document.getElementById(f.blockId)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }
                              }}
                              className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition-all ${
                                f.blockId ? "cursor-pointer hover:border-indigo-500" : ""
                              } ${
                                f.severity === "CRITICAL"
                                  ? "bg-red-950/40 border-red-800 text-red-300"
                                  : f.severity === "ERROR"
                                  ? "bg-amber-950/40 border-amber-800 text-amber-300"
                                  : f.severity === "WARNING"
                                  ? "bg-yellow-950/30 border-yellow-800 text-yellow-300"
                                  : "bg-zinc-950 border-zinc-800 text-zinc-300"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 rounded bg-black/40">
                                  {f.severity} • {f.category}
                                </span>
                                {f.blockId && (
                                  <span className="text-[9px] font-mono text-indigo-400 underline">
                                    Highlight Block
                                  </span>
                                )}
                              </div>
                              <p className="text-zinc-200 font-medium">{f.description}</p>
                              <p className="text-[11px] text-zinc-400 italic">💡 {f.recommendation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Open Revision Requests */}
                  {latestReview.revisionRequests?.length > 0 && (
                    <div className="pt-3 border-t border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono uppercase text-amber-400 font-semibold">
                          Open Revision Directives ({latestReview.revisionRequests.filter((r: any) => r.status === "OPEN").length})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStatusTransition("EDITING")}
                            className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium px-2 py-0.5 rounded transition-colors"
                          >
                            ✍️ Make Manual Revision
                          </button>
                          <button
                            onClick={handleApplyRevisionLoop}
                            disabled={revisionLoopRunning}
                            className="text-[11px] bg-amber-600 hover:bg-amber-500 text-white font-medium px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                          >
                            {revisionLoopRunning ? "Applying..." : "Auto-Fix via Writer"}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {latestReview.revisionRequests.map((rr: any) => (
                          <div
                            key={rr.id}
                            className="p-2 rounded bg-zinc-950/60 border border-zinc-800/80 text-[11px] font-mono text-zinc-300"
                          >
                            <span className="text-amber-400 font-bold">[{rr.category}]</span> {rr.instruction}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center space-y-3">
                  <ShieldCheck className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400">No editorial review recorded yet for this asset.</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setHumanReviewModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold border border-zinc-700 transition-colors"
                    >
                      <span>✍️</span> Human Review
                    </button>
                    <button
                      onClick={handleRunReview}
                      disabled={reviewRunning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {reviewRunning ? "Running Review..." : "Run AI Review Now"}
                    </button>
                  </div>
                </div>
              )}

              {/* Approval History Timeline */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                <span className="text-xs font-mono uppercase text-zinc-400 font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Approval & Audit History ({approvalHistory.length})
                </span>

                {approvalHistory.length === 0 ? (
                  <p className="text-xs text-zinc-500 font-mono">No approval records yet.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {approvalHistory.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-1 font-mono"
                      >
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span
                            className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold ${
                              rec.action === "HUMAN_APPROVED"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : rec.action === "HUMAN_REJECTED"
                                ? "bg-red-950 text-red-400 border border-red-800"
                                : rec.action === "APPROVAL_REVOKED"
                                ? "bg-amber-950 text-amber-400 border border-amber-800"
                                : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {rec.action}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {formatTimeAgo(new Date(rec.createdAt))}
                          </span>
                        </div>
                        {rec.user && (
                          <div className="text-[11px] text-zinc-400">
                            By: <strong className="text-zinc-200">{rec.user.email}</strong> ({rec.user.role})
                          </div>
                        )}
                        {rec.comment && (
                          <p className="text-[11px] text-zinc-300 font-sans italic bg-zinc-900/80 p-1.5 rounded border border-zinc-800">
                            "{rec.comment}"
                          </p>
                        )}
                        {rec.reason && (
                          <p className="text-[11px] text-amber-300/90 font-sans italic bg-amber-950/30 p-1.5 rounded border border-amber-900/60">
                            Reason: "{rec.reason}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 1: Evidence Panel */}
          {activeTab === "evidence" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-zinc-400 font-semibold">
                  Campaign Claims & Provenance
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {asset.campaign.claims.length} registered
                </span>
              </div>

              {asset.campaign.claims.length === 0 ? (
                <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                  No verified claims mapped to this campaign yet. Run the Evidence Researcher to extract claims.
                </div>
              ) : (
                asset.campaign.claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold">
                        {claim.verificationStatus}
                      </span>
                      {claim.primarySource?.isSynthetic && (
                        <span className="text-[9px] font-mono uppercase bg-amber-950/80 text-amber-400 border border-amber-800 px-1 py-0.5 rounded">
                          SYNTHETIC
                        </span>
                      )}
                    </div>

                    <p className="text-zinc-200 font-medium leading-relaxed">
                      "{claim.claimText}"
                    </p>

                    {claim.evidence?.[0] && (
                      <blockquote className="text-[11px] text-zinc-400 border-l-2 border-blue-500 pl-2 italic">
                        "{claim.evidence[0].quoteSnippet}"
                      </blockquote>
                    )}

                    {claim.primarySource && (
                      <div className="text-[10px] font-mono text-zinc-500 truncate">
                        Source: {claim.primarySource.title}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: Diagnostics & Quality Panel */}
          {activeTab === "diagnostics" && (
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase text-zinc-400 font-semibold">
                Content Quality Diagnostics
              </span>

              {meta ? (
                <div className="space-y-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-xs font-mono">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-zinc-400">Total Words:</span>
                    <span className="text-zinc-100 font-bold">{meta.wordCount}</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-zinc-400">Speaking Time (~150wpm):</span>
                    <span className="text-blue-400 font-bold">~{meta.estimatedSpeakingDurationMinutes} min</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-zinc-400">Reading Time (~200wpm):</span>
                    <span className="text-zinc-100 font-bold">~{meta.estimatedReadingDurationMinutes} min</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-zinc-400">Readability Score:</span>
                    <span className="text-emerald-400 font-bold">{meta.readabilityScore}/100</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-zinc-400">Grade Level:</span>
                    <span className="text-zinc-300">{meta.readabilityGrade}</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-zinc-400">Evidence Coverage:</span>
                    <span className="text-emerald-400 font-bold">{meta.evidenceCoveragePercent}% backed</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Unsupported Claims:</span>
                    <span
                      className={`font-bold ${
                        meta.unsupportedClaimCount > 0 ? "text-amber-400" : "text-emerald-400"
                      }`}
                    >
                      {meta.unsupportedClaimCount}
                    </span>
                  </div>

                  {meta.brandRuleWarnings?.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800 space-y-1">
                      <span className="text-[10px] uppercase text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Editorial Warnings:
                      </span>
                      {meta.brandRuleWarnings.map((w: string, i: number) => (
                        <p key={i} className="text-[11px] text-amber-300/80 bg-amber-950/40 p-1.5 rounded border border-amber-900/60">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                  Save or generate a version to calculate quality diagnostics.
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Version History & Restore */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase text-zinc-400 font-semibold">
                Immutable Version History
              </span>

              {asset.versions.map((ver) => (
                <div
                  key={ver.id}
                  className={`p-3.5 rounded-xl border space-y-2 text-xs font-mono transition-all ${
                    ver.id === selectedVersionId
                      ? "bg-zinc-900 border-blue-600/80 shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                      v{ver.versionNumber}
                      <span className="text-[10px] text-zinc-400 font-normal">({ver.sourceType})</span>
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {formatTimeAgo(new Date(ver.createdAt))}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-300 font-sans">{ver.changeSummary}</p>

                  <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-500">
                    <span>{ver.author || "Operator"}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelectVersion(ver.id)}
                        className="text-blue-400 hover:underline"
                      >
                        View
                      </button>
                      {ver.id !== asset.currentVersionId && (
                        <button
                          onClick={() => handleRestoreVersion(ver.id)}
                          className="text-emerald-400 hover:underline flex items-center gap-0.5"
                        >
                          <RotateCcw className="w-2.5 h-2.5" /> Restore
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visual Diff Modal */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl flex flex-col space-y-4 overflow-hidden">
            {/* Diff Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-blue-400" />
                  Visual Version Diff
                </h2>
                <p className="text-xs text-zinc-400">
                  Compare additions, deletions, and modifications between versions.
                </p>
              </div>

              <button onClick={() => setDiffModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Version Selectors & View Mode */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-2">
                <label className="text-xs font-mono text-zinc-400">Base:</label>
                <select
                  value={diffV1Id}
                  onChange={(e) => {
                    setDiffV1Id(e.target.value);
                    fetchDiff(e.target.value, diffV2Id);
                  }}
                  className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-2.5 py-1.5 rounded font-mono"
                >
                  {asset.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} ({v.sourceType})
                    </option>
                  ))}
                </select>

                <span className="text-xs font-mono text-zinc-500">vs</span>

                <label className="text-xs font-mono text-zinc-400">Target:</label>
                <select
                  value={diffV2Id}
                  onChange={(e) => {
                    setDiffV2Id(e.target.value);
                    fetchDiff(diffV1Id, e.target.value);
                  }}
                  className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-2.5 py-1.5 rounded font-mono"
                >
                  {asset.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} ({v.sourceType})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setDiffViewMode("structured")}
                  className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                    diffViewMode === "structured"
                      ? "bg-blue-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Structured Diff
                </button>
                <button
                  onClick={() => setDiffViewMode("text")}
                  className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                    diffViewMode === "text"
                      ? "bg-blue-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Line Text Diff
                </button>
              </div>
            </div>

            {/* Diff Body Content */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {diffLoading ? (
                <div className="py-16 text-center text-xs font-mono text-zinc-500">
                  Calculating diff...
                </div>
              ) : !diffResult ? (
                <div className="py-16 text-center text-xs text-zinc-400">
                  Select two versions to view changes.
                </div>
              ) : diffViewMode === "structured" ? (
                <div className="space-y-3">
                  {/* Summary Bar */}
                  <div className="flex items-center gap-4 text-xs font-mono bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                    <span className="text-emerald-400">+{diffResult.summary.blocksAdded} added</span>
                    <span className="text-rose-400">-{diffResult.summary.blocksRemoved} removed</span>
                    <span className="text-amber-400">~{diffResult.summary.blocksModified} modified</span>
                  </div>

                  {diffResult.structuredDiff.map((item: any, i: number) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                        item.changeType === "ADDED"
                          ? "bg-emerald-950/20 border-emerald-800/80"
                          : item.changeType === "REMOVED"
                          ? "bg-rose-950/20 border-rose-800/80"
                          : item.changeType === "MODIFIED"
                          ? "bg-amber-950/20 border-amber-800/80"
                          : "bg-zinc-950 border-zinc-800"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-zinc-200">
                          {item.blockType} #{item.orderIndex + 1}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            item.changeType === "ADDED"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : item.changeType === "REMOVED"
                              ? "bg-rose-950 text-rose-400 border border-rose-800"
                              : item.changeType === "MODIFIED"
                              ? "bg-amber-950 text-amber-400 border border-amber-800"
                              : "text-zinc-500"
                          }`}
                        >
                          {item.changeType}
                        </span>
                      </div>

                      {item.title?.changed && (
                        <div className="text-[11px] font-mono space-y-0.5">
                          {item.title.old && <p className="text-rose-400 line-through">- {item.title.old}</p>}
                          {item.title.new && <p className="text-emerald-400">+ {item.title.new}</p>}
                        </div>
                      )}

                      <div className="space-y-1 font-sans text-xs">
                        {item.contentDiff.map((c: any, ci: number) => (
                          <span
                            key={ci}
                            className={
                              c.type === "added"
                                ? "bg-emerald-950 text-emerald-300 font-semibold px-1 rounded mr-1"
                                : c.type === "removed"
                                ? "bg-rose-950 text-rose-300 line-through px-1 rounded mr-1"
                                : "text-zinc-300 mr-1"
                            }
                          >
                            {c.value}{" "}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Line-by-Line Text Diff */
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs space-y-1 overflow-x-auto">
                  {diffResult.textDiff.map((line: any, i: number) => (
                    <div
                      key={i}
                      className={`px-2 py-0.5 rounded ${
                        line.type === "added"
                          ? "bg-emerald-950/80 text-emerald-300"
                          : line.type === "removed"
                          ? "bg-rose-950/80 text-rose-300 line-through"
                          : "text-zinc-400"
                      }`}
                    >
                      {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                      {line.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Rewrite / Instructions Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                AI Writer: {aiMode.replace("_", " ")}
              </h2>
              <button onClick={() => setAiModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Specific Instructions / Tone Guidelines
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Make chapter 2 more punchy, emphasize newsroom study statistics..."
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  onClick={() => setAiModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleTriggerGeneration(aiMode)}
                  disabled={generating}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {generating ? "Executing..." : "Execute & Create Version"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Human Approval Modal */}
      {approvalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Mandatory Human Approval Gate
              </h2>
              <button onClick={() => setApprovalModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono text-zinc-300">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 space-y-1">
                <div>Target: <strong className="text-white">{asset.title}</strong></div>
                <div>Version: <strong className="text-blue-400">v{selectedVersion.versionNumber}</strong> ({selectedVersion.sourceType})</div>
                <div>Blocks: <strong className="text-zinc-200">{selectedVersion.blocks?.length || 0}</strong></div>
                {latestReview && (
                  <div>Review Verdict: <strong className="text-emerald-400">{latestReview.verdict} ({latestReview.overallScore}/100)</strong></div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-200 font-sans">
                  Mandatory Sign-off Comment / Editorial Rationale <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Verified chapter 2 benchmarks against internal lab dataset. Script is approved for production."
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setApprovalModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleHumanApprove}
                  disabled={!approvalComment.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm Human Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Human Rejection Modal */}
      {rejectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Request Revisions / Reject Version
              </h2>
              <button onClick={() => setRejectionModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-200">
                  Mandatory Rejection Reason / Directives <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Tone in opening chapter is overly defensive. Please expand on the multi-agent state machine diagram."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setRejectionModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleHumanReject}
                  disabled={!rejectionReason.trim()}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 disabled:opacity-50"
                >
                  Confirm Rejection & Request Revisions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Approval Modal */}
      {revokeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-red-400" />
                Revoke Human Approval
              </h2>
              <button onClick={() => setRevokeModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-lg text-red-300">
                Revoking approval transitions this asset back to <strong>READY_FOR_REVIEW</strong>.
                The historical approval log will be preserved in the audit trail.
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-200">
                  Mandatory Revocation Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. New conflicting evidence emerged regarding study benchmark accuracy."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setRevokeModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevokeApproval}
                  disabled={!revokeReason.trim()}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 disabled:opacity-50"
                >
                  Confirm Revoke Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 7 Publish Modal */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-400" />
                Publish to External Channel
              </h2>
              <button onClick={() => setPublishModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-blue-950/40 border border-blue-800/80 rounded-lg text-blue-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  Exact Version Binding & Idempotent Delivery
                </div>
                <p className="text-[11px] text-blue-200/90 leading-relaxed">
                  Publishing is cryptographically locked to approved <strong>v{selectedVersion.versionNumber}</strong>. Subsequent edits will invalidate publishing eligibility until re-approved.
                </p>
              </div>

              {connectedAccounts.length === 0 ? (
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-center space-y-2">
                  <p className="text-zinc-400">No active distribution channels connected for this brand.</p>
                  <Link
                    href="/publishing"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Connect YouTube, X, or LinkedIn in Channels Console
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Select Target Distribution Channel
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => {
                        setSelectedAccountId(e.target.value);
                        fetchPublishPreview(e.target.value);
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                    >
                      {connectedAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.platform} — {acc.accountName} ({acc.accountId})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3 space-y-2 text-zinc-400">
                    <div className="flex justify-between">
                      <span>Asset Title:</span>
                      <span className="font-semibold text-zinc-200">{asset.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Content Format:</span>
                      <span className="font-mono text-zinc-300">{asset.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Approved Version:</span>
                      <span className="font-mono text-emerald-400">v{selectedVersion.versionNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Blocks to Deliver:</span>
                      <span className="font-mono text-zinc-300">{blocks.length} sections</span>
                    </div>
                  </div>

                  {/* Payload Preview */}
                  {publishPreview && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-300">Payload Preview</span>
                        <span className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                          {publishPreview.characterCount} characters
                        </span>
                      </div>
                      <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800/80 text-[11px] font-mono text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {publishPreview.formattedText || "(Empty content)"}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setPublishModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecutePublish}
                  disabled={publishing || connectedAccounts.length === 0 || !selectedAccountId}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${publishing ? "animate-spin" : ""}`} />
                  {publishing ? "Publishing..." : "Execute Human Publish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Human Editorial Review Modal */}
      {humanReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✍️</span>
                <h2 className="text-base font-bold text-white">Human Editorial Review</h2>
              </div>
              <button onClick={() => setHumanReviewModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1 text-zinc-400">
                <div className="font-semibold text-zinc-200">Reviewing: {asset.title} (v{selectedVersion.versionNumber})</div>
                <p className="text-[11px]">Human editorial verdict sets asset status to REVIEW_PASSED or REVISION_REQUIRED. Final approval gate remains a separate explicit step.</p>
              </div>

              <div>
                <label className="block font-medium text-zinc-300 mb-1.5">Verdict *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["PASS", "REQUEST_REVISION", "FAIL"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setHumanVerdict(v)}
                      className={`p-2 rounded-lg border text-center font-medium transition-all text-xs ${
                        humanVerdict === v
                          ? v === "PASS"
                            ? "bg-emerald-950/70 border-emerald-600 text-emerald-300 ring-1 ring-emerald-500"
                            : v === "REQUEST_REVISION"
                            ? "bg-amber-950/70 border-amber-600 text-amber-300 ring-1 ring-amber-500"
                            : "bg-red-950/70 border-red-600 text-red-300 ring-1 ring-red-500"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {v.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium text-zinc-300 mb-1">
                  Editorial Score (1-100)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={humanReviewScore}
                  onChange={(e) => setHumanReviewScore(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-300 mb-1">
                  Review Summary & Editorial Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Structure is sound and claims are accurate. Hook has high retention potential."
                  value={humanReviewSummary}
                  onChange={(e) => setHumanReviewSummary(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setHumanReviewModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteHumanReview}
                  disabled={humanReviewing || !humanReviewSummary.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50"
                >
                  {humanReviewing ? "Submitting..." : "Submit Review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

