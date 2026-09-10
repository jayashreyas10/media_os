"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";

interface ReviewSummary {
  id: string;
  reviewerType: string;
  status: string;
  verdict: string | null;
  overallScore: number | null;
  scoresJson: string | null;
  summary: string | null;
  createdAt: string;
  contentAsset: {
    id: string;
    title: string;
    type: string;
    status: string;
  };
  contentVersion: {
    id: string;
    versionNumber: number;
    changeSummary: string;
  };
  revisionRequests: Array<{
    id: string;
    status: string;
    severity: string;
  }>;
}

export default function EditorialReviewsPage() {
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      const res = await fetch(`/api/reviews?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
      }
    } catch (err) {
      console.error("Failed to fetch reviews:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [statusFilter]);

  const filteredReviews = reviews.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.contentAsset.title.toLowerCase().includes(q) ||
      (r.summary && r.summary.toLowerCase().includes(q)) ||
      r.contentAsset.type.toLowerCase().includes(q)
    );
  });

  const totalReviews = reviews.length;
  const passedReviews = reviews.filter((r) => r.status === "PASSED").length;
  const revisionRequired = reviews.filter((r) => r.status === "REVISION_REQUIRED").length;
  const openRequestsCount = reviews.reduce(
    (acc, r) => acc + (r.revisionRequests?.filter((rr) => rr.status === "OPEN").length || 0),
    0
  );

  return (
    <div className="flex-1 space-y-6 p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Editorial Review & Human Approval Gate
          </h1>
          <p className="text-sm text-zinc-400 mt-1 font-mono">
            Mandatory human verification gate. AI may review and recommend; humans hold final sign-off authority.
          </p>
        </div>
        <button
          onClick={fetchReviews}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Queue
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-mono">Total Reviews Logged</div>
          <div className="text-2xl font-bold text-zinc-100 mt-1">{totalReviews}</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Passed Criteria
          </div>
          <div className="text-2xl font-bold text-zinc-100 mt-1">{passedReviews}</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-amber-400 font-mono flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Revision Required
          </div>
          <div className="text-2xl font-bold text-zinc-100 mt-1">{revisionRequired}</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-indigo-400 font-mono flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Open Revision Directives
          </div>
          <div className="text-2xl font-bold text-zinc-100 mt-1">{openRequestsCount}</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/80">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-zinc-500" />
          <div className="flex flex-wrap gap-1.5">
            {["ALL", "PASSED", "REVISION_REQUIRED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors ${
                  statusFilter === st
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/50"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search reviews..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="text-center py-16 text-zinc-500 font-mono text-sm">
          Loading editorial reviews...
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40">
          <ShieldCheck className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-300 font-medium text-sm">No editorial reviews found</p>
          <p className="text-zinc-500 text-xs mt-1">
            Run an AI Editorial Review from any asset in the Content Studio to populate this audit queue.
          </p>
          <Link
            href="/studio"
            className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            Go to Content Studio
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredReviews.map((r) => {
            const scores = r.scoresJson ? JSON.parse(r.scoresJson) : null;
            const openRevs = r.revisionRequests?.filter((rr) => rr.status === "OPEN").length || 0;

            return (
              <div
                key={r.id}
                className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono uppercase font-semibold ${
                        r.status === "PASSED"
                          ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/80"
                          : r.status === "REVISION_REQUIRED"
                          ? "bg-amber-950/80 text-amber-400 border border-amber-800/80"
                          : "bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      {r.status === "PASSED" ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {r.status}
                    </span>

                    <span className="text-xs bg-zinc-800/80 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded font-mono">
                      v{r.contentVersion.versionNumber}
                    </span>

                    <span className="text-xs bg-blue-950/50 text-blue-400 border border-blue-900 px-2 py-0.5 rounded font-mono">
                      {r.contentAsset.type}
                    </span>

                    <span className="text-[11px] text-zinc-500 font-mono">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    {r.contentAsset.title}
                  </h3>

                  <p className="text-xs text-zinc-400 line-clamp-2">{r.summary}</p>

                  {/* Scores breakdown bar */}
                  {scores && (
                    <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-zinc-400 flex-wrap">
                      <span className="text-zinc-200 font-bold">
                        Overall Score: {scores.overallScore}/100
                      </span>
                      <span>Evidence: {scores.evidenceScore}%</span>
                      <span>Brand Voice: {scores.brandScore}%</span>
                      <span>Quality: {scores.qualityScore}%</span>
                      <span>Format: {scores.formatScore}%</span>
                    </div>
                  )}

                  {openRevs > 0 && (
                    <div className="text-[11px] text-amber-400/90 font-mono">
                      ⚠ {openRevs} open revision directive(s) pending resolution
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <Link
                    href={`/studio/${r.contentAsset.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-colors"
                  >
                    Open in Studio
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
