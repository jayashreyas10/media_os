import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/health/route";
import prisma from "@/server/db/prisma";

describe("Production Health & Startup Resilience Regression Suite", () => {
  it("defaults to liveness probe when no check query parameter is provided (fast 200 OK)", async () => {
    const req = new NextRequest("http://localhost:8080/api/health");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.check).toBe("liveness");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.memory).toBeDefined();
    expect(body.memory.heapUsedMb).toBeGreaterThan(0);
    expect(res.headers.get("x-correlation-id")).toBeDefined();
  });

  it("returns 200 OK for explicit ?check=liveness probe", async () => {
    const req = new NextRequest("http://localhost:8080/api/health?check=liveness");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.check).toBe("liveness");
  });

  it("returns 200 OK and verifies database connectivity for ?check=readiness probe", async () => {
    const req = new NextRequest("http://localhost:8080/api/health?check=readiness");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.ready).toBe(true);
    expect(body.check).toBe("readiness");
    expect(body.database.status).toBe("connected");
    expect(typeof body.database.latencyMs).toBe("number");
    expect(typeof body.database.workspaces).toBe("number");
    expect(typeof body.database.activeLocks).toBe("number");
  });

  it("propagates custom correlation ID in healthcheck response headers", async () => {
    const customCorrId = "audit-corr-test-12345";
    const req = new NextRequest("http://localhost:8080/api/health", {
      headers: { "x-correlation-id": customCorrId },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-correlation-id")).toBe(customCorrId);
  });

  it("regression: degraded database triggers 503 on readiness, while liveness remains 200 OK to prevent container SIGTERM", async () => {
    // Spy on prisma.$queryRaw to simulate transient DB outage during boot
    const queryRawSpy = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    // 1. Readiness probe correctly reports 503 degraded
    const readyReq = new NextRequest("http://localhost:8080/api/health?check=readiness");
    const readyRes = await GET(readyReq);

    expect(readyRes.status).toBe(503);
    const readyBody = await readyRes.json();
    expect(readyBody.status).toBe("degraded");
    expect(readyBody.ready).toBe(false);
    expect(readyBody.database.status).toBe("disconnected");
    expect(readyBody.database.error).toContain("Connection terminated unexpectedly");

    // 2. Liveness probe (used by Railway supervisor) STILL returns 200 OK
    const liveReq = new NextRequest("http://localhost:8080/api/health");
    const liveRes = await GET(liveReq);

    expect(liveRes.status).toBe(200);
    const liveBody = await liveRes.json();
    expect(liveBody.status).toBe("ok");
    expect(liveBody.check).toBe("liveness");

    queryRawSpy.mockRestore();
  });
});
