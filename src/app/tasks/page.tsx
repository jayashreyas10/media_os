"use client";

import { useEffect, useState } from "react";
import {
  Cpu,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Eye,
  X,
  Play,
} from "lucide-react";
import { formatDateTime, formatTimeAgo, isTestArtifactTask, getTestArtifactDescription } from "@/lib/utils";

interface TaskItem {
  id: string;
  taskType: string;
  agentName: string;
  status: string;
  priority: string;
  attemptCount: number;
  maxAttempts: number;
  inputJson: string;
  outputJson: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  workspace?: { id: string; name: string } | null;
  campaign?: { id: string; title: string } | null;
  agentRuns: Array<{
    id: string;
    provider: string;
    model: string;
    durationMs: number;
    estimatedCostUsd: number;
  }>;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [filterTab, setFilterTab] = useState<"ALL" | "PRODUCTION" | "TEST">("ALL");

  // New task trigger form
  const [selectedAgent, setSelectedAgent] = useState("SIGNAL_SCOUT");
  const [taskFocusInput, setTaskFocusInput] = useState("");
  const [running, setRunning] = useState(false);
  const [actionSuccess, setActionSuccess] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tasks?includeAllWorkspaces=true");
      const json = await res.json();
      if (json.tasks) setTasks(json.tasks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleRunTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRunning(true);
      setErrorMsg("");
      setActionSuccess("");

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: selectedAgent,
          inputData: { focus: taskFocusInput || "General autonomous media pipeline" },
          autoExecute: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to execute task");

      setActionSuccess(`Task #${json.task.id.slice(0, 8)} completed successfully via Mock AI.`);
      setTaskFocusInput("");
      await fetchTasks();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Task execution failed");
    } finally {
      setRunning(false);
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/retry`, { method: "POST" });
      if (res.ok) {
        setActionSuccess(`Retried task #${taskId.slice(0, 8)}`);
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Cpu className="w-6 h-6 text-blue-500" />
            Task Engine & AI Monitor
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Persistent, idempotent task queue with bounded retries and observable AI telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Provider: Mock AI
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-800/80 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-lg text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Manual Task Dispatcher Bar */}
      <form onSubmit={handleRunTask} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
          Dispatch AI Agent (Mock Mode)
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
          >
            <option value="SIGNAL_SCOUT">Signal Scout</option>
            <option value="RESEARCHER">Evidence Researcher</option>
            <option value="STRATEGIST">Content Strategist</option>
            <option value="WRITER">Long-form Writer</option>
            <option value="DISTRIBUTION">Distribution Agent</option>
            <option value="EDITOR">Editorial Reviewer</option>
          </select>

