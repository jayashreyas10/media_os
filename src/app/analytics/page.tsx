"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  Eye,
  Radio,
  Clock,
  Target,
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  RefreshCw,
  Sliders,
  ShieldCheck,
  BrainCircuit,
  Info,
} from "lucide-react";

interface KPIOverview {
  totalImpressions: number;
  totalViews: number;
  totalEngagements: number;
  totalClicks: number;
  totalWatchTimeSeconds: number;
  totalConversions: number;
  totalSubscribersGained: number;
  avgCtr: number;
  avgEngagementRate: number;
  avgViewDurationSeconds: number;
  snapshotCount: number;
}

interface FormatMetric {
  format: string;
  uniqueAssets: number;
  impressions: number;
  views: number;
  engagements: number;
  clicks: number;
  watchTimeSeconds: number;
  ctr: number;
  engagementRate: number;
}

interface PerformerItem {
  assetId: string;
  title: string;
  format: string;
  views: number;
  impressions: number;
  engagements: number;
  clicks: number;
  engagementRate: number;
  isSynthetic: boolean;
}

interface LearningRecordItem {
  id: string;
  category: string;
  sentiment: "WINNING" | "WEAK" | "NEUTRAL" | "OPPORTUNITY";
  observation: string;
  hypothesis?: string;
  sampleSize: number;
  confidenceScore: number;
  statisticalSignificance:
    | "STATISTICALLY_SIGNIFICANT"
    | "DIRECTIONAL"
    | "ANECDOTAL"
    | "ELIGIBLE_FOR_TESTING";
  supportingMetricsJson: string;
  limitations: string;
  dataSourcesJson?: string;
  recommendations: StrategyRecommendationItem[];
  createdAt: string;
}

interface StrategyRecommendationItem {
  id: string;
  title: string;
  recommendation: string;
  targetPillar?: string;
  targetFormat?: string;
  actionType: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  reviewNotes?: string;
  reviewedAt?: string;
}

