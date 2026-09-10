"use client";

import { useEffect, useState } from "react";
import {
  Network,
  Link as LinkIcon,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  Plus,
  Search,
  ExternalLink,
  BookOpen,
  X,
  CheckCircle2,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

interface SourceItem {
  id: string;
  title: string;
  url: string | null;
  author: string | null;
  publisher: string | null;
  sourceType?: string | null;
  isSynthetic?: boolean;
  retrievalStatus?: string | null;
  trustScore: number;
}

interface EvidenceItem {
  id: string;
  quoteSnippet: string;
  context: string | null;
  pageOrTimestamp: string | null;
  verificationMethod: string;
  supportStance?: string;
  isQuoteVerified?: boolean;
  groundingScore?: number;
  source: SourceItem;
}

interface ClaimItem {
  id: string;
  claimText: string;
  confidence: number;
  isFact: boolean;
  verificationStatus: string;
  contradictionNote: string | null;
  createdAt: string;
  primarySource: SourceItem | null;
  evidence: EvidenceItem[];
  campaign: { id: string; title: string } | null;
}

export default function EvidenceGraphPage() {
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"claims" | "sources">("claims");

  // Modal states
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [selectedClaimForEvidence, setSelectedClaimForEvidence] = useState<ClaimItem | null>(null);

  // New Claim State
  const [newClaimText, setNewClaimText] = useState("");
  const [newClaimConfidence, setNewClaimConfidence] = useState(95);
  const [newClaimSourceId, setNewClaimSourceId] = useState("");
  const [newClaimStatus, setNewClaimStatus] = useState<"VERIFIED" | "UNVERIFIED" | "CONTRADICTED">("UNVERIFIED");

  // New Source State
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceAuthor, setNewSourceAuthor] = useState("");
  const [newSourceTrust, setNewSourceTrust] = useState(90);

  // New Evidence State
  const [newEvidenceSourceId, setNewEvidenceSourceId] = useState("");
  const [newEvidenceQuote, setNewEvidenceQuote] = useState("");
  const [newEvidenceContext, setNewEvidenceContext] = useState("");
  const [newEvidenceStance, setNewEvidenceStance] = useState<"SUPPORTS" | "CONTRADICTS" | "CONTEXTUALIZES" | "DOES_NOT_SUPPORT">("SUPPORTS");

  // Manual Research Bundle State
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleSourceTitle, setBundleSourceTitle] = useState("");
  const [bundleSourceUrl, setBundleSourceUrl] = useState("");
  const [bundleSourceAuthor, setBundleSourceAuthor] = useState("");
  const [bundleClaimText, setBundleClaimText] = useState("");
  const [bundleQuote, setBundleQuote] = useState("");
  const [bundleSubmitting, setBundleSubmitting] = useState(false);

  const handleCreateBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundleSourceTitle.trim() || !bundleClaimText.trim()) return;
    try {
      setBundleSubmitting(true);
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isManual: true,
          source: {
            title: bundleSourceTitle.trim(),
            url: bundleSourceUrl.trim() || undefined,
            author: bundleSourceAuthor.trim() || undefined,
            trustScore: 90,
          },
          claim: {
            claimText: bundleClaimText.trim(),
            confidence: 95,
            isFact: true,
          },
          evidence: bundleQuote.trim()
            ? {
                quoteSnippet: bundleQuote.trim(),
                supportStance: "SUPPORTS",
              }
            : undefined,
        }),
      });
      if (res.ok) {
        setBundleModalOpen(false);
        setBundleSourceTitle("");
        setBundleSourceUrl("");
        setBundleSourceAuthor("");
        setBundleClaimText("");
        setBundleQuote("");
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create manual research bundle");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating manual research bundle");
    } finally {
      setBundleSubmitting(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [claimsRes, sourcesRes] = await Promise.all([
        fetch("/api/claims"),
        fetch("/api/sources"),
      ]);
      const claimsJson = await claimsRes.json();
      const sourcesJson = await sourcesRes.json();
      if (claimsJson.claims) setClaims(claimsJson.claims);
      if (sourcesJson.sources) setSources(sourcesJson.sources);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClaimText) return;

    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimText: newClaimText,
          confidence: newClaimConfidence,
          primarySourceId: newClaimSourceId || undefined,
          verificationStatus: newClaimStatus,
        }),
      });

      if (res.ok) {
        setClaimModalOpen(false);
        setNewClaimText("");
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTitle) return;

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSourceTitle,
          url: newSourceUrl || undefined,
          author: newSourceAuthor || undefined,
          trustScore: newSourceTrust,
        }),
      });

      if (res.ok) {
        setSourceModalOpen(false);
        setNewSourceTitle("");
        setNewSourceUrl("");
        setNewSourceAuthor("");
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAttachEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaimForEvidence || !newEvidenceSourceId || !newEvidenceQuote) return;

    try {
      const res = await fetch(`/api/claims/${selectedClaimForEvidence.id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: newEvidenceSourceId,
          quoteSnippet: newEvidenceQuote,
          context: newEvidenceContext || undefined,
          supportStance: newEvidenceStance,
        }),
      });

      if (res.ok) {
        setEvidenceModalOpen(false);
        setSelectedClaimForEvidence(null);
        setNewEvidenceQuote("");
        setNewEvidenceContext("");
        setNewEvidenceStance("SUPPORTS");
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredClaims = claims.filter((c) =>
    c.claimText.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Network className="w-6 h-6 text-blue-500" />
            Source → Claim → Evidence Graph
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Empirical claim verification graph ensuring zero hallucinated citations reach production.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBundleModalOpen(true)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 border border-zinc-700"
          >
            <span>✍️</span> Add Source & Evidence Manually
          </button>
          <button
            onClick={() => setSourceModalOpen(true)}
            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 border border-zinc-800"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            Register Source
          </button>
          <button
            onClick={() => setClaimModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Claim
          </button>
        </div>
      </div>

      {/* View Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex gap-2 border-b sm:border-0 border-zinc-800 pb-2 sm:pb-0">
          <button
            onClick={() => setActiveTab("claims")}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors ${
              activeTab === "claims"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Claims & Evidence ({claims.length})
          </button>
          <button
            onClick={() => setActiveTab("sources")}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors ${
              activeTab === "sources"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Primary Sources ({sources.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter claims or sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700"
          />
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-16 text-center text-xs font-mono text-zinc-500">
          Loading evidence graph...
        </div>
      ) : activeTab === "claims" ? (
        <div className="space-y-4">
          {filteredClaims.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl p-8 space-y-3">
              <p className="text-sm text-zinc-400">No empirical claims registered yet.</p>
              <button
                onClick={() => setClaimModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-md"
              >
                Register First Claim
              </button>
            </div>
          ) : (
            filteredClaims.map((claim) => (
              <div
                key={claim.id}
                className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${
                          claim.verificationStatus === "VERIFIED"
                            ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80"
                            : claim.verificationStatus === "CONTRADICTED"
                            ? "bg-rose-950/80 text-rose-400 border-rose-800/80"
                            : claim.verificationStatus === "UNRESOLVED"
                            ? "bg-purple-950/80 text-purple-400 border-purple-800/80"
                            : "bg-amber-950/80 text-amber-400 border-amber-800/80"
                        }`}
                      >
                        {claim.verificationStatus}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {claim.confidence}% confidence
                      </span>
                      {claim.campaign && (
                        <span className="text-[10px] font-mono text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900/60">
                          Campaign: {claim.campaign.title}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-zinc-100 leading-relaxed">
                      "{claim.claimText}"
                    </h3>

                    {claim.contradictionNote && (
                      <p className="text-xs text-amber-400/90 font-mono bg-amber-950/30 border border-amber-900/40 p-2 rounded">
                        Note: {claim.contradictionNote}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setSelectedClaimForEvidence(claim);
                      setEvidenceModalOpen(true);
                    }}
                    className="self-start sm:self-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Attach Evidence
                  </button>
                </div>

                {/* Primary Source Link */}
                {claim.primarySource && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/80">
                    <span className="font-mono text-zinc-500 uppercase text-[10px]">Primary Source:</span>
                    <span className="text-zinc-200 font-medium">{claim.primarySource.title}</span>
                    {claim.primarySource.isSynthetic && (
                      <span className="text-[9px] font-mono uppercase bg-amber-950/80 text-amber-400 border border-amber-800/80 px-1.5 py-0.5 rounded">
                        [SYNTHETIC / DEMONSTRATION DATA]
                      </span>
                    )}
                    {claim.primarySource.sourceType && (
                      <span className="text-[9px] font-mono uppercase bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                        {claim.primarySource.sourceType}
                      </span>
                    )}
                    {claim.primarySource.url && (
                      <a
                        href={claim.primarySource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline flex items-center gap-1 text-[11px] font-mono ml-auto"
                      >
                        View Source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Attached Evidence Quotes */}
                {claim.evidence.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                    <span className="text-[11px] font-mono uppercase text-zinc-500 font-semibold">
                      Attached Evidence Quotes ({claim.evidence.length})
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {claim.evidence.map((ev) => (
                        <div
                          key={ev.id}
                          className="bg-zinc-950/90 border border-zinc-800/80 rounded-lg p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span
                              className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border font-semibold ${
                                ev.supportStance === "SUPPORTS"
                                  ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                                  : ev.supportStance === "CONTRADICTS"
                                  ? "bg-rose-950/80 text-rose-400 border-rose-800"
                                  : ev.supportStance === "CONTEXTUALIZES"
                                  ? "bg-blue-950/80 text-blue-400 border-blue-800"
                                  : "bg-zinc-850 text-zinc-400 border-zinc-700"
                              }`}
                            >
                              {ev.supportStance || "SUPPORTS"}
                            </span>
                            {ev.isQuoteVerified ? (
                              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-1.5 py-0.5 rounded">
                                Grounded in Source Text ✓
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 border border-amber-800/80 px-1.5 py-0.5 rounded">
                                Ungrounded Quote ✗
                              </span>
                            )}
                          </div>

                          <blockquote className="italic text-zinc-300 border-l-2 border-blue-500 pl-2 leading-relaxed">
                            "{ev.quoteSnippet}"
                          </blockquote>

                          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1">
                            <span className="truncate max-w-[200px]">Source: {ev.source.title}</span>
                            <span className="text-emerald-400">Trust {ev.source.trustScore}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Sources View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((src) => (
            <div
              key={src.id}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 font-semibold">
                      Trust {src.trustScore}%
                    </span>
                    {src.isSynthetic && (
                      <span className="text-[9px] font-mono uppercase bg-amber-950/80 text-amber-400 border border-amber-800/80 px-1.5 py-0.5 rounded">
                        SYNTHETIC
                      </span>
                    )}
                    {src.sourceType && (
                      <span className="text-[9px] font-mono uppercase bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        {src.sourceType}
                      </span>
                    )}
                  </div>
                  {src.author && (
                    <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[150px]">
                      {src.author}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-zinc-100">{src.title}</h3>

                {src.url && (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-mono truncate"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{src.url}</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: New Claim */}
      {claimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Register Verified Claim</h2>
              <button onClick={() => setClaimModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClaim} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Claim Text *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. State-machine agents reduce unconstrained loop divergence by 74%."
                  value={newClaimText}
                  onChange={(e) => setNewClaimText(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Verification Status</label>
                  <select
                    value={newClaimStatus}
                    onChange={(e) => setNewClaimStatus(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  >
                    <option value="VERIFIED">VERIFIED</option>
                    <option value="UNVERIFIED">UNVERIFIED</option>
                    <option value="CONTRADICTED">CONTRADICTED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Confidence (1-100)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newClaimConfidence}
                    onChange={(e) => setNewClaimConfidence(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Primary Source</label>
                <select
                  value={newClaimSourceId}
                  onChange={(e) => setNewClaimSourceId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="">-- No Source Selected --</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setClaimModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
                >
                  Save Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Source */}
      {sourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Register Primary Source</h2>
              <button onClick={() => setSourceModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSource} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Source Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. State Machine Architectures for Deterministic AI Agents"
                  value={newSourceTitle}
                  onChange={(e) => setNewSourceTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">URL</label>
                <input
                  type="url"
                  placeholder="https://arxiv.org/..."
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Author</label>
                  <input
                    type="text"
                    placeholder="Dr. Elena Vance"
                    value={newSourceAuthor}
                    onChange={(e) => setNewSourceAuthor(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Trust Score (1-100)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newSourceTrust}
                    onChange={(e) => setNewSourceTrust(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSourceModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
                >
                  Save Source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Attach Evidence */}
      {evidenceModalOpen && selectedClaimForEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Attach Evidence Quote</h2>
              <button onClick={() => setEvidenceModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs text-zinc-300 italic">
              Claim: "{selectedClaimForEvidence.claimText}"
            </div>

            <form onSubmit={handleAttachEvidence} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Source *</label>
                <select
                  required
                  value={newEvidenceSourceId}
                  onChange={(e) => setNewEvidenceSourceId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="">-- Select Source --</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} (Trust: {s.trustScore}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Support Stance *</label>
                <select
                  value={newEvidenceStance}
                  onChange={(e) => setNewEvidenceStance(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="SUPPORTS">SUPPORTS (Directly verifies or substantiates claim)</option>
                  <option value="CONTRADICTS">CONTRADICTS (Refutes or invalidates claim)</option>
                  <option value="CONTEXTUALIZES">CONTEXTUALIZES (Provides background without validating)</option>
                  <option value="DOES_NOT_SUPPORT">DOES_NOT_SUPPORT (Irrelevant or unsupportive)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Verbatim Quote Snippet *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Paste direct quote from paper or benchmark..."
                  value={newEvidenceQuote}
                  onChange={(e) => setNewEvidenceQuote(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEvidenceModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
                >
                  Attach Quote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Research Bundle */}
      {bundleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✍️</span>
                <h2 className="text-base font-bold text-white">Add Source & Evidence Manually</h2>
              </div>
              <button onClick={() => setBundleModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBundle} className="space-y-3.5 text-xs">
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-2">
                <h4 className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  Primary Source Details
                </h4>
                <div>
                  <label className="block text-zinc-400 mb-1">Source Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meta LLaMA 3 Architecture Technical Report"
                    value={bundleSourceTitle}
                    onChange={(e) => setBundleSourceTitle(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 p-2 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-400 mb-1">URL (Optional)</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={bundleSourceUrl}
                      onChange={(e) => setBundleSourceUrl(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 p-2 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Author / Org (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. AI Research Group"
                      value={bundleSourceAuthor}
                      onChange={(e) => setBundleSourceAuthor(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 p-2 rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-2">
                <h4 className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  Claim (Defaults to UNVERIFIED)
                </h4>
                <div>
                  <label className="block text-zinc-400 mb-1">Claim Statement *</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. KV-cache compression reduces memory bandwidth requirements by 4x..."
                    value={bundleClaimText}
                    onChange={(e) => setBundleClaimText(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 p-2 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-2">
                <h4 className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Direct Grounding Quote (Optional)
                </h4>
                <textarea
                  rows={2}
                  placeholder="Verbatim quote from source grounding this claim..."
                  value={bundleQuote}
                  onChange={(e) => setBundleQuote(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 p-2 rounded-md focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setBundleModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bundleSubmitting || !bundleSourceTitle.trim() || !bundleClaimText.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50"
                >
                  {bundleSubmitting ? "Creating..." : "Save Manual Research Bundle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

