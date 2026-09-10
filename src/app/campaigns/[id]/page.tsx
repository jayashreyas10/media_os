"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  KanbanSquare,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  History,
  ShieldAlert,
  Cpu,
  ChevronRight,
  BookOpen,
  FileText,
  Search,
  ExternalLink,
  Target,
  Share2,
  ListOrdered,
  RefreshCw,
  FileEdit,
} from "lucide-react";
import {
  CAMPAIGN_STAGES,
  STAGE_METADATA,
  VALID_TRANSITIONS,
  CampaignStage,
} from "@/server/domain/campaign-state-machine";
import { formatDateTime, formatTimeAgo } from "@/lib/utils";

interface ClaimDetail {
  id: string;
  claimText: string;
  confidence: number;
  isFact: boolean;
  verificationStatus: string;
  contradictionNote?: string | null;
  primarySource?: {
    id: string;
    title: string;
    url?: string | null;
    publisher?: string | null;
    sourceType?: string | null;
    isSynthetic?: boolean;
    trustScore?: number;
  } | null;
  evidence: Array<{
    id: string;
    quoteSnippet: string;
    context?: string | null;
    supportStance?: string;
    isQuoteVerified?: boolean;
    groundingScore?: number;
  }>;
}

interface StrategySection {
  title: string;
  keyPoints: string[];
  purpose: string;
}

interface StrategyData {
  targetReader: string;
  outcome: string;
  centralTension: string;
  thesis: string;
  whyNow: string;
  flagshipFormat: string;
  primaryHeadline: string;
  alternativeHeadlines: string[];
  keySections: StrategySection[];
  distributionEntryPoints: string[];
}

