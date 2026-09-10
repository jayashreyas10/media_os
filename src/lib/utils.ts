import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeAgo(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(date);
}

export interface TaskClassificationInput {
  agentName?: string | null;
  taskType?: string | null;
  inputJson?: string | null;
  workspace?: { name?: string | null } | null;
  campaign?: { title?: string | null } | null;
}

/**
 * Deterministically classifies whether a task record is an automated test/adversarial
 * audit fixture (e.g. from crash-recovery, DAG dependency, or cross-tenant testing)
 * or a real production workflow execution.
 */
export function isTestArtifactTask(task: TaskClassificationInput): boolean {
  if (!task) return false;
  const agent = task.agentName || task.taskType || "";
  if (agent === "AudienceScout" || agent === "EvidenceResearcher") return true;
  if (agent === "Failing Scout" || agent === "Waiting Strategist") return true;
  if (task.workspace?.name?.includes("Audit") || task.workspace?.name?.includes("Tenant")) return true;
  if (task.campaign?.title?.includes("Confidential Alpha")) return true;
  const input = task.inputJson || "";
  if (input.includes("simulated crash") || input.includes("unrecoverable crash")) return true;
  if (input.includes("Secret market signals") || input.includes("DAG pipeline test")) return true;
  return false;
}

/**
 * Returns a technical explanation for a test artifact's state.
 */
export function getTestArtifactDescription(task: TaskClassificationInput & { status?: string }): string {
  const status = task.status || "";
  if (status === "FAILED") {
    return "Automated Test Fixture: Simulates worker crash recovery exceeding max retry threshold.";
  }
  if (status === "CANCELLED") {
    return "Automated Test Fixture: Validates cascading DAG cancellation of dependent tasks.";
  }
  if (status === "WAITING") {
    return "Automated Test Fixture: Evaluates dependency blocking until upstream prerequisites complete.";
  }
  if (status === "QUEUED") {
    return "Automated Test Fixture: Validates cross-tenant isolation and anti-IDOR barriers.";
  }
  return "Automated Test Fixture: Executed as part of the Phase 1–7 production readiness test suite.";
}
