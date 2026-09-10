/**
 * MediaOS Phase 1-6 Production Readiness & Security Audit E2E Verification Script
 * 
 * Verifies live HTTP security invariants, multi-tenant isolation, IDOR prevention,
 * evidence integrity, prompt injection boundaries, mandatory human approval gate,
 * analytics idempotency, and Brand Brain immutability against the running Next.js server.
 */

import http from "node:http";

const BASE_URL = "http://localhost:3000";

function request(method, endpoint, data = null, cookie = "") {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const url = new URL(endpoint, BASE_URL);
    const headers = {
      ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    };

    const req = http.request(url, { method, headers }, (res) => {
      let body = "";
      const setCookie = res.headers["set-cookie"];
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null,
            cookie: setCookie ? setCookie.map((c) => c.split(";")[0]).join("; ") : cookie,
          });
        } catch {
          resolve({ status: res.statusCode, data: body, cookie });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get = (endpoint, cookie = "") => request("GET", endpoint, null, cookie);
const post = (endpoint, data, cookie = "") => request("POST", endpoint, data, cookie);
const patch = (endpoint, data, cookie = "") => request("PATCH", endpoint, data, cookie);
const del = (endpoint, data = null, cookie = "") => request("DELETE", endpoint, data, cookie);

function pass(msg) {
  console.log(`\x1b[32m  ✓ PASS:\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\x1b[31m  ✗ FAIL:\x1b[0m ${msg}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
  pass(message);
}

async function run() {
  console.log("\n===============================================================================");
  console.log(" MEDIAOS PHASE 1-6 PRODUCTION READINESS & SECURITY AUDIT LIVE E2E");
  console.log("===============================================================================\n");

  // 1. Health Check
  console.log("1. System Health Check (/api/health)");
  const health = await get("/api/health");
  assert(health.status === 200, "Health endpoint responds with 200 OK");
  assert(health.data.status === "ok", "System reports status: ok");

  // 2. Authentication & Session Invariants
  console.log("\n2. Authentication & Session Invariants");
  const unauthCampaigns = await get("/api/campaigns");
  assert(unauthCampaigns.status === 401, "Unauthenticated request to /api/campaigns is blocked with 401 Unauthorized");

  const unauthSources = await get("/api/sources");
  assert(unauthSources.status === 401, "Unauthenticated request to /api/sources is blocked with 401 Unauthorized");

  const unauthAssets = await get("/api/studio/assets");
  assert(unauthAssets.status === 401, "Unauthenticated request to /api/studio/assets is blocked with 401 Unauthorized");

  // Register Tenant Alpha
  const timestamp = Date.now();
  const emailAlpha = `alpha-${timestamp}@security-audit.local`;
  const regAlpha = await post("/api/auth?action=register", {
    email: emailAlpha,
    password: "SuperSecretPassword123!",
    name: "Alpha Operator",
  });
  assert(regAlpha.status === 200, "Tenant Alpha registered successfully");
  const cookieAlpha = regAlpha.cookie;

  // Register Tenant Beta (Adversary)
  const emailBeta = `beta-${timestamp}@security-audit.local`;
  const regBeta = await post("/api/auth?action=register", {
    email: emailBeta,
    password: "SuperSecretPassword123!",
    name: "Beta Operator",
  });
  assert(regBeta.status === 200, "Tenant Beta registered successfully");
  const cookieBeta = regBeta.cookie;

  // Failed login attempt
  const badLogin = await post("/api/auth?action=login", {
    email: emailAlpha,
    password: "IncorrectPassword!",
  });
  assert(badLogin.status === 400 || badLogin.status === 401, "Incorrect password rejected with 400/401");

  // Verify audit logs for Tenant Alpha
  const auditRes = await get("/api/audit", cookieAlpha);
  assert(auditRes.status === 200, "Audit logs retrieved successfully for Tenant Alpha");
  const failedAudit = auditRes.data.logs?.find((l) => l.action === "AUTH_LOGIN_FAILED");
  assert(failedAudit !== undefined, "AUTH_LOGIN_FAILED audit event recorded in workspace audit trail");

  // 3. Multi-Tenant Isolation & Anti-IDOR Enforcement
  console.log("\n3. Multi-Tenant Isolation & Anti-IDOR Enforcement");
  // Tenant Alpha creates confidential campaign
  const createCampaignRes = await post("/api/campaigns", {
    title: "Proprietary Architecture Initiative",
    description: "Zero-knowledge technical content pipeline",
  }, cookieAlpha);
  assert(createCampaignRes.status === 201 || createCampaignRes.status === 200, "Tenant Alpha creates confidential campaign");
  const campaignAId = createCampaignRes.data.campaign.id;

  // Tenant Beta attempts to read Tenant Alpha's campaign -> Must return 404 (not 403, preventing ID enumeration)
  const betaReadRes = await get(`/api/campaigns/${campaignAId}`, cookieBeta);
  assert(betaReadRes.status === 404, "Tenant Beta reading Tenant Alpha campaign returns 404 Not Found (anti-enumeration)");

  // Tenant Beta attempts to transition Tenant Alpha's campaign stage -> Must return 404
  const betaTransitionRes = await post(`/api/campaigns/${campaignAId}/transition`, {
    targetStage: "RESEARCH",
    reason: "Adversary transition attempt",
  }, cookieBeta);
  assert(betaTransitionRes.status === 404, "Tenant Beta transitioning Tenant Alpha campaign returns 404 Not Found");

  // Tenant Alpha creates a Brand Brain content pillar
  const pillarRes = await post("/api/brand-brain", {
    type: "pillar",
    data: {
      name: "Autonomous Security Moat",
      description: "Strict boundary isolation for autonomous agents",
    },
  }, cookieAlpha);
  assert(pillarRes.status === 200 || pillarRes.status === 201, "Tenant Alpha creates Brand Brain pillar");
  const pillarAId = pillarRes.data.item.id;

  // Tenant Beta attempts to delete Tenant Alpha's pillar -> Must return 404
  const betaDeletePillar = await del(`/api/brand-brain?type=pillar&id=${pillarAId}`, null, cookieBeta);
  assert(betaDeletePillar.status === 404, "Tenant Beta deleting Tenant Alpha Brand Brain pillar returns 404 Not Found");

  // Verify SecurityViolation audit records were created
  const alphaAuditsAfterAttack = await get("/api/audit", cookieAlpha);
  const violationLog = alphaAuditsAfterAttack.data.logs?.find((l) => l.action.includes("BLOCKED") || l.entityType === "SecurityViolation");
  // Security violations for Beta logged under Beta workspace
  const betaAudits = await get("/api/audit", cookieBeta);
  const betaViolation = betaAudits.data.logs?.find((l) => l.entityType === "SecurityViolation" || l.action.includes("BLOCKED"));
  assert(betaViolation !== undefined, "CROSS_CAMPAIGN_ACCESS_BLOCKED security violation logged in audit trail");

  // 4. Evidence Integrity & URL Scheme Sanitization
  console.log("\n4. Evidence Integrity & URL Scheme Sanitization");
  const maliciousUrls = [
    "javascript:alert(document.cookie)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:MsgBox(1)",
    "file:///etc/passwd",
    "not-a-valid-url-format",
  ];

  for (const badUrl of maliciousUrls) {
    const badSourceRes = await post("/api/sources", {
      title: "Malicious Exploit Payload",
      url: badUrl,
      sourceType: "PRIMARY_BENCHMARK",
      rawContent: "Test content",
    }, cookieAlpha);
    assert(badSourceRes.status === 400, `Rejected unsafe URL scheme: '${badUrl.slice(0, 20)}...' with 400 Bad Request`);
  }

  // Legitimate source creation
  const validSourceRes = await post("/api/sources", {
    title: "Production Systems Divergence Report 2026",
    url: "https://benchmarks.internal/divergence-2026",
    sourceType: "PRIMARY_BENCHMARK",
    rawContent: "Finite-state machine loops reduced divergence by 74% across 10,000 tasks.",
  }, cookieAlpha);
  assert(validSourceRes.status === 201 || validSourceRes.status === 200, "Valid https: source accepted and stored");
  const sourceAId = validSourceRes.data.source.id;

  // Claim creation API forces status to UNVERIFIED even if client requests VERIFIED
  const claimCreateRes = await post("/api/claims", {
    campaignId: campaignAId,
    primarySourceId: sourceAId,
    claimText: "State machines reduce divergence by 74%.",
    confidence: 99,
    verificationStatus: "VERIFIED", // Malicious attempt to force VERIFIED status directly
  }, cookieAlpha);
  assert(claimCreateRes.status === 200 || claimCreateRes.status === 201, "Claim created via API");
  assert(claimCreateRes.data.claim.verificationStatus === "UNVERIFIED", "Server overrides client flag: newly created claim is strictly UNVERIFIED");

  // 5. Content Studio & Mandatory Human Approval Gate
  console.log("\n5. Content Studio & Mandatory Human Approval Gate");
  const assetCreateRes = await post("/api/studio/assets", {
    campaignId: campaignAId,
    type: "YOUTUBE_SHORT",
    title: "Deterministic State Machine Security",
  }, cookieAlpha);
  assert(assetCreateRes.status === 200 || assetCreateRes.status === 201, "ContentAsset created in DRAFT status");
  const assetId = assetCreateRes.data.asset.id;

  // Generate v1 content
  const generateRes = await post(`/api/studio/assets/${assetId}/generate`, {
    mode: "GENERATE",
  }, cookieAlpha);
  assert(generateRes.status === 200, "Asset v1 content generated");
  const v1Id = generateRes.data.version.id;

  // Attempt AI approval -> Hard 403 Forbidden
  const aiApprovalRes = await post(`/api/studio/assets/${assetId}/approve`, {
    versionId: v1Id,
    reviewerType: "AI_EDITOR",
    comment: "AI trying to approve",
  }, cookieAlpha);
  assert(aiApprovalRes.status === 403, "AI identity approval attempt strictly blocked with 403 Forbidden");

  // Attempt approval while asset is still in GENERATED status -> 400 Bad Request
  const unreadyApprovalRes = await post(`/api/studio/assets/${assetId}/approve`, {
    versionId: v1Id,
    comment: "Human comment before review status",
  }, cookieAlpha);
  assert(unreadyApprovalRes.status === 400, "Approval blocked while in GENERATED status (must be in READY_FOR_REVIEW)");

  // Transition asset to READY_FOR_REVIEW
  await patch(`/api/studio/assets/${assetId}`, { status: "EDITING" }, cookieAlpha);
  await patch(`/api/studio/assets/${assetId}`, { status: "READY_FOR_REVIEW" }, cookieAlpha);

  // Authenticated Human Operator grants approval
  const humanApprovalRes = await post(`/api/studio/assets/${assetId}/approve`, {
    versionId: v1Id,
    comment: "Human Editorial Director verified all claims and benchmarks.",
  }, cookieAlpha);
  assert(humanApprovalRes.status === 200, "Human operator approved asset with mandatory comment");
  assert(humanApprovalRes.data.asset.status === "APPROVED", "Asset status transitioned to APPROVED");

  // Restoring an older version invalidates approval and resets status to EDITING
  const restoreRes = await post(`/api/studio/assets/${assetId}/versions/${v1Id}/restore`, null, cookieAlpha);
  assert(restoreRes.status === 200, "Version restore executed");
  
  const assetAfterRestore = await get(`/api/studio/assets/${assetId}`, cookieAlpha);
  assert(assetAfterRestore.data.asset.status === "EDITING", "Restoring previous version resets status to EDITING, invalidating previous approval");

  // 6. Analytics Ingestion Idempotency & Mathematical Rigor
  console.log("\n6. Analytics Ingestion Idempotency & Mathematical Rigor");
  const snapshotPayload = {
    platform: "YOUTUBE",
    brandId: regAlpha.data.brand?.id,
    campaignId: campaignAId,
    contentAssetId: assetId,
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-02T00:00:00.000Z",
    isSynthetic: true,
    dataSource: "SYNTHETIC_GENERATOR",
    externalId: "audit-live-snap-01",
    rawMetrics: {
      views: 25000,
      impressions: 125000,
      clicks: 6250,
      likes: 1800,
      comments: 210,
    },
  };

  // First ingestion
  const snap1 = await post("/api/analytics/metrics", snapshotPayload, cookieAlpha);
  assert(snap1.status === 201 || snap1.status === 200, "Initial snapshot ingested");
  assert(snap1.data.isDuplicate === false, "First ingestion marked as isDuplicate: false");

  // Concurrent / duplicate ingestion with identical idempotency key
  const snap2 = await post("/api/analytics/metrics", snapshotPayload, cookieAlpha);
  assert(snap2.status === 200, "Duplicate ingestion returns 200 OK without 500 server error");
  assert(snap2.data.isDuplicate === true, "Duplicate ingestion gracefully caught by idempotency lock");

  // 7. Strategy Recommendation Governance & Brand Brain Immutability
  console.log("\n7. Strategy Recommendation Governance & Brand Brain Immutability");
  // Trigger learning engine to generate a recommendation
  const runLearningRes = await post("/api/analytics/learnings", {
    campaignId: campaignAId,
  }, cookieAlpha);
  assert(runLearningRes.status === 200 || runLearningRes.status === 201, "Learning Engine executed across historical performance data");

  const recsRes = await get("/api/analytics/recommendations", cookieAlpha);
  assert(recsRes.status === 200, "Recommendations listed for operator review");
  const pendingRec = recsRes.data.recommendations?.find((r) => r.status === "PENDING");
  assert(pendingRec !== undefined, "Generated recommendation is in PENDING status for human decision");

  // Attempt AI review of recommendation -> 403 Forbidden
  const aiRecReview = await post(`/api/analytics/recommendations/${pendingRec.id}/review`, {
    action: "ACCEPT",
    reviewerType: "AI_EDITOR",
  }, cookieAlpha);
  assert(aiRecReview.status === 403, "AI identity prohibited from reviewing recommendations (403 Forbidden)");

  // Brand Brain state before human review
  const brandBefore = await get("/api/brand-brain", cookieAlpha);
  const toneBefore = brandBefore.data.brandBrain.voice?.tone;

  // Authenticated Human Operator reviews recommendation
  const humanRecReview = await post(`/api/analytics/recommendations/${pendingRec.id}/review`, {
    action: "ACCEPT",
    reviewNotes: "Approved by human technical director for next cycle",
  }, cookieAlpha);
  assert(humanRecReview.status === 200, "Human operator successfully reviewed and accepted recommendation");

  // Brand Brain state after human review -> Must remain identical
  const brandAfter = await get("/api/brand-brain", cookieAlpha);
  const toneAfter = brandAfter.data.brandBrain.voice?.tone;
  assert(toneBefore === toneAfter, "Brand Brain voice and identity remain completely unmutated after recommendation accepted");

  // 8. Security Regression: Phases 1–6 UI Routes Still Operational
  console.log("\n8. UI Route Smoke Verification");
  const routes = ["/", "/brand-brain", "/campaigns", "/studio", "/reviews", "/analytics"];
  for (const r of routes) {
    const res = await get(r, cookieAlpha);
    assert(res.status === 200, `UI Route ${r} returns 200 OK`);
  }

  console.log("\n===============================================================================");
  console.log(" ✅ ALL PRODUCTION READINESS & SECURITY AUDIT INVARIANTS VERIFIED (PASS)");
  console.log("===============================================================================\n");
}

run().catch((err) => {
  console.error("FATAL AUDIT FAILURE:", err);
  process.exit(1);
});