interface CampaignDetail {
  id: string;
  title: string;
  stage: string;
  priority: string;
  brief: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
  claims: ClaimDetail[];
  stageHistory: Array<{
    id: string;
    fromStage: string;
    toStage: string;
    reason: string | null;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    taskType: string;
    agentName: string;
    status: string;
    inputJson: string;
    outputJson: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [reasonInput, setReasonInput] = useState("");

  // Agent execution state
  const [executingAgent, setExecutingAgent] = useState<string | null>(null);
  const [runningResearcher, setRunningResearcher] = useState(false);
  const [runningStrategist, setRunningStrategist] = useState(false);
  const [studioAssets, setStudioAssets] = useState<any[]>([]);

  const fetchStudioAssets = async () => {
    try {
      const res = await fetch(`/api/studio/assets?campaignId=${id}`);
      const data = await res.json();
      if (res.ok) {
        setStudioAssets(data.assets || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchCampaign = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/campaigns/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCampaign(data.campaign);
      await fetchStudioAssets();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error loading campaign");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchCampaign();
      fetchStudioAssets();
    }
  }, [id]);

  const handleTransition = async (targetStage: string) => {
    try {
      setTransitioning(true);
      setErrorMsg("");
      setSuccessMsg("");

      const res = await fetch(`/api/campaigns/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStage,
          reason: reasonInput || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Transition failed");
      }

      setSuccessMsg(`Successfully advanced to ${targetStage}`);
      setReasonInput("");
      await fetchCampaign();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed transition");
    } finally {
      setTransitioning(false);
    }
  };

  const handleRunResearcher = async () => {
    try {
      setRunningResearcher(true);
      setErrorMsg("");
      setSuccessMsg("");

      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run researcher");

      setSuccessMsg(
        `Researcher completed: ${data.result.claimCount} claims extracted, ${data.result.sourceCount} primary sources linked.`
      );
      await fetchCampaign();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Researcher execution failed");
    } finally {
      setRunningResearcher(false);
    }
  };

  const handleRunStrategist = async () => {
    try {
      setRunningStrategist(true);
      setErrorMsg("");
      setSuccessMsg("");

      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run strategist");

      setSuccessMsg(
        `Strategist developed singular thesis: "${data.strategy.primaryHeadline}"`
      );
      await fetchCampaign();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Strategist execution failed");
    } finally {
      setRunningStrategist(false);
    }
  };

  const handleRunAgent = async (taskType: string, agentName: string) => {
    try {
      setExecutingAgent(taskType);
      setErrorMsg("");
      setSuccessMsg("");

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType,
          agentName,
          campaignId: id,
          autoExecute: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute agent");

      setSuccessMsg(`Executed ${agentName} in Mock AI mode.`);
      await fetchCampaign();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecutingAgent(null);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-xs font-mono text-zinc-500">
        Loading campaign pipeline state...
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-zinc-400 text-sm">Campaign not found.</p>
        <Link href="/campaigns" className="text-blue-400 text-xs hover:underline">
          Return to Campaigns
        </Link>
      </div>
    );
  }

  const currentStage = campaign.stage as CampaignStage;
  const currentStep = STAGE_METADATA[currentStage]?.stepNumber || 1;
  const validTargets = VALID_TRANSITIONS[currentStage] || [];

  // Parse campaign metadata for research package and strategy
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(campaign.metadataJson || "{}");
  } catch {
    metadata = {};
  }

  const strategy = (metadata.strategy as StrategyData) || null;
  const researchSummary = (metadata.researchSummary as string) || null;
  const contradictions = (metadata.contradictions as string[]) || [];
  const unknowns = (metadata.unknowns as string[]) || [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/campaigns" className="hover:text-zinc-200 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Campaigns
        </Link>
        <span>/</span>
        <span className="text-zinc-200 font-mono truncate max-w-xs">{campaign.title}</span>
      </div>

      {/* Campaign Header */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800/80 font-bold">
                Stage: {campaign.stage}
              </span>
              <span className="text-xs font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-800">
                Priority: {campaign.priority}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{campaign.title}</h1>
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            Created: {formatDateTime(campaign.createdAt)}
          </div>
        </div>

        {campaign.brief && (
          <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/70 p-3.5 rounded-lg border border-zinc-800">
            {campaign.brief}
          </p>
        )}
      </div>

      {/* Feedback Alerts */}
      {errorMsg && (
        <div className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-lg text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-800/80 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Interactive 11-Stage Pipeline Progression Bar */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
          State Machine Pipeline Progression
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {CAMPAIGN_STAGES.filter((s) => s !== "ARCHIVED").map((stage) => {
            const meta = STAGE_METADATA[stage];
            const isCurrent = stage === currentStage;
            const isPast = meta.stepNumber < currentStep;

            return (
              <div
                key={stage}
                className={`p-2.5 rounded-lg border text-xs transition-all ${
                  isCurrent
                    ? "bg-blue-950/70 border-blue-600 text-white shadow-sm ring-1 ring-blue-500"
                    : isPast
                    ? "bg-zinc-950/60 border-zinc-800 text-zinc-400"
                    : "bg-zinc-950/30 border-zinc-900 text-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span>#{meta.stepNumber}</span>
                  {isCurrent ? (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  ) : isPast ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  ) : null}
                </div>
                <div className="font-semibold tracking-tight truncate">{meta.label}</div>
              </div>
            );
          })}
        </div>

        {/* Transition Control Console */}
        <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-200">
              Permitted Next Transitions from <span className="font-mono text-blue-400">{currentStage}</span>:
            </div>
            <div className="text-[11px] text-zinc-500">
              Only allowed forward steps or revision gates can be triggered.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {validTargets.map((target) => {
              const isRevision =
                STAGE_METADATA[target as CampaignStage]?.stepNumber < currentStep;
              return (
                <button
                  key={target}
                  disabled={transitioning}
                  onClick={() => handleTransition(target)}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 ${
                    isRevision
                      ? "bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 text-amber-200"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  <span>{isRevision ? `Revision: ${target}` : `Advance to ${target}`}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upstream Intelligence Action Bar */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
            Upstream Agent Workflows
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunResearcher}
            disabled={runningResearcher}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {runningResearcher ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : (
              <Search className="w-3.5 h-3.5 text-blue-400" />
            )}
            {runningResearcher ? "Researching Sources..." : "Run Evidence Researcher"}
          </button>

          <button
            onClick={handleRunStrategist}
            disabled={runningStrategist}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {runningStrategist ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Target className="w-3.5 h-3.5" />
            )}
            {runningStrategist ? "Synthesizing Thesis..." : "Run Content Strategist"}
          </button>

          <Link
            href={`/studio?campaignId=${id}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors shadow-sm"
          >
            <FileEdit className="w-3.5 h-3.5" />
            Content Studio ({studioAssets.length})
          </Link>
        </div>
      </div>

      {/* Content Strategy / Singular Thesis Section */}
      {strategy && (
        <div className="bg-zinc-900/60 border border-blue-900/50 rounded-xl p-6 space-y-6 shadow-sm shadow-blue-950/30">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded bg-blue-950/80 border border-blue-800/80 text-blue-400">
                <Target className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-zinc-100">Editorial Strategy & Singular Thesis</h2>
                <p className="text-xs text-zinc-400">Synthesized by Content Strategist (Agent 03)</p>
              </div>
            </div>
            <span className="text-xs font-mono uppercase bg-blue-950 text-blue-300 px-2.5 py-1 rounded border border-blue-800 font-semibold">
              Format: {strategy.flagshipFormat}
            </span>
          </div>

          {/* Headline & Central Tension */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-4 space-y-2">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                Primary Headline
              </div>
              <h3 className="text-base font-bold text-zinc-100 leading-snug">
                {strategy.primaryHeadline}
              </h3>
              {strategy.alternativeHeadlines?.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
                  <span className="text-zinc-500 font-mono">A/B Testing Options: </span>
                  {strategy.alternativeHeadlines.join(" • ")}
                </div>
              )}
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-4 space-y-2">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                Central Tension
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {strategy.centralTension}
              </p>
            </div>
          </div>

          {/* Thesis Statement Banner */}
          <div className="bg-blue-950/30 border border-blue-800/60 rounded-lg p-4 space-y-1.5">
            <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider font-mono">
              High-Conviction Thesis Statement
            </div>
            <p className="text-sm font-medium text-blue-100 leading-relaxed">
              &ldquo;{strategy.thesis}&rdquo;
            </p>
          </div>

          {/* Target Reader & Desired Outcome */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-zinc-950/50 p-3.5 rounded border border-zinc-800">
              <span className="text-zinc-400 font-medium">Target Reader: </span>
              <span className="text-zinc-200">{strategy.targetReader}</span>
            </div>
            <div className="bg-zinc-950/50 p-3.5 rounded border border-zinc-800">
              <span className="text-zinc-400 font-medium">Desired Outcome: </span>
              <span className="text-zinc-200">{strategy.outcome}</span>
            </div>
          </div>

          {/* Key Narrative Sections */}
          {strategy.keySections && strategy.keySections.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5 text-zinc-400" />
                Narrative Outline & Key Arguments ({strategy.keySections.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {strategy.keySections.map((sec, i) => (
                  <div key={i} className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-200">{sec.title}</h4>
                      <span className="text-[10px] font-mono text-zinc-500">Part #{i + 1}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 italic">{sec.purpose}</p>
                    <ul className="text-xs text-zinc-300 list-disc list-inside space-y-1 pl-1">
                      {sec.keyPoints.map((kp, kIdx) => (
                        <li key={kIdx} className="leading-relaxed">{kp}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Distribution Entry Points */}
          {strategy.distributionEntryPoints && (
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-400 font-medium flex items-center gap-1">
                <Share2 className="w-3.5 h-3.5" /> Distribution Entry Points:
              </span>
              {strategy.distributionEntryPoints.map((dep, idx) => (
                <span
                  key={idx}
                  className="bg-zinc-800 text-zinc-200 px-2.5 py-0.5 rounded text-[11px] border border-zinc-700"
                >
                  {dep}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Downstream Content Studio Assets Section */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-purple-950/80 border border-purple-800/80 text-purple-400">
              <FileEdit className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Downstream Content Studio Assets</h2>
              <p className="text-xs text-zinc-400">Multi-format evidence-grounded scripts, articles, and posts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400 mr-2">
              {studioAssets.length} Assets Generated
            </span>
            <Link
              href={`/studio?campaignId=${id}`}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center gap-1.5"
            >
              <FileEdit className="w-3.5 h-3.5" /> Open Studio
            </Link>
          </div>
        </div>

        {studioAssets.length === 0 ? (
          <div className="bg-zinc-950/40 border border-dashed border-zinc-800 rounded-lg p-6 text-center text-xs text-zinc-500 space-y-2">
            <p>No content assets generated for this campaign yet.</p>
            <Link
              href={`/studio?campaignId=${id}`}
              className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-semibold"
            >
              Go to Content Studio to draft YouTube scripts, newsletters, or social threads &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {studioAssets.map((asset) => {
              const latestVersion = asset.versions?.[0];
              return (
                <Link
                  key={asset.id}
                  href={`/studio/${asset.id}`}
                  className="bg-zinc-950/80 border border-zinc-800/80 hover:border-purple-800/80 rounded-lg p-4 transition-all hover:bg-zinc-900/60 block group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                      {asset.type}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      asset.status === "APPROVED"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : asset.status === "READY_FOR_REVIEW"
                        ? "bg-blue-950 text-blue-300 border border-blue-800"
                        : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                    }`}>
                      {asset.status}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-100 group-hover:text-purple-300 transition-colors line-clamp-1 mb-1">
                    {asset.title}
                  </h4>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mt-3 pt-2 border-t border-zinc-900">
                    <span>v{latestVersion?.versionNumber || 1} • {latestVersion?.wordCount || 0} words</span>
                    <span className="text-purple-400 group-hover:translate-x-0.5 transition-transform">Edit &rarr;</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Research Package & Evidence Graph Section */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-zinc-800 text-zinc-300">
              <BookOpen className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Research Package & Evidence Graph</h2>
              <p className="text-xs text-zinc-400">Verifiable primary sources, extracted claims, and verbatim quotes</p>
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-400">
            {campaign.claims.length} Verified Claims
          </span>
        </div>

        {/* Research Summary Callout */}
        {researchSummary && (
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-300 space-y-1">
            <div className="font-semibold text-zinc-200 font-mono text-[11px] uppercase tracking-wider">
              Research Synthesis
            </div>
            <p className="leading-relaxed">{researchSummary}</p>
          </div>
        )}

        {/* Contradictions and Unknowns alerts */}
        {contradictions.length > 0 && (
          <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3.5 text-xs text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Contradictions Identified ({contradictions.length})
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-amber-300/90 pl-1">
              {contradictions.map((contra, idx) => (
                <li key={idx}>{contra}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Claims Table / List */}
        {campaign.claims.length === 0 ? (
          <div className="bg-zinc-950/40 border border-dashed border-zinc-800 rounded-lg p-8 text-center text-xs text-zinc-500">
            No research claims linked yet. Click &ldquo;Run Evidence Researcher&rdquo; above to gather primary sources and extract claims.
          </div>
        ) : (
          <div className="space-y-3">
            {campaign.claims.map((claim) => (
              <div
                key={claim.id}
                className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                          claim.verificationStatus === "VERIFIED"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : claim.verificationStatus === "UNRESOLVED"
                            ? "bg-purple-950 text-purple-300 border border-purple-800"
                            : claim.verificationStatus === "CONTRADICTED"
                            ? "bg-rose-950 text-rose-400 border border-rose-800"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        {claim.verificationStatus}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {claim.isFact ? "FACT" : "INFERENCE"}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        AI Self-Reported: {claim.confidence}%
                      </span>
                      {claim.primarySource?.isSynthetic && (
                        <span className="text-[9px] font-mono font-bold uppercase bg-amber-950/80 text-amber-400 border border-amber-800/80 px-1.5 py-0.5 rounded">
                          SYNTHETIC DEMO DATA
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-zinc-100 leading-snug">
                      {claim.claimText}
                    </p>
                    {claim.contradictionNote && (
                      <p className="text-[11px] text-amber-300/90 italic bg-amber-950/30 p-1.5 rounded border border-amber-900/50">
                        {claim.contradictionNote}
                      </p>
                    )}
                  </div>

                  {claim.primarySource && (
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {claim.primarySource.sourceType || "Source"}
                      </div>
                      <a
                        href={claim.primarySource.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 justify-end"
                      >
                        {claim.primarySource.title.slice(0, 30)}...
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Verbatim Evidence Snippet & Grounding Check */}
                {claim.evidence && claim.evidence.length > 0 && (
                  <div className="bg-zinc-900/70 rounded p-3 border border-zinc-800/70 text-xs text-zinc-300 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="uppercase tracking-wider text-zinc-500">
                        Verbatim Quote Snippet
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.2 rounded font-semibold uppercase ${
                            claim.evidence[0].supportStance === "SUPPORTS"
                              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                              : claim.evidence[0].supportStance === "CONTRADICTS"
                              ? "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                              : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                          }`}
                        >
                          {claim.evidence[0].supportStance || "SUPPORTS"}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded font-semibold ${
                            claim.evidence[0].isQuoteVerified
                              ? "text-emerald-400 bg-emerald-950/60 border border-emerald-800/50"
                              : "text-rose-400 bg-rose-950/60 border border-rose-800/50"
                          }`}
                        >
                          {claim.evidence[0].isQuoteVerified
                            ? "Grounded in Source Text ✓"
                            : "Ungrounded Quote ✗"}
                        </span>
                      </div>
                    </div>
                    <p className="italic text-zinc-300 font-serif leading-relaxed">
                      &ldquo;{claim.evidence[0].quoteSnippet}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Operations Console for this Campaign */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Execute Agent Roles */}
        <div className="lg:col-span-1 bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              Campaign AI Agents
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Dispatch individual agent roles against this campaign.
            </p>
          </div>

          <div className="space-y-2">
            {[
              { type: "SIGNAL_SCOUT", name: "Signal Scout", desc: "Score opportunity" },
              { type: "RESEARCHER", name: "Evidence Researcher", desc: "Verify claims & sources" },
              { type: "STRATEGIST", name: "Content Strategist", desc: "Devise singular thesis" },
              { type: "WRITER", name: "Lead Scriptwriter", desc: "Draft full YouTube script" },
              { type: "DISTRIBUTION", name: "Distribution Agent", desc: "Generate X / LinkedIn assets" },
              { type: "EDITOR", name: "Editorial Reviewer", desc: "Fact check & brand alignment" },
            ].map((agent) => (
              <button
                key={agent.type}
                disabled={executingAgent !== null}
                onClick={() => handleRunAgent(agent.type, agent.name)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 text-left transition-colors group disabled:opacity-50"
              >
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400">
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-zinc-500">{agent.desc}</div>
                </div>
                <Sparkles className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Right: Stage History & Task Output Stream */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stage Transition History */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
              <History className="w-4 h-4 text-zinc-400" />
              Stage Transition Audit Trail
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {campaign.stageHistory.map((hist) => (
                <div
                  key={hist.id}
                  className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-xs flex items-center justify-between font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">{hist.fromStage}</span>
                    <span className="text-zinc-600">&rarr;</span>
                    <span className="text-blue-400 font-semibold">{hist.toStage}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {formatDateTime(hist.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Task Results */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Agent Execution Outputs ({campaign.tasks.length})
            </h3>

            <div className="space-y-3">
              {campaign.tasks.length === 0 ? (
                <div className="text-xs text-zinc-500 py-6 text-center">
                  No tasks executed for this campaign yet. Run an agent from the left panel.
                </div>
              ) : (
                campaign.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-100">{task.agentName}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                        {task.status}
                      </span>
                    </div>

                    {task.outputJson && (
                      <pre className="text-[11px] font-mono bg-zinc-900 p-3 rounded border border-zinc-800/80 overflow-x-auto text-zinc-300 max-h-40 leading-relaxed">
                        {JSON.stringify(JSON.parse(task.outputJson), null, 2)}
                      </pre>
                    )}

                    <div className="text-[10px] text-zinc-500 font-mono">
                      Task ID: #{task.id.slice(0, 8)} • {formatTimeAgo(task.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