          <input
            type="text"
            placeholder="Focus instructions / seed topic..."
            value={taskFocusInput}
            onChange={(e) => setTaskFocusInput(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
          />

          <button
            type="submit"
            disabled={running}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {running ? "Executing..." : "Run Task"}
          </button>
        </div>
      </form>

      {/* Task Queue Table */}
      {(() => {
        const prodTasks = tasks.filter((t) => !isTestArtifactTask(t));
        const testTasks = tasks.filter((t) => isTestArtifactTask(t));
        const displayedTasks =
          filterTab === "PRODUCTION" ? prodTasks : filterTab === "TEST" ? testTasks : tasks;

        return (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/60">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFilterTab("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterTab === "ALL"
                      ? "bg-zinc-800 text-white font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All Executions ({tasks.length})
                </button>
                <button
                  onClick={() => setFilterTab("PRODUCTION")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    filterTab === "PRODUCTION"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span>🚀 Production Pipeline ({prodTasks.length})</span>
                </button>
                <button
                  onClick={() => setFilterTab("TEST")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    filterTab === "TEST"
                      ? "bg-purple-600 text-white font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span>🧪 Test & Audit Artifacts ({testTasks.length})</span>
                </button>
              </div>

              <button
                onClick={fetchTasks}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-mono shrink-0"
              >
                <RotateCcw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="py-16 text-center text-xs font-mono text-zinc-500">
                Fetching task queue...
              </div>
            ) : displayedTasks.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-500 font-mono">
                No tasks found matching filter &quot;{filterTab}&quot;.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {displayedTasks.map((task) => {
                  const isTest = isTestArtifactTask(task);
                  const explanation = isTest ? getTestArtifactDescription(task) : null;
                  return (
                    <div
                      key={task.id}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors text-xs ${
                        isTest
                          ? "bg-zinc-950/40 hover:bg-purple-950/10"
                          : "hover:bg-zinc-800/30"
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-zinc-200">{task.agentName}</span>
                          {isTest ? (
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/70 font-medium">
                              🧪 TEST ARTIFACT
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/60 font-medium">
                              🚀 PRODUCTION
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              task.status === "COMPLETED"
                                ? "bg-emerald-950/70 text-emerald-400 border-emerald-800/70"
                                : task.status === "FAILED"
                                ? "bg-rose-950/70 text-rose-400 border-rose-800/70"
                                : task.status === "CANCELLED"
                                ? "bg-zinc-900 text-zinc-400 border-zinc-700"
                                : "bg-amber-950/70 text-amber-400 border-amber-800/70"
                            }`}
                          >
                            {task.status}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            Attempt {task.attemptCount}/{task.maxAttempts}
                          </span>
                        </div>

                        {isTest && explanation && (
                          <div className="text-[11px] text-purple-300/80 italic leading-snug">
                            {explanation}
                          </div>
                        )}

                        {task.campaign && (
                          <div className="text-[11px] text-zinc-400">
                            Campaign: <span className="text-zinc-300 font-medium">{task.campaign.title}</span>
                          </div>
                        )}

                        {task.errorMessage && (
                          <div className="text-[11px] text-rose-400 font-mono">
                            Error: {task.errorMessage}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <span className="text-[11px] text-zinc-500 font-mono hidden md:inline">
                          {formatTimeAgo(task.createdAt)}
                        </span>

                        <button
                          onClick={() => setSelectedTask(task)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md flex items-center gap-1 text-[11px] font-medium transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> Inspect
                        </button>

                        {task.status === "FAILED" && !isTest && (
                          <button
                            onClick={() => handleRetryTask(task.id)}
                            className="p-1.5 bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 rounded-md flex items-center gap-1 text-[11px] font-medium transition-colors border border-amber-800/60"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Retry
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Task Inspection Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Inspect Task #{selectedTask.id.slice(0, 8)}
                </h3>
                <div className="text-xs text-zinc-400 font-mono">
                  Agent: {selectedTask.agentName} ({selectedTask.taskType})
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {isTestArtifactTask(selectedTask) && (
                <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-lg text-purple-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold text-purple-200">Automated Test Execution Artifact</span>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      {getTestArtifactDescription(selectedTask)}
                    </p>
                    <p className="text-zinc-500 text-[10px] font-mono">
                      Origin: Automated adversarial test suite (e.g. tests/production-readiness.test.ts). Proves crash-recovery, DAG cancellation, and cross-tenant barrier enforcement. Has zero impact on production campaigns.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <span className="text-xs font-mono text-zinc-400 uppercase font-semibold">
                  Status & Telemetry
                </span>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">Status</div>
                    <div className="text-zinc-200 font-bold">{selectedTask.status}</div>
                  </div>
                  <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">Attempts</div>
                    <div className="text-zinc-200">{selectedTask.attemptCount}/{selectedTask.maxAttempts}</div>
                  </div>
                  <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">Provider</div>
                    <div className="text-zinc-200">mock</div>
                  </div>
                  <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">Duration</div>
                    <div className="text-zinc-200">
                      {selectedTask.agentRuns[0]?.durationMs || 0}ms
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-mono text-zinc-400 uppercase font-semibold">
                  Validated Structured Output (Zod Conforming)
                </span>
                <pre className="mt-1.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-64 leading-relaxed">
                  {selectedTask.outputJson
                    ? JSON.stringify(JSON.parse(selectedTask.outputJson), null, 2)
                    : "No output generated"}
                </pre>
              </div>

              <div>
                <span className="text-xs font-mono text-zinc-400 uppercase font-semibold">
                  Input Payload
                </span>
                <pre className="mt-1.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-32">
                  {JSON.stringify(JSON.parse(selectedTask.inputJson || "{}"), null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-white text-xs font-medium hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
