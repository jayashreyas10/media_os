"use client";

import { useState, useEffect } from "react";
import { Sparkles, ShieldCheck, AlertCircle, X, CheckCircle2 } from "lucide-react";

interface AIStatus {
  mode: "LIVE" | "MOCK" | "DISABLED";
  label: string;
  provider: string;
  manualAvailable: boolean;
}

export function AIStatusBadge() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setStatus({
          mode: "DISABLED",
          label: "Manual Mode — AI Disabled",
          provider: "none",
          manualAvailable: true,
        });
        setLoading(false);
      });
  }, []);

  if (loading || !status) {
    return (
      <div className="h-6 w-24 bg-zinc-900 animate-pulse rounded-full border border-zinc-800" />
    );
  }

  const getBadgeConfig = () => {
    switch (status.mode) {
      case "LIVE":
        return {
          dotColor: "bg-emerald-500",
          textColor: "text-emerald-300",
          bgColor: "bg-emerald-950/40 border-emerald-800/60",
          text: "AI Ready",
          icon: <Sparkles className="w-3 h-3 text-emerald-400" />,
        };
      case "DISABLED":
        return {
          dotColor: "bg-zinc-400",
          textColor: "text-zinc-300",
          bgColor: "bg-zinc-900 border-zinc-700",
          text: "Manual Mode — AI Disabled",
          icon: <ShieldCheck className="w-3 h-3 text-zinc-400" />,
        };
      case "MOCK":
      default:
        return {
          dotColor: "bg-zinc-400",
          textColor: "text-zinc-300",
          bgColor: "bg-zinc-900 border-zinc-700",
          text: "Manual Mode",
          icon: <ShieldCheck className="w-3 h-3 text-zinc-400" />,
        };
    }
  };

  const badge = getBadgeConfig();

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:brightness-110 ${badge.bgColor} ${badge.textColor}`}
        title="Click to view AI & Manual mode status"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dotColor}`} />
        <span>{badge.text}</span>
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${badge.dotColor}`} />
                <h3 className="text-base font-semibold text-zinc-100">AI Operating Mode</h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div className="bg-zinc-900/80 p-3 rounded-lg border border-zinc-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Current Mode:</span>
                  <span className="font-semibold text-zinc-100 uppercase">{status.mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Provider:</span>
                  <span className="font-mono text-zinc-200">{status.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Manual Workflows:</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Fully Usable
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-zinc-400 leading-relaxed">
                <p>
                  <strong>MediaOS AI-Optional Architecture:</strong> All core capabilities (Signals,
                  Research, Strategy, Content, Editorial Review, Analytics, and Publishing) function
                  100% manually without any AI calls.
                </p>
                <p>
                  To change modes, configure your environment variables:
                  <code className="block bg-zinc-900 text-zinc-300 p-2 rounded mt-1 font-mono text-[11px]">
                    AI_MODE=LIVE | MOCK | DISABLED
                  </code>
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-1.5 rounded-md text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
