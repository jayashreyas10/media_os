"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileEdit,
  Plus,
  Search,
  Filter,
  Video,
  FileText,
  Twitter,
  Linkedin,
  Share2,
  Sparkles,
  Layers,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

interface ContentAssetItem {
  id: string;
  title: string;
  type: string;
  status: string;
  qualityMetadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
  campaign: {
    id: string;
    title: string;
    stage: string;
  };
  strategy?: {
    id: string;
    primaryHeadline: string;
  } | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    changeSummary: string;
    sourceType: string;
    createdAt: string;
  }>;
}

interface CampaignOption {
  id: string;
  title: string;
}

const FORMAT_CONFIG: Record<
  string,
  { label: string; icon: any; color: string; bg: string; border: string }
> = {
  YOUTUBE_LONG_FORM: {
    label: "YouTube Long-Form",
    icon: Video,
    color: "text-red-400",
    bg: "bg-red-950/40",
    border: "border-red-800/60",
  },
  YOUTUBE_SHORT: {
    label: "YouTube Short",
    icon: Video,
    color: "text-rose-400",
    bg: "bg-rose-950/40",
    border: "border-rose-800/60",
  },
  NEWSLETTER: {
    label: "Newsletter",
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-950/40",
    border: "border-blue-800/60",
  },
  X_THREAD: {
    label: "X Thread",
    icon: Twitter,
    color: "text-sky-400",
    bg: "bg-sky-950/40",
    border: "border-sky-800/60",
  },
  LINKEDIN_POST: {
    label: "LinkedIn Post",
    icon: Linkedin,
    color: "text-indigo-400",
    bg: "bg-indigo-950/40",
    border: "border-indigo-800/60",
  },
  GENERIC_SOCIAL: {
    label: "Social Asset",
    icon: Share2,
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-800/60",
  },
};

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  DRAFT: { label: "Draft", bg: "bg-zinc-800", text: "text-zinc-300", border: "border-zinc-700" },
  GENERATED: { label: "AI Generated", bg: "bg-blue-950/60", text: "text-blue-400", border: "border-blue-800/60" },
  EDITING: { label: "In Editing", bg: "bg-amber-950/60", text: "text-amber-400", border: "border-amber-800/60" },
  READY_FOR_REVIEW: { label: "Ready for Review", bg: "bg-purple-950/60", text: "text-purple-400", border: "border-purple-800/60" },
  APPROVED: { label: "Approved", bg: "bg-emerald-950/60", text: "text-emerald-400", border: "border-emerald-800/60" },
  ARCHIVED: { label: "Archived", bg: "bg-zinc-900", text: "text-zinc-500", border: "border-zinc-800" },
};

