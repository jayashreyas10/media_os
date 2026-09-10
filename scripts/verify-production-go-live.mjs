/**
 * MediaOS Phase 9 — Production Go-Live & Non-Destructive Invariant Verification
 * Verifies production readiness without altering or deleting production state.
 */

const BASE_URL = (process.env.APP_URL || "http://localhost:3000").trim();

async function run() {
  console.log("===============================================================================");
  console.log(" MEDIAOS PHASE 9 — PRODUCTION GO-LIVE HARDENING VERIFICATION");
  console.log(` Target Host: ${BASE_URL}`);
  console.log("===============================================================================\n");

  let passedChecks = 0;
  let totalChecks = 0;

  function assert(condition, message) {
    totalChecks++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passedChecks++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Health & Liveness Probe
  console.log("1. Liveness Probe Verification");
  const liveRes = await fetch(`${BASE_URL}/api/health?check=liveness`);
  assert(liveRes.status === 200, `Liveness endpoint returned HTTP ${liveRes.status} (expected 200)`);
  const liveJson = await liveRes.json();
  assert(liveJson.status === "ok", "Liveness status reports 'ok'");
  assert(typeof liveJson.uptimeSeconds === "number", "Liveness reports valid process uptime");
  assert(liveJson.memory?.heapUsedMb > 0, "Liveness reports memory usage metrics");
  const liveCorrId = liveRes.headers.get("x-correlation-id");
  assert(Boolean(liveCorrId), `Liveness propagates correlation ID header: ${liveCorrId}`);

  // 2. Database Readiness Probe
  console.log("\n2. Database Readiness & Operational Health");
  const readyRes = await fetch(`${BASE_URL}/api/health?check=readiness`);
  assert(readyRes.status === 200, `Readiness endpoint returned HTTP ${readyRes.status} (expected 200)`);
  const readyJson = await readyRes.json();
  assert(readyJson.ready === true, "Readiness reports system is ready");
  assert(readyJson.database?.status === "connected", "Readiness confirms database connectivity (SELECT 1)");
  assert(typeof readyJson.database?.latencyMs === "number", `Database latency reported: ${readyJson.database?.latencyMs}ms`);
  assert(typeof readyJson.database?.workspaces === "number", `Active workspaces reported: ${readyJson.database?.workspaces}`);

  // 3. Correlation ID Propagation
  console.log("\n3. Telemetry Correlation ID Propagation");
  const testCorrId = `go-live-audit-${Date.now()}`;
  const corrRes = await fetch(`${BASE_URL}/api/health`, {
    headers: { "x-correlation-id": testCorrId },
  });
  assert(
    corrRes.headers.get("x-correlation-id") === testCorrId,
    `Echoed exact correlation ID header: ${testCorrId}`
  );

  // 4. Unauthenticated API Boundaries (HTTP 401 Protected)
  console.log("\n4. Unauthenticated API Boundary Security (Anti-IDOR & Zero Bypass)");
  const protectedEndpoints = [
    { path: "/api/signals", method: "GET" },
    { path: "/api/research", method: "POST" },
    { path: "/api/strategy", method: "POST" },
    { path: "/api/campaigns", method: "GET" },
    { path: "/api/studio/assets", method: "GET" },
    { path: "/api/reviews", method: "GET" },
    { path: "/api/analytics/metrics", method: "GET" },
    { path: "/api/publishing/accounts", method: "GET" },
    { path: "/api/tasks", method: "GET" },
    { path: "/api/audit", method: "GET" },
  ];

  for (const ep of protectedEndpoints) {
    const res = await fetch(`${BASE_URL}${ep.path}`, {
      method: ep.method,
      headers: ep.method === "POST" ? { "Content-Type": "application/json" } : {},
      body: ep.method === "POST" ? JSON.stringify({}) : undefined,
    });
    assert(
      res.status === 401,
      `Unauthenticated ${ep.method} ${ep.path} strictly blocked with HTTP 401 (got ${res.status})`
    );
  }

  // 5. Public & UI Routes Smoke Verification
  console.log("\n5. Primary UI & Public Pages Smoke Test");
  const uiRoutes = [
    "/login",
    "/signals",
    "/evidence",
    "/campaigns",
    "/studio",
    "/reviews",
    "/analytics",
    "/publishing",
    "/tasks",
    "/audit",
  ];

  for (const route of uiRoutes) {
    const res = await fetch(`${BASE_URL}${route}`);
    assert(
      res.status === 200 || res.status === 307 || res.status === 302,
      `Route ${route} returned HTTP ${res.status}`
    );
  }

  // 6. Secret Redaction & Non-Disclosure in Responses
  console.log("\n6. Secret Non-Disclosure in HTTP Responses");
  const healthBody = JSON.stringify(readyJson);
  assert(!healthBody.includes("password"), "Health response contains zero passwords");
  assert(!healthBody.includes("postgres://") && !healthBody.includes("postgresql://"), "Health response strictly redacts raw DATABASE_URL");
  assert(!healthBody.includes("token"), "Health response strictly redacts token details");

  // 7. System AI Status Reporting
  console.log("\n7. System AI Status & Safe Metadata");
  const aiStatusRes = await fetch(`${BASE_URL}/api/ai/status`);
  assert(aiStatusRes.status === 200, `AI Status endpoint returned HTTP ${aiStatusRes.status}`);
  const aiStatusJson = await aiStatusRes.json();
  assert(
    Boolean(aiStatusJson.manualAvailable || aiStatusJson.manualWorkflowsAvailable),
    "AI status declares manual availability"
  );

  console.log("\n===============================================================================");
  console.log(` ✅ ALL ${passedChecks}/${totalChecks} PRODUCTION GO-LIVE INVARIANTS VERIFIED (PASS)`);
  console.log("===============================================================================\n");
}

run().catch((err) => {
  console.error("FATAL GO-LIVE VERIFICATION ERROR:", err.message);
  process.exit(1);
});
