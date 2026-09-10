"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Radio,
  Sparkles,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Search,
} from "lucide-react";

interface SignalItem {
  title: string;
  event: string;
  whyNow: string;
  audienceRelevance: number;
  opportunityScore: number;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  suggestedAngle: string;
  rejectionReason?: string;
}

interface ScanResult {
  scoutSummary: string;
  recommendedSignalIndex: number;
  signals: SignalItem[];
}

interface SavedSignal {
  id: string;
  title: string;
  content: string;
  tags?: string | null;
  confidence?: number;
  createdAt: string;
}

export default function SignalsPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [useLiveFetcher, setUseLiveFetcher] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [savedSignals, setSavedSignals] = useState<SavedSignal[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSavedSignals();
  }, []);

  async function fetchSavedSignals() {
    try {
      setIsLoadingSaved(true);
      const res = await fetch("/api/signals");
      if (res.ok) {
        const data = await res.json();
        setSavedSignals(data.signals || []);
      }
    } catch {
      // Ignored on initial mount
    } finally {
      setIsLoadingSaved(false);
    }
  }

  async function handleScan(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setIsScanning(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim() || undefined,
          useLiveFetcher,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to scan signals");
      }

      setScanResult(data.result);
      setSuccessMessage(`Signal Scout completed: ${data.result.signals.length} high-potential angles evaluated.`);
      fetchSavedSignals();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error scanning signals");
    } finally {
      setIsScanning(false);
    }
  }

  async function handlePromote(signal: SignalItem, index: number) {
    setPromotingIndex(index);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/signals/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: signal.title,
          event: signal.event,
          whyNow: signal.whyNow,
          suggestedAngle: signal.suggestedAngle,
          opportunityScore: signal.opportunityScore,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to promote signal");
      }

      router.push(`/campaigns/${data.campaign.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error promoting signal");
      setPromotingIndex(null);
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-blue-950/80 border border-blue-800/60 text-blue-400">
              <Radio className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Signal Scout</h1>
            <span className="text-xs font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
              Agent 01
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Autonomous ecosystem scanner. Aligns industry breakthroughs and developer discussions with Brand Brain pillars.
          </p>
        </div>

        <button
          onClick={() => handleScan()}
          disabled={isScanning}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
        >
          {isScanning ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isScanning ? "Scanning Ecosystem..." : "Run Signal Scout"}
        </button>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 rounded-lg bg-red-950/50 border border-red-800/80 text-red-200 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-950/50 border border-emerald-800/80 text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Discovery Configuration Form */}
      <form onSubmit={handleScan} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            Focus Topic or Strategic Query (Optional)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="liveFetcher"
              checked={useLiveFetcher}
              onChange={(e) => setUseLiveFetcher(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="liveFetcher" className="text-xs text-zinc-400 cursor-pointer select-none">
              Use Live Web Fetcher (Safe 5s timeout & prompt injection isolation)
            </label>
          </div>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Agentic determinism, consumer GPU quantization, developer tools..."
            className="flex-1 bg-zinc-950 border border-zinc-700/80 rounded-md px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isScanning}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm rounded-md transition-colors border border-zinc-700 disabled:opacity-50"
          >
            Scan Signals
          </button>
        </div>
      </form>

      {/* Current Scan Results */}
      {scanResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Discovered Opportunities ({scanResult.signals.length})
            </h2>
            <span className="text-xs font-mono text-zinc-400">
              Recommended: #{scanResult.recommendedSignalIndex + 1}
            </span>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-md p-3.5 text-sm text-zinc-300">
            <span className="font-semibold text-zinc-200">Scout Assessment: </span>
            {scanResult.scoutSummary}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {scanResult.signals.map((sig, idx) => {
              const isRecommended = idx === scanResult.recommendedSignalIndex;
              const isPromoting = promotingIndex === idx;

              return (
                <div
                  key={idx}
                  className={`bg-zinc-900/70 border rounded-lg p-5 flex flex-col justify-between transition-all ${
                    isRecommended
                      ? "border-blue-700/70 shadow-sm shadow-blue-950/50 ring-1 ring-blue-500/20"
                      : "border-zinc-800"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        {isRecommended && (
                          <span className="inline-block text-[10px] font-mono font-bold uppercase bg-blue-950/80 text-blue-400 border border-blue-800 px-1.5 py-0.5 rounded mb-1">
                            Top Recommendation
                          </span>
                        )}
                        <h3 className="font-semibold text-zinc-100 text-base leading-snug">
                          {sig.title}
                        </h3>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold shrink-0 border ${
                          sig.urgency === "HIGH"
                            ? "bg-amber-950/60 text-amber-300 border-amber-800/60"
                            : sig.urgency === "MEDIUM"
                            ? "bg-blue-950/60 text-blue-300 border-blue-800/60"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {sig.urgency} Urgency
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed">
                      <span className="text-zinc-400 font-medium">Trigger: </span>
                      {sig.event}
                    </p>

                    <div className="bg-zinc-950/60 rounded p-3 border border-zinc-800/60 space-y-1.5">
                      <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        Why Now
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{sig.whyNow}</p>
                    </div>

                    <div className="bg-blue-950/20 border border-blue-900/40 rounded p-3 space-y-1">
                      <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                        Suggested Content Angle
                      </div>
                      <p className="text-xs text-blue-200 font-medium leading-relaxed">
                        &ldquo;{sig.suggestedAngle}&rdquo;
                      </p>
                    </div>

                    {/* Scores */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-zinc-950/40 border border-zinc-800/70 rounded p-2 text-center">
                        <div className="text-[10px] text-zinc-400 uppercase font-mono">
                          Audience Match
                        </div>
                        <div className="text-base font-bold text-zinc-100">
                          {sig.audienceRelevance}<span className="text-xs text-zinc-400 font-normal">/10</span>
                        </div>
                      </div>
                      <div className="bg-zinc-950/40 border border-zinc-800/70 rounded p-2 text-center">
                        <div className="text-[10px] text-zinc-400 uppercase font-mono">
                          Opportunity Score
                        </div>
                        <div className="text-base font-bold text-emerald-400">
                          {sig.opportunityScore}<span className="text-xs text-zinc-400 font-normal">/10</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-5 mt-4 border-t border-zinc-800/60 flex items-center justify-end">
                    <button
                      onClick={() => handlePromote(sig, idx)}
                      disabled={isPromoting}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {isPromoting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                      {isPromoting ? "Promoting..." : "Promote to Campaign"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical Signals from Knowledge Base */}
      <div className="space-y-4 pt-4 border-t border-zinc-800/80">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-400" />
            Persisted Signal Knowledge Base ({savedSignals.length})
          </h2>
          <button
            onClick={fetchSavedSignals}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {isLoadingSaved ? (
          <div className="text-center py-8 text-xs text-zinc-400">Loading stored signals...</div>
        ) : savedSignals.length === 0 ? (
          <div className="bg-zinc-900/30 border border-dashed border-zinc-800 rounded-lg p-8 text-center text-xs text-zinc-400">
            No signals persisted yet. Run Signal Scout above to discover and store market signals.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {savedSignals.map((item) => (
              <div
                key={item.id}
                className="bg-zinc-900/50 border border-zinc-800/80 rounded-md p-3.5 flex flex-col justify-between space-y-2 hover:border-zinc-700 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-mono text-[10px] text-blue-400 bg-blue-950/60 px-1 rounded border border-blue-900/50">
                      SIGNAL
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 line-clamp-2">
                    {item.title.replace(/^Signal:\s*/i, "")}
                  </h4>
                  <p className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed">
                    {item.content}
                  </p>
                </div>
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                  <span>Confidence: {item.confidence || 90}%</span>
                  <Link
                    href={`/knowledge`}
                    className="text-blue-400 hover:text-blue-300 font-sans font-medium"
                  >
                    View in KB &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
