import { NextRequest, NextResponse } from "next/server";
import prisma from "@/server/db/prisma";
import { getCorrelationId } from "@/server/observability/telemetry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const correlationId = getCorrelationId(req.headers);
  const searchParams = req.nextUrl.searchParams;
  const checkType = searchParams.get("check") || "readiness";

  // Liveness Check: verifies that the HTTP server process is running and responding
  if (checkType === "liveness") {
    const memory = process.memoryUsage();
    return NextResponse.json(
      {
        status: "ok",
        check: "liveness",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
          heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
          rssMb: Math.round(memory.rss / (1024 * 1024)),
        },
      },
      {
        status: 200,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }

  // Readiness Check: verifies that database and worker operational subsystems are responsive
  try {
    const startDb = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startDb;

    // Verify readiness of critical operational tables
    const [workspaceCount, workerLockCount] = await Promise.all([
      prisma.workspace.count(),
      prisma.workerLock.count(),
    ]);

    const memory = process.memoryUsage();

    return NextResponse.json(
      {
        status: "ok",
        ready: true,
        check: "readiness",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          status: "connected",
          latencyMs: dbLatencyMs,
          workspaces: workspaceCount,
          activeLocks: workerLockCount,
        },
        memory: {
          heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
          heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
          rssMb: Math.round(memory.rss / (1024 * 1024)),
        },
        version: "1.0.0",
      },
      {
        status: 200,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        ready: false,
        check: "readiness",
        timestamp: new Date().toISOString(),
        database: {
          status: "disconnected",
          error: error instanceof Error ? error.message : "Database connection failed",
        },
      },
      {
        status: 503,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }
}
