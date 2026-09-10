"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  KanbanSquare,
  Plus,
  ArrowRight,
  Clock,
  Sparkles,
  Search,
  Filter,
  X,
} from "lucide-react";
import { formatDateTime, formatTimeAgo } from "@/lib/utils";

interface Campaign {
  id: string;
  title: string;
  stage: string;
  priority: string;
  brief: string | null;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: Array<{ id: string; taskType: string; status: string }>;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");

  // New Campaign Form State
  const [newTitle, setNewTitle] = useState("");
  const [newBrief, setNewBrief] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (data.campaigns) {
        setCampaigns(data.campaigns);
      }
    } catch (err) {
      console.error("Failed to load campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setSubmitting(true);
      setErrorMsg("");
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          brief: newBrief,
          priority: newPriority,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create campaign");
      }
      setModalOpen(false);
      setNewTitle("");
      setNewBrief("");
      fetchCampaigns();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error creating campaign");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.brief && c.brief.toLowerCase().includes(search.toLowerCase()));
    const matchesStage = stageFilter === "ALL" || c.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <KanbanSquare className="w-6 h-6 text-blue-500" />
            Campaign Production Hub
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Every piece of content originates from a structured production campaign.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create Campaign
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search campaigns by title or topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700"
          />
        </div>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700 font-mono"
        >
          <option value="ALL">All Stages</option>
          <option value="DISCOVERY">DISCOVERY</option>
          <option value="RESEARCH">RESEARCH</option>
          <option value="STRATEGY">STRATEGY</option>
          <option value="CREATION">CREATION</option>
          <option value="DISTRIBUTION">DISTRIBUTION</option>
          <option value="REVIEW">REVIEW</option>
          <option value="APPROVAL">APPROVAL</option>
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="PUBLISHED">PUBLISHED</option>
          <option value="ANALYTICS">ANALYTICS</option>
          <option value="LEARNING">LEARNING</option>
        </select>
      </div>

      {/* Campaigns Grid */}
      {loading ? (
        <div className="py-16 text-center text-zinc-500 text-xs font-mono">
          Loading campaigns from database...
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl p-8 space-y-3">
          <p className="text-sm text-zinc-400">No matching campaigns found.</p>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-md"
          >
            Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map((camp) => (
            <Link
              key={camp.id}
              href={`/campaigns/${camp.id}`}
              className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 rounded-xl p-5 transition-all flex flex-col justify-between group hover:shadow-lg hover:shadow-blue-950/10"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800/60 font-semibold">
                    {camp.stage}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {camp.priority}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition-colors leading-snug">
                  {camp.title}
                </h3>

                {camp.brief && (
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {camp.brief}
                  </p>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                <span>{camp.tasks.length} tasks</span>
                <span className="flex items-center gap-1 group-hover:text-zinc-300 transition-colors font-medium">
                  Inspect <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal: Create Campaign */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Create New Campaign</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Campaign Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. The 2026 AI Agent State Machine Guide"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Brief / Editorial Objective
                </label>
                <textarea
                  rows={3}
                  placeholder="What is the core tension, audience question, or thesis?"
                  value={newBrief}
                  onChange={(e) => setNewBrief(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Initialize Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