export default function ContentStudioPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<ContentAssetItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newAssetTitle, setNewAssetTitle] = useState("");
  const [newAssetType, setNewAssetType] = useState("YOUTUBE_LONG_FORM");
  const [newAssetCampaignId, setNewAssetCampaignId] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (selectedType !== "ALL") query.append("type", selectedType);
      if (selectedStatus !== "ALL") query.append("status", selectedStatus);
      if (selectedCampaign !== "ALL") query.append("campaignId", selectedCampaign);
      if (search) query.append("search", search);

      const [assetsRes, campaignsRes] = await Promise.all([
        fetch(`/api/studio/assets?${query.toString()}`),
        fetch("/api/campaigns"),
      ]);

      const assetsJson = await assetsRes.json();
      const campaignsJson = await campaignsRes.json();

      if (assetsJson.assets) setAssets(assetsJson.assets);
      if (campaignsJson.campaigns) setCampaigns(campaignsJson.campaigns);
      if (campaignsJson.campaigns?.length > 0 && !newAssetCampaignId) {
        setNewAssetCampaignId(campaignsJson.campaigns[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedType, selectedStatus, selectedCampaign]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetTitle || !newAssetCampaignId) return;

    try {
      setCreating(true);
      const res = await fetch("/api/studio/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newAssetTitle,
          type: newAssetType,
          campaignId: newAssetCampaignId,
        }),
      });

      const json = await res.json();
      if (res.ok && json.asset) {
        setCreateModalOpen(false);
        router.push(`/studio/${json.asset.id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <FileEdit className="w-6 h-6 text-blue-500" />
            Content Studio
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Evidence-aware content production workspace for YouTube scripts, newsletters, X threads, and LinkedIn posts.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create Asset
        </button>
      </div>

      {/* Format Filter Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setSelectedType("ALL")}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            selectedType === "ALL"
              ? "bg-zinc-800 text-white border-zinc-700 font-semibold"
              : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
          }`}
        >
          All Formats
        </button>
        {Object.entries(FORMAT_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <button
              key={key}
              onClick={() => setSelectedType(key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                selectedType === key
                  ? `${config.bg} ${config.color} ${config.border} font-semibold`
                  : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Secondary Controls: Search, Status, Campaign */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/80">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search assets by title or format..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Select */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700 font-mono"
          >
            <option value="ALL">All Statuses</option>
            {Object.entries(STATUS_BADGES).map(([st, meta]) => (
              <option key={st} value={st}>
                {meta.label}
              </option>
            ))}
          </select>

          {/* Campaign Select */}
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700 font-mono"
          >
            <option value="ALL">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                Campaign: {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Asset Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs font-mono text-zinc-500">
          Loading content assets...
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl p-8 space-y-3">
          <Layers className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-sm text-zinc-400 font-medium">No content assets found.</p>
          <p className="text-xs text-zinc-500">Create your first script, newsletter, or post from an approved strategy.</p>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg mt-2 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Create First Asset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => {
            const formatConfig = FORMAT_CONFIG[asset.type] || FORMAT_CONFIG.GENERIC_SOCIAL;
            const statusConfig = STATUS_BADGES[asset.status] || STATUS_BADGES.DRAFT;
            const Icon = formatConfig.icon;
            const latestVersion = asset.versions[0];
            const meta = asset.qualityMetadataJson ? JSON.parse(asset.qualityMetadataJson) : null;

            return (
              <Link
                key={asset.id}
                href={`/studio/${asset.id}`}
                className="group bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 flex flex-col justify-between space-y-4 transition-all shadow-sm"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border flex items-center gap-1.5 font-semibold ${formatConfig.bg} ${formatConfig.color} ${formatConfig.border}`}
                    >
                      <Icon className="w-3 h-3" />
                      {formatConfig.label}
                    </span>

                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                    >
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Title & Campaign */}
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition-colors line-clamp-2">
                      {asset.title}
                    </h3>
                    <p className="text-[11px] text-zinc-500 font-mono mt-1 truncate">
                      Campaign: <span className="text-zinc-400">{asset.campaign.title}</span>
                    </p>
                  </div>
                </div>

                {/* Diagnostics & Footer */}
                <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                  {meta && (
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>{meta.wordCount} words</span>
                      <span>~{meta.estimatedSpeakingDurationMinutes}m speaking</span>
                      <span className="text-emerald-400">{meta.evidenceCoveragePercent}% backed</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatTimeAgo(new Date(asset.updatedAt))}
                    </span>
                    <span className="text-blue-400/80 group-hover:text-blue-400 flex items-center gap-0.5">
                      v{latestVersion?.versionNumber || 1} <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Asset Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-500" />
                Create New Content Asset
              </h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Asset Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stop Using AI as a Chatbot (YouTube Script)"
                  value={newAssetTitle}
                  onChange={(e) => setNewAssetTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Format Type *
                </label>
                <select
                  value={newAssetType}
                  onChange={(e) => setNewAssetType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="YOUTUBE_LONG_FORM">YouTube Long-Form Video Script</option>
                  <option value="YOUTUBE_SHORT">YouTube Short / TikTok (Vertical)</option>
                  <option value="NEWSLETTER">Technical Email Newsletter</option>
                  <option value="X_THREAD">X / Twitter Thread</option>
                  <option value="LINKEDIN_POST">LinkedIn Leadership Essay</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Associated Campaign *
                </label>
                <select
                  required
                  value={newAssetCampaignId}
                  onChange={(e) => setNewAssetCampaignId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {creating ? "Creating..." : "Create & Open Studio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

