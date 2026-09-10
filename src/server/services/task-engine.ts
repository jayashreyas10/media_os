import prisma from "../db/prisma";
import { ProviderFactory } from "../ai/provider-factory";
import { getAgentContext } from "../ai/context-builder";
import { AgentType } from "../ai/provider-interface";

export interface CreateTaskOptions {
  workspaceId: string;
  campaignId?: string | null;
  taskType: AgentType;
  agentName: string;
  priority?: string;
  inputData?: Record<string, unknown>;
  idempotencyKey?: string;
  dependsOnTaskIds?: string[];
}

export class TaskEngine {
  /**
   * Checks if adding dependencies from `candidateParentIds` to a new or existing task creates a cycle.
   */
  static async checkCircularDependency(
    targetTaskId: string,
    candidateParentIds: string[]
  ): Promise<boolean> {
    const queue = [...candidateParentIds];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (currentId === targetTaskId) {
        return true; // Cycle detected
      }
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const deps = await prisma.taskDependency.findMany({
        where: { taskId: currentId },
        select: { dependsOnTaskId: true },
      });
      for (const d of deps) {
        queue.push(d.dependsOnTaskId);
      }
    }
    return false;
  }

  /**
   * Queue a new task with idempotency and circular dependency checking.
   */
  static async queueTask(options: CreateTaskOptions) {
    const {
      workspaceId,
      campaignId,
      taskType,
      agentName,
      priority = "NORMAL",
      inputData = {},
      idempotencyKey,
      dependsOnTaskIds = [],
    } = options;

    // Validate campaign tenancy if campaignId is provided
    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { brand: true },
      });
      if (!campaign || campaign.brand.workspaceId !== workspaceId) {
        throw new Error(`Campaign ${campaignId} not found in workspace`);
      }
    }

    if (idempotencyKey) {
      const existing = await prisma.task.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    // Verify candidate dependencies exist and belong to the same workspace
    if (dependsOnTaskIds.length > 0) {
      const parentTasks = await prisma.task.findMany({
        where: { id: { in: dependsOnTaskIds } },
      });
      if (
        parentTasks.length !== dependsOnTaskIds.length ||
        parentTasks.some((t) => t.workspaceId !== workspaceId)
      ) {
        throw new Error("One or more dependency tasks do not exist in this workspace");
      }
    }

    // Determine initial status: If it has unmet dependencies, status is WAITING
    let initialStatus = "QUEUED";
    if (dependsOnTaskIds.length > 0) {
      const parentTasks = await prisma.task.findMany({
        where: { id: { in: dependsOnTaskIds } },
      });
      const allCompleted =
        parentTasks.length === dependsOnTaskIds.length &&
        parentTasks.every((t) => t.status === "COMPLETED");

      if (!allCompleted) {
        initialStatus = "WAITING";
      }
    }

    const task = await prisma.task.create({
      data: {
        workspaceId,
        campaignId,
        taskType,
        agentName,
        status: initialStatus,
        priority,
        idempotencyKey: idempotencyKey || undefined,
        inputJson: JSON.stringify(inputData),
        maxAttempts: 3,
      },
    });

    // Create TaskDependency records
    if (dependsOnTaskIds.length > 0) {
      await prisma.taskDependency.createMany({
        data: dependsOnTaskIds.map((parentId) => ({
          taskId: task.id,
          dependsOnTaskId: parentId,
          requiredStatus: "COMPLETED",
        })),
      });
    }

    return task;
  }

  /**
   * Create an automated multi-task dependency chain (e.g. Scout -> Researcher -> Strategist).
   */
  static async createChain(
    workspaceId: string,
    campaignId: string | null,
    chainSteps: Array<{
      taskType: AgentType;
      agentName: string;
      inputData?: Record<string, unknown>;
    }>
  ) {
    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { brand: true },
      });
      if (!campaign || campaign.brand.workspaceId !== workspaceId) {
        throw new Error(`Campaign ${campaignId} not found in workspace`);
      }
    }

    const createdTasks = [];
    let previousTaskId: string | null = null;

    for (let i = 0; i < chainSteps.length; i++) {
      const step = chainSteps[i];
      const task = await this.queueTask({
        workspaceId,
        campaignId,
        taskType: step.taskType,
        agentName: step.agentName,
        inputData: step.inputData || {},
        dependsOnTaskIds: previousTaskId ? [previousTaskId] : [],
      });
      createdTasks.push(task);
      previousTaskId = task.id;
    }

    // Automatically trigger execution of the first task in the chain
    if (createdTasks.length > 0 && createdTasks[0].status === "QUEUED") {
      await this.executeTask(createdTasks[0].id, workspaceId);
    }

    return createdTasks;
  }

  /**
   * Execute or retry a task with atomic locking, bounded backoff, and cascading dependency execution.
   */
  static async executeTask(taskId: string, workspaceId?: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (workspaceId && task.workspaceId !== workspaceId) {
      throw new Error(`Task ${taskId} not found in workspace`);
    }

    // Verify dependencies if any: cannot execute while required dependencies are incomplete
    const unmet = task.dependencies.find(
      (dep) => dep.dependsOnTask.status !== dep.requiredStatus
    );
    if (unmet) {
      return await prisma.task.update({
        where: { id: taskId },
        data: { status: "WAITING" },
      });
    }

    // Atomic lock to prevent race conditions or duplicate execution
    const lockResult = await prisma.task.updateMany({
      where: {
        id: taskId,
        status: { in: ["QUEUED", "WAITING", "FAILED"] },
      },
      data: {
        status: "RUNNING",
        attemptCount: { increment: 1 },
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    if (lockResult.count === 0) {
      // Another runner already acquired lock or task is already RUNNING/COMPLETED
      return await prisma.task.findUnique({ where: { id: taskId } });
    }

    const currentAttempt = task.attemptCount + 1;
    const startTime = Date.now();

    try {
      const context = await getAgentContext(
        task.taskType as AgentType,
        task.campaignId,
        task.workspaceId
      );

      const provider = await ProviderFactory.getProvider({ workspaceId: task.workspaceId });
      const result = await provider.generate({
        agentType: task.taskType as AgentType,
        promptVersion: "v1.0",
        context: {
          ...context,
          inputPayload: JSON.parse(task.inputJson || "{}"),
        },
      });

      const durationMs = Date.now() - startTime;

      if (!result.success || !result.data) {
        throw new Error(result.errorMessage || "Agent execution returned failure");
      }

      await ProviderFactory.recordUsage(task.workspaceId, result.provider, result.estimatedCostUsd);

      await prisma.taskAttempt.create({
        data: {
          taskId: task.id,
          attemptNumber: currentAttempt,
          status: "SUCCESS",
          durationMs,
        },
      });

      await prisma.agentRun.create({
        data: {
          taskId: task.id,
          agentName: task.agentName,
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: result.estimatedCostUsd,
          durationMs,
          status: "SUCCESS",
        },
      });

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "COMPLETED",
          outputJson: JSON.stringify(result.data),
          completedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          workspaceId: task.workspaceId,
          action: "TASK_COMPLETED",
          entityType: "Task",
          entityId: task.id,
          detailsJson: JSON.stringify({
            taskType: task.taskType,
            agentName: task.agentName,
            attempt: currentAttempt,
            durationMs,
          }),
        },
      });

      // TRIGGER DEPENDENT TASKS IN THE DAG
      await this.triggerDownstreamTasks(task.id);

      return updatedTask;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      await prisma.taskAttempt.create({
        data: {
          taskId: task.id,
          attemptNumber: currentAttempt,
          status: "FAILED",
          error: errorMsg,
          durationMs,
        },
      });

      const isExhausted = currentAttempt >= task.maxAttempts;
      const newStatus = isExhausted ? "FAILED" : "QUEUED";

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: newStatus,
          errorMessage: errorMsg,
          completedAt: isExhausted ? new Date() : null,
        },
      });

      await prisma.auditLog.create({
        data: {
          workspaceId: task.workspaceId,
          action: isExhausted ? "TASK_FAILED" : "TASK_RETRY_SCHEDULED",
          entityType: "Task",
          entityId: task.id,
          detailsJson: JSON.stringify({
            taskType: task.taskType,
            attempt: currentAttempt,
            maxAttempts: task.maxAttempts,
            error: errorMsg,
          }),
        },
      });

      // If permanently failed, cancel downstream waiting tasks so they don't hang
      if (isExhausted) {
        await this.cancelDownstreamTasks(task.id, errorMsg);
      }

      return updatedTask;
    }
  }

  /**
   * Cancels downstream waiting tasks when an upstream task fails permanently.
   */
  static async cancelDownstreamTasks(failedTaskId: string, failureReason: string) {
    const downstreamDeps = await prisma.taskDependency.findMany({
      where: { dependsOnTaskId: failedTaskId },
      select: { taskId: true },
    });

    for (const dep of downstreamDeps) {
      await prisma.task.updateMany({
        where: { id: dep.taskId, status: "WAITING" },
        data: {
          status: "CANCELLED",
          errorMessage: `Upstream dependency task #${failedTaskId.slice(0, 8)} failed: ${failureReason}`,
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Evaluates downstream dependent tasks; if all their dependencies are COMPLETED,
   * transitions them from WAITING to QUEUED and executes them.
   */
  static async triggerDownstreamTasks(completedTaskId: string) {
    const dependentDeps = await prisma.taskDependency.findMany({
      where: { dependsOnTaskId: completedTaskId },
      include: {
        task: {
          include: {
            dependencies: {
              include: { dependsOnTask: true },
            },
          },
        },
      },
    });

    for (const dep of dependentDeps) {
      const downstreamTask = dep.task;
      if (downstreamTask.status === "WAITING") {
        const allSatisfied = downstreamTask.dependencies.every(
          (d) => d.dependsOnTask.status === d.requiredStatus
        );

        if (allSatisfied) {
          // Atomic transition from WAITING to QUEUED
          const lock = await prisma.task.updateMany({
            where: { id: downstreamTask.id, status: "WAITING" },
            data: { status: "QUEUED" },
          });

          if (lock.count > 0) {
            await this.executeTask(downstreamTask.id);
          }
        }
      }
    }
  }

  /**
   * Recovers tasks stuck in RUNNING status due to worker crash or unhandled timeout.
   * Default stale threshold is 5 minutes (300,000 ms).
   */
  static async recoverStaleTasks(maxRunningDurationMs: number = 300000) {
    const cutoff = new Date(Date.now() - maxRunningDurationMs);

    const staleTasks = await prisma.task.findMany({
      where: {
        status: "RUNNING",
        startedAt: { lte: cutoff },
      },
    });

    const recovered = [];

    for (const task of staleTasks) {
      const isExhausted = task.attemptCount >= task.maxAttempts;
      const newStatus = isExhausted ? "FAILED" : "QUEUED";
      const errorMsg = `Task execution timed out (exceeded ${maxRunningDurationMs / 1000}s threshold / worker crash detected)`;

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: {
          status: newStatus,
          errorMessage: errorMsg,
          completedAt: isExhausted ? new Date() : null,
        },
      });

      await prisma.auditLog.create({
        data: {
          workspaceId: task.workspaceId,
          action: "TASK_CRASH_RECOVERED",
          entityType: "Task",
          entityId: task.id,
          detailsJson: JSON.stringify({
            previousStatus: "RUNNING",
            newStatus,
            startedAt: task.startedAt,
            staleDurationMs: task.startedAt ? Date.now() - task.startedAt.getTime() : null,
            attemptCount: task.attemptCount,
            maxAttempts: task.maxAttempts,
          }),
        },
      });

      if (isExhausted) {
        await this.cancelDownstreamTasks(task.id, errorMsg);
      }

      recovered.push(updated);
    }

    return recovered;
  }
}
