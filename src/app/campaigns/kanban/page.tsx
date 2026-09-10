"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  KanbanSquare,
  List,
  Plus,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  CAMPAIGN_STAGES,
  STAGE_METADATA,
  VALID_TRANSITIONS,
  CampaignStage,
} from "@/server/domain/campaign-state-machine";
import { formatTimeAgo } from "@/lib/utils";

interface CampaignItem {
  id: string;
  title: string;
  stage: string;
  priority: string;
  brief: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: Array<{ id: string; status: string; taskType: string }>;
}

const KANBAN_STAGES: CampaignStage[] = [
  "DISCOVERY",
  "RESEARCH",
  "STRATEGY",
  "CREATION",
  "DISTRIBUTION",
  "REVIEW",
  "APPROVAL",
  "SCHEDULED",
  "PUBLISHED",
];

export default function KanbanPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleStageMove = async (campaignId: string, targetStage: string) => {
    try {
      setMovingId(campaignId);
      setFeedbackMsg(null);

      const res = await fetch(`/api/campaigns/${campaignId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStage,
          reason: `Moved via Kanban board to ${targetStage}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedbackMsg({ text: data.error || "Transition failed", error: true });
      } else {
        setFeedbackMsg({ text: `Advanced to ${targetStage} successfully.` });
        setTimeout(() => setFeedbackMsg(null), 3000);
        await fetchCampaigns();
      }
    } catch (err) {
      setFeedbackMsg({
        text: err instanceof Error ? err.message : "Error moving campaign",
        error: true,
      });
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <KanbanSquare className="w-6 h-6 text-blue-500" />
            Multi-Campaign Kanban Board
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Visual state machine progression across the entire editorial pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
            <Link
              href="/campaigns"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-zinc-400 hover:text-white transition-colors"
            >
              <List className="w-3.5 h-3.5" /> List View
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 text-white font-semibold">
              <KanbanSquare className="w-3.5 h-3.5 text-blue-400" /> Kanban
            </span>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            feedbackMsg.error
              ? "bg-rose-950/80 border border-rose-800 text-rose-300"
              : "bg-emerald-950/80 border border-emerald-800 text-emerald-300"
          }`}
        >
          {feedbackMsg.error ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Kanban Columns (Horizontal Scrolling Container) */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[1500px]">
          {KANBAN_STAGES.map((stage) => {
            const meta = STAGE_METADATA[stage];
            const columnCampaigns = campaigns.filter((c) => c.stage === stage);

            return (
              <div
                key={stage}
                className="w-72 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 flex flex-col shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <h3 className="text-xs font-bold text-zinc-200 tracking-tight">
                      {meta.label}
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full font-semibold">
                    {columnCampaigns.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[68vh] pr-1">
                  {columnCampaigns.length === 0 ? (
                    <div className="py-8 text-center text-[11px] font-mono text-zinc-600 border border-dashed border-zinc-800/60 rounded-lg">
                      Empty stage
                    </div>
                  ) : (
                    columnCampaigns.map((camp) => {
                      const validTargets = VALID_TRANSITIONS[camp.stage as CampaignStage] || [];
                      const isMoving = movingId === camp.id;

                      return (
                        <div
                          key={camp.id}
                          className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-lg p-3.5 space-y-2.5 shadow-sm transition-all text-xs"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-mono text-blue-400 font-semibold">
                              #{meta.stepNumber}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase ${
                                camp.priority === "HIGH" || camp.priority === "URGENT"
                                  ? "bg-rose-950/70 text-rose-300 border border-rose-800/70"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {camp.priority}
                            </span>
                          </div>

                          <Link
                            href={`/campaigns/${camp.id}`}
                            className="font-bold text-zinc-200 hover:text-blue-400 transition-colors block leading-snug"
                          >
                            {camp.title}
                          </Link>

                          {camp.brief && (
                            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                              {camp.brief}
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1">
                            <span>{camp.tasks.length} tasks</span>
                            <span>{formatTimeAgo(camp.updatedAt)}</span>
                          </div>

                          {/* Quick Stage Progression Buttons */}
                          <div className="pt-2 border-t border-zinc-800/70 flex flex-wrap gap-1">
                            {validTargets
                              .filter((t) => t !== "ARCHIVED")
                              .map((target) => (
                                <button
                                  key={target}
                                  disabled={isMoving}
                                  onClick={() => handleStageMove(camp.id, target)}
                                  className="w-full text-[10px] font-semibold bg-zinc-900 hover:bg-blue-600 hover:text-white text-zinc-300 border border-zinc-800 px-2 py-1.5 rounded flex items-center justify-between transition-colors disabled:opacity-50"
                                >
                                  <span>&rarr; {target}</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
