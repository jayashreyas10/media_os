import Link from "next/link";
import prisma from "@/server/db/prisma";
import {
  KanbanSquare,
  Sparkles,
  BrainCircuit,
  Cpu,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  History,
  TrendingUp,
} from "lucide-react";
import { formatDateTime, formatTimeAgo, isTestArtifactTask, getTestArtifactDescription } from "@/lib/utils";
import { STAGE_METADATA, CampaignStage } from "@/server/domain/campaign-state-machine";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Query summary data from SQLite
  const [
    campaigns,
    tasks,
    brand,
    recentLogs,
  ] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        stageHistory: { take: 1, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        agentRuns: true,
        workspace: { select: { id: true, name: true } },
        campaign: { select: { id: true, title: true } },
      },
    }),
    prisma.brand.findFirst({
      where: { isDefault: true },
      include: {
        pillars: true,
        editorialRules: true,
        proofs: true,
        audience: true,
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        user: { select: { name: true } },
      },
    }),
  ]);

  const totalCampaigns = await prisma.campaign.count();
  const queuedTasks = await prisma.task.count({ where: { status: "QUEUED" } });
  const completedTasks = await prisma.task.count({ where: { status: "COMPLETED" } });
  const activeCampaign = campaigns[0] || null;

  return (
    <div className="space-y-8">
      {/* Top Banner: Mock Mode Notice & Human Authority */}
      <div className="bg-gradient-to-r from-blue-950/40 via-zinc-900 to-zinc-900 border border-blue-900/40 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-wider text-blue-400 font-semibold">
                Autonomous Studio Engine • Mock AI Mode
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              One-Person Media Company Operating System
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              6 specialized agents operating over a shared Brand Brain with strict state machine validation and human-in-the-loop approval.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/campaigns"
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow"
            >
              <KanbanSquare className="w-4 h-4" />
              Campaign Studio
            </Link>
            <Link
              href="/tasks"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 border border-zinc-700"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              Run Agent
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Active Campaigns</span>
            <KanbanSquare className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{totalCampaigns}</div>
          <div className="text-xs text-zinc-400 mt-1">Structured across 11 stages</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Completed Tasks</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{completedTasks}</div>
          <div className="text-xs text-emerald-400/80 mt-1">100% Zod validated</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Tasks Queued</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{queuedTasks}</div>
          <div className="text-xs text-zinc-400 mt-1">Bounded retry engine</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Brand Brain Rules</span>
            <BrainCircuit className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {brand?.editorialRules.length || 0}
          </div>
          <div className="text-xs text-blue-400/80 mt-1">Active editorial memory</div>
        </div>
      </div>

      {/* Main Grid: Active Campaign & Quick Agent Trigger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Campaign Spotlight */}
        <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Featured Production Campaign
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Current production object moving through the editorial lifecycle.
              </p>
            </div>
            {activeCampaign && (
              <Link
                href={`/campaigns/${activeCampaign.id}`}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
              >
                Inspect Pipeline <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {activeCampaign ? (
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800/70 font-semibold">
                      Stage: {activeCampaign.stage}
                    </span>
                    <span className="text-xs text-zinc-400">
                      Step {STAGE_METADATA[activeCampaign.stage as CampaignStage]?.stepNumber || 1} of 11
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white leading-snug">
                    {activeCampaign.title}
                  </h3>
                </div>
              </div>

              {activeCampaign.brief && (
                <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 p-3 rounded border border-zinc-800/80">
                  {activeCampaign.brief}
                </p>
              )}

              {/* Visual Pipeline Stage Mini-Bar */}
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                  <span>DISCOVERY</span>
                  <span className="text-blue-400 font-bold">CURRENT: {activeCampaign.stage}</span>
                  <span>PUBLISHED</span>
                </div>
                <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${((STAGE_METADATA[activeCampaign.stage as CampaignStage]?.stepNumber || 1) / 11) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70 text-xs">
                <span className="text-zinc-400">
                  Last updated {formatTimeAgo(activeCampaign.updatedAt)}
                </span>
                <Link
                  href={`/campaigns/${activeCampaign.id}`}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                >
                  Manage Stage Transitions &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg p-6">
              <p className="text-sm text-zinc-400 mb-3">No active campaigns created yet.</p>
              <Link
                href="/campaigns"
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-md"
              >
                Create First Campaign
              </Link>
            </div>
          )}

          {/* Quick AI Task Runner Panel */}
          <div className="border-t border-zinc-800 pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono mb-3">
              Rapid Agent Execution (Deterministic Mock Mode)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href="/tasks?trigger=SIGNAL_SCOUT"
                className="p-3 bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 rounded-lg transition-colors text-left group"
              >
                <div className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 flex items-center justify-between">
                  <span>Signal Scout</span>
                  <Sparkles className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400" />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Scan trends and score opportunity
                </p>
              </Link>

              <Link
                href="/tasks?trigger=RESEARCHER"
                className="p-3 bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 rounded-lg transition-colors text-left group"
              >
                <div className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 flex items-center justify-between">
                  <span>Researcher</span>
                  <Sparkles className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400" />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Verify claims & primary sources
                </p>
              </Link>

              <Link
                href="/tasks?trigger=WRITER"
                className="p-3 bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 rounded-lg transition-colors text-left group"
              >
                <div className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 flex items-center justify-between">
                  <span>Lead Writer</span>
                  <Sparkles className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400" />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Draft 10-point YouTube script
                </p>
              </Link>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Recent Tasks & Audit Stream */}
        <div className="space-y-6">
          {/* Recent Tasks */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  Recent AI Tasks
                </h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Production pipeline and adversarial audit logs
                </p>
              </div>
              <Link href="/tasks" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                View All
              </Link>
            </div>

            <div className="space-y-2.5">
              {tasks.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center">No tasks executed yet.</div>
              ) : (
                tasks.map((task) => {
                  const isTest = isTestArtifactTask(task);
                  const explanation = isTest ? getTestArtifactDescription(task) : null;
                  return (
                    <div
                      key={task.id}
                      className={`p-3 rounded-lg text-xs space-y-1.5 border transition-colors ${
                        isTest
                          ? "bg-zinc-950/90 border-purple-900/40 hover:border-purple-800/70"
                          : "bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-zinc-200">{task.agentName}</span>
                          {isTest ? (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-950/90 text-purple-300 border border-purple-800/70 font-medium">
                              🧪 TEST ARTIFACT
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 font-medium">
                              🚀 PROD
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                            task.status === "COMPLETED"
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/60"
                              : task.status === "FAILED"
                              ? "bg-rose-950/60 text-rose-400 border-rose-800/60"
                              : task.status === "CANCELLED"
                              ? "bg-zinc-900 text-zinc-400 border-zinc-700"
                              : "bg-amber-950/60 text-amber-400 border-amber-800/60"
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>

                      {isTest && explanation && (
                        <p className="text-[10px] text-purple-300/80 italic leading-snug">
                          {explanation}
                        </p>
                      )}

                      {task.campaign && (
                        <p className="text-[11px] text-zinc-400 truncate">
                          Campaign: {task.campaign.title}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                        <span>Attempt {task.attemptCount}/{task.maxAttempts}</span>
                        <span>{formatTimeAgo(task.createdAt)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Audit Stream */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-1.5">
                <History className="w-4 h-4 text-zinc-400" />
                Audit Trail
              </h3>
              <Link href="/audit" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                Log
              </Link>
            </div>

            <div className="space-y-2">
              {recentLogs.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center">No audit logs recorded.</div>
              ) : (
                recentLogs.map((log) => (
                  <div key={log.id} className="text-xs border-b border-zinc-800/60 pb-2 last:border-0 last:pb-0">
                    <div className="text-zinc-300 font-medium font-mono text-[11px]">
                      {log.action}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-0.5 font-mono">
                      <span>{log.entityType}</span>
                      <span>{formatTimeAgo(log.createdAt)}</span>
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