export default function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIOverview | null>(null);
  const [hasSyntheticData, setHasSyntheticData] = useState(false);
  const [formatAnalytics, setFormatAnalytics] = useState<FormatMetric[]>([]);
  const [topPerformers, setTopPerformers] = useState<PerformerItem[]>([]);
  const [bottomPerformers, setBottomPerformers] = useState<PerformerItem[]>([]);
  const [learnings, setLearnings] = useState<LearningRecordItem[]>([]);
  const [recommendations, setRecommendations] = useState<StrategyRecommendationItem[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "learnings" | "recommendations">("overview");

  // Ingest Modal State
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [ingestPlatform, setIngestPlatform] = useState("YOUTUBE");
  const [ingestViews, setIngestViews] = useState(12400);
  const [ingestImpressions, setIngestImpressions] = useState(48000);
  const [ingestLikes, setIngestLikes] = useState(840);
  const [ingestComments, setIngestComments] = useState(96);
  const [ingestClicks, setIngestClicks] = useState(1850);
  const [ingestWatchTime, setIngestWatchTime] = useState(42000);
  const [ingestIsSynthetic, setIngestIsSynthetic] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  // Review Modal State
  const [reviewingRec, setReviewingRec] = useState<StrategyRecommendationItem | null>(null);
  const [reviewAction, setReviewAction] = useState<"ACCEPT" | "REJECT">("ACCEPT");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [syncingChannels, setSyncingChannels] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleSyncChannels = async () => {
    setSyncingChannels(true);
    setSyncNotice(null);
    try {
      const res = await fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncNotice(`Auto-Sync completed across ${data.totalAccounts || 0} channels: ${data.succeeded || 0} succeeded.`);
        fetchData();
      } else {
        setSyncNotice(`Auto-Sync error: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setSyncNotice("Failed to run platform metric sync.");
    } finally {
      setSyncingChannels(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overviewRes, learningsRes, recsRes] = await Promise.all([
        fetch(`/api/analytics/overview?timeframe=${timeframe}`),
        fetch("/api/analytics/learnings"),
        fetch("/api/analytics/recommendations"),
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setKpis(data.kpis);
        setHasSyntheticData(Boolean(data.hasSyntheticData));
        setFormatAnalytics(data.formatAnalytics || []);
        setTopPerformers(data.topPerformers || []);
        setBottomPerformers(data.bottomPerformers || []);
      }

      if (learningsRes.ok) {
        const data = await learningsRes.json();
        setLearnings(data.learnings || []);
      }

      if (recsRes.ok) {
        const data = await recsRes.json();
        setRecommendations(data.recommendations || []);
      }
    } catch (err) {
      console.error("Failed to load analytics data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeframe]);

  const handleIngestSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngesting(true);
    try {
      const res = await fetch("/api/analytics/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: ingestPlatform,
          isSynthetic: ingestIsSynthetic,
          dataSource: ingestIsSynthetic ? "SYNTHETIC_GENERATOR" : "MANUAL_INGESTION",
          rawMetrics: {
            views: Number(ingestViews),
            impressions: Number(ingestImpressions),
            likes: Number(ingestLikes),
            comments: Number(ingestComments),
            clicks: Number(ingestClicks),
            watchTimeSeconds: Number(ingestWatchTime),
          },
        }),
      });

      if (res.ok) {
        setShowIngestModal(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(`Ingestion failed: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error ingesting metrics");
    } finally {
      setIngesting(false);
    }
  };

  const handleRunLearningEngine = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analytics/learnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setActiveTab("learnings");
        fetchData();
      } else {
        const err = await res.json();
        alert(`Analysis failed: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error running learning engine");
    } finally {
      setAnalyzing(false);
    }
  };

  const submitReview = async () => {
    if (!reviewingRec) return;
    setReviewing(true);
    try {
      const res = await fetch(`/api/analytics/recommendations/${reviewingRec.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reviewAction,
          reviewNotes,
        }),
      });

      if (res.ok) {
        setReviewingRec(null);
        setReviewNotes("");
        fetchData();
      } else {
        const err = await res.json();
        alert(`Review failed: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error submitting review");
    } finally {
      setReviewing(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${Math.floor(sec % 60)}s`;
  };

  const getSignificanceBadge = (sig: string) => {
    switch (sig) {
      case "STATISTICALLY_SIGNIFICANT":
        return {
          bg: "bg-emerald-950/80 text-emerald-400 border-emerald-800",
          label: "STATISTICALLY SIGNIFICANT (p < 0.05)",
        };
      case "ELIGIBLE_FOR_TESTING":
        return {
          bg: "bg-amber-950/80 text-amber-400 border-amber-800",
          label: "ELIGIBLE FOR TESTING (N ≥ 10)",
        };
      case "DIRECTIONAL":
        return {
          bg: "bg-blue-950/80 text-blue-400 border-blue-800",
          label: "DIRECTIONAL TREND (3 ≤ N < 10)",
        };
      default:
        return {
          bg: "bg-zinc-800/90 text-zinc-400 border-zinc-700",
          label: "ANECDOTAL OBSERVATION (N < 3)",
        };
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-400" />
              Analytics & Learning Engine
            </h1>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800">
              Phase 6
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Performance tracking, empirical pattern recognition, and human-gated strategy feedback.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Timeframe selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex text-xs font-medium">
            {(["7d", "30d", "90d", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  timeframe === t
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowIngestModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            Ingest Metrics
          </button>

          <button
            onClick={handleSyncChannels}
            disabled={syncingChannels}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-emerald-400 text-xs font-semibold rounded-lg border border-zinc-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingChannels ? "animate-spin" : ""}`} />
            {syncingChannels ? "Syncing Channels..." : "Auto-Sync Channels"}
          </button>

          <button
            onClick={handleRunLearningEngine}
            disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition"
          >
            {analyzing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Run Learning Engine
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="rounded-lg border border-blue-800/80 bg-blue-950/40 p-3 text-xs text-blue-200 flex items-center justify-between">
          <span>{syncNotice}</span>
          <button onClick={() => setSyncNotice(null)} className="text-zinc-400 hover:text-white text-xs ml-2 font-mono">
            Dismiss
          </button>
        </div>
      )}

      {/* Synthetic Data Notice Banner */}
      {hasSyntheticData && (
        <div className="rounded-lg border border-amber-800/80 bg-amber-950/40 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-bold font-mono uppercase text-amber-300 mr-2">
              [DEMONSTRATION MODE: Includes SYNTHETIC / DEMONSTRATION DATA]
            </span>
            Historical metrics include synthetic demonstration snapshots generated for development and testing. Synthetic data is isolated with explicit provenance tags and is never conflated with live platform telemetry.
          </div>
        </div>
      )}

      {/* Workspace Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition ${
            activeTab === "overview"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Performance Overview
        </button>
        <button
          onClick={() => setActiveTab("learnings")}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "learnings"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Learned Insights
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
            {learnings.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("recommendations")}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === "recommendations"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Strategy Recommendations Gate
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
            {recommendations.filter((r) => r.status === "PENDING").length} pending
          </span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-500 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Loading analytics intelligence...
        </div>
      ) : activeTab === "overview" ? (
        <div className="space-y-8">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                <span>Total Views</span>
                <Eye className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-100">
                {kpis?.totalViews.toLocaleString() || 0}
              </div>
              <div className="text-[11px] text-zinc-400 mt-1">
                {kpis?.snapshotCount || 0} snapshots
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                <span>Impressions</span>
                <Radio className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-100">
                {kpis?.totalImpressions.toLocaleString() || 0}
              </div>
              <div className="text-[11px] text-zinc-400 mt-1">Raw observed reach</div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                <span>Avg CTR</span>
                <Target className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-100">
                {((kpis?.avgCtr || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-[11px] text-zinc-400 mt-1">
                {kpis?.totalClicks.toLocaleString() || 0} clicks
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                <span>Engagement Rate</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-100">
                {((kpis?.avgEngagementRate || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-[11px] text-zinc-400 mt-1">
                {kpis?.totalEngagements.toLocaleString() || 0} total actions
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                <span>Total Watch Time</span>
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-100">
                {formatSeconds(kpis?.totalWatchTimeSeconds || 0)}
              </div>
              <div className="text-[11px] text-zinc-400 mt-1">
                Avg {kpis?.avgViewDurationSeconds || 0}s/view
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                <span>Conversions</span>
                <Award className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-100">
                {kpis?.totalConversions.toLocaleString() || 0}
              </div>
              <div className="text-[11px] text-zinc-400 mt-1">Direct downstream actions</div>
            </div>
          </div>

          {/* Format Analytics Breakdown */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              Format Performance Benchmarks
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {formatAnalytics.map((fmt) => (
                <div
                  key={fmt.format}
                  className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-zinc-200">
                      {fmt.format.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
                      {fmt.uniqueAssets} assets
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-zinc-800/60">
                    <div>
                      <span className="text-zinc-500 text-[11px] block">Total Views</span>
                      <span className="font-semibold text-zinc-200">
                        {fmt.views.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block">Engagement</span>
                      <span className="font-semibold text-zinc-200">
                        {(fmt.engagementRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block">CTR</span>
                      <span className="font-semibold text-zinc-200">
                        {(fmt.ctr * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block">Watch Time</span>
                      <span className="font-semibold text-zinc-200">
                        {formatSeconds(fmt.watchTimeSeconds)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top vs Bottom Performers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4" />
                Top Performing Content Assets
              </h3>
              {topPerformers.length === 0 ? (
                <div className="text-xs text-zinc-500 py-6 text-center">
                  No ranked assets yet. Ingest performance snapshots to evaluate ranking.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topPerformers.map((item) => (
                    <div
                      key={item.assetId}
                      className="flex items-center justify-between p-3 bg-zinc-900/90 border border-zinc-800/80 rounded-lg text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium text-zinc-100">{item.title}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {item.format} • {item.views.toLocaleString()} views
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-emerald-400">
                          {(item.engagementRate * 100).toFixed(2)}% eng
                        </div>
                        {item.isSynthetic && (
                          <div className="text-[9px] text-amber-400 font-mono">
                            SYNTHETIC DATA
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-rose-400 flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4" />
                Underperforming Content Assets
              </h3>
              {bottomPerformers.length === 0 ? (
                <div className="text-xs text-zinc-500 py-6 text-center">
                  No underperforming assets flagged.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {bottomPerformers.map((item) => (
                    <div
                      key={item.assetId}
                      className="flex items-center justify-between p-3 bg-zinc-900/90 border border-zinc-800/80 rounded-lg text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium text-zinc-100">{item.title}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {item.format} • {item.views.toLocaleString()} views
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-rose-400">
                          {(item.engagementRate * 100).toFixed(2)}% eng
                        </div>
                        {item.isSynthetic && (
                          <div className="text-[9px] text-amber-400 font-mono">
                            SYNTHETIC DATA
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "learnings" ? (
        /* Learned Insights Tab */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-blue-400" />
              Empirical Pattern Recognition & Learned Insights
            </h2>
            <button
              onClick={handleRunLearningEngine}
              disabled={analyzing}
              className="text-xs font-semibold px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg flex items-center gap-1.5"
            >
              {analyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Re-analyze Data
            </button>
          </div>

          {learnings.length === 0 ? (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-12 text-center space-y-3">
              <BrainCircuit className="w-8 h-8 text-zinc-600 mx-auto" />
              <div className="text-sm font-medium text-zinc-300">
                No learning records generated yet
              </div>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Ingest metric snapshots and click "Run Learning Engine" to synthesize empirical patterns.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {learnings.map((lr) => {
                const sigBadge = getSignificanceBadge(lr.statisticalSignificance);
                return (
                  <div
                    key={lr.id}
                    className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                            lr.sentiment === "WINNING"
                              ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                              : lr.sentiment === "WEAK"
                              ? "bg-rose-950 text-rose-400 border-rose-800"
                              : "bg-blue-950 text-blue-400 border-blue-800"
                          }`}
                        >
                          {lr.sentiment} {lr.category}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${sigBadge.bg}`}
                        >
                          {sigBadge.label}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-400 font-mono">
                        N = {lr.sampleSize} assets • Confidence {lr.confidenceScore}%
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-zinc-100 font-medium leading-relaxed">
                        {lr.observation}
                      </div>
                      {lr.hypothesis && (
                        <div className="text-xs text-zinc-400 leading-relaxed italic">
                          Hypothesis: {lr.hypothesis}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-3 flex items-start gap-2.5 text-xs text-zinc-400">
                      <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-zinc-300">Methodological Limitations: </span>
                        {lr.limitations}
                      </div>
                    </div>

                    {lr.recommendations.length > 0 && (
                      <div className="pt-2 border-t border-zinc-800/60">
                        <span className="text-[11px] font-semibold text-zinc-400 block mb-2">
                          Attached Strategy Recommendation:
                        </span>
                        {lr.recommendations.map((rec) => (
                          <div
                            key={rec.id}
                            className="bg-zinc-900/90 border border-zinc-800 p-3 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div className="space-y-1">
                              <span className="font-semibold text-zinc-200">{rec.title}</span>
                              <p className="text-zinc-400 text-[11px]">{rec.recommendation}</p>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase shrink-0 ml-4 ${
                                rec.status === "ACCEPTED"
                                  ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                                  : rec.status === "REJECTED"
                                  ? "bg-rose-950 text-rose-400 border-rose-800"
                                  : "bg-amber-950 text-amber-400 border-amber-800"
                              }`}
                            >
                              {rec.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Strategy Recommendations Human Gate Tab */
        <div className="space-y-6">
          <div className="border-b border-zinc-800 pb-4">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Human Approval Gate: Strategy Recommendations
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              AI proposes strategic directives from empirical performance. An authenticated human operator must explicitly ACCEPT or REJECT each recommendation before it can guide future content strategy. Brand Brain is never modified silently.
            </p>
          </div>

          {recommendations.length === 0 ? (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500 text-xs">
              No strategy recommendations currently queued for review.
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 uppercase">
                        {rec.actionType}
                      </span>
                      {rec.targetFormat && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {rec.targetFormat}
                        </span>
                      )}
                      {rec.targetPillar && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          Pillar: {rec.targetPillar}
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2.5 py-0.5 rounded border uppercase font-semibold ${
                        rec.status === "ACCEPTED"
                          ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                          : rec.status === "REJECTED"
                          ? "bg-rose-950 text-rose-400 border-rose-800"
                          : "bg-amber-950 text-amber-400 border-amber-800"
                      }`}
                    >
                      {rec.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-zinc-100">{rec.title}</h3>
                    <p className="text-xs text-zinc-300 leading-relaxed">{rec.recommendation}</p>
                  </div>

                  {rec.status === "PENDING" ? (
                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
                      <button
                        onClick={() => {
                          setReviewingRec(rec);
                          setReviewAction("REJECT");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 text-rose-300 text-xs font-semibold rounded-lg transition"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject Recommendation
                      </button>
                      <button
                        onClick={() => {
                          setReviewingRec(rec);
                          setReviewAction("ACCEPT");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Accept Recommendation
                      </button>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                      <div>
                        {rec.status === "ACCEPTED" ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Active in future Strategist context
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Excluded from future strategy formulation
                          </span>
                        )}
                      </div>
                      {rec.reviewNotes && <span>Notes: {rec.reviewNotes}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ingest Metrics Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                Ingest Performance Snapshot
              </h3>
              <button
                onClick={() => setShowIngestModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleIngestSnapshot} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Platform</label>
                <select
                  value={ingestPlatform}
                  onChange={(e) => setIngestPlatform(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                >
                  <option value="YOUTUBE">YouTube</option>
                  <option value="X">X (Twitter)</option>
                  <option value="LINKEDIN">LinkedIn</option>
                  <option value="NEWSLETTER">Newsletter</option>
                  <option value="GENERIC">Generic Social</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Views</label>
                  <input
                    type="number"
                    value={ingestViews}
                    onChange={(e) => setIngestViews(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    min="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Impressions</label>
                  <input
                    type="number"
                    value={ingestImpressions}
                    onChange={(e) => setIngestImpressions(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Likes / Reactions</label>
                  <input
                    type="number"
                    value={ingestLikes}
                    onChange={(e) => setIngestLikes(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Comments / Replies</label>
                  <input
                    type="number"
                    value={ingestComments}
                    onChange={(e) => setIngestComments(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Clicks</label>
                  <input
                    type="number"
                    value={ingestClicks}
                    onChange={(e) => setIngestClicks(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Watch Time (seconds)</label>
                  <input
                    type="number"
                    value={ingestWatchTime}
                    onChange={(e) => setIngestWatchTime(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    min="0"
                  />
                </div>
              </div>

              {/* Synthetic Data Checkbox */}
              <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ingestIsSynthetic}
                    onChange={(e) => setIngestIsSynthetic(e.target.checked)}
                    className="rounded border-zinc-700 text-blue-600 focus:ring-0"
                  />
                  <span className="font-semibold text-zinc-200">
                    Flag as SYNTHETIC / DEMONSTRATION DATA
                  </span>
                </label>
                <p className="text-[11px] text-zinc-400 mt-1 pl-6">
                  Mandatory for all mock/local testing. Preserves explicit provenance tags and displays notice banner.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ingesting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg disabled:opacity-50"
                >
                  {ingesting ? "Ingesting..." : "Ingest Snapshot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Recommendation Modal */}
      {reviewingRec && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                {reviewAction === "ACCEPT" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-400" />
                )}
                {reviewAction === "ACCEPT" ? "Accept Recommendation" : "Reject Recommendation"}
              </h3>
              <button
                onClick={() => setReviewingRec(null)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg">
                <span className="font-semibold text-zinc-200 block mb-1">
                  {reviewingRec.title}
                </span>
                <p className="text-zinc-400 leading-relaxed">{reviewingRec.recommendation}</p>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Editorial Notes (Optional)</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={
                    reviewAction === "ACCEPT"
                      ? "e.g. Focus on microservices topic first..."
                      : "e.g. Disagree with hook hypothesis..."
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 h-20 text-xs"
                />
              </div>

              <div className="text-[11px] text-zinc-500 italic">
                {reviewAction === "ACCEPT"
                  ? "This recommendation will be injected into future Strategist agent runs for this brand. Brand Brain identity and rules remain untouched."
                  : "This recommendation will be archived as rejected and will NEVER enter future Strategist context."}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setReviewingRec(null)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={reviewing}
                className={`px-4 py-1.5 text-white font-semibold text-xs rounded-lg disabled:opacity-50 ${
                  reviewAction === "ACCEPT"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-rose-600 hover:bg-rose-500"
                }`}
              >
                {reviewing ? "Processing..." : `Confirm ${reviewAction}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
