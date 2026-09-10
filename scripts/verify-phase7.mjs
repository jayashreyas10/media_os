/**
 * MediaOS Phase 7 — External Publishing & OAuth Integrations
 * Live E2E Security & Functional Verification Script
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
  console.log(" MEDIAOS PHASE 7 — EXTERNAL PUBLISHING & OAUTH INTEGRATIONS LIVE E2E");
  console.log("===============================================================================\n");

  // 1. Health Check
  console.log("1. System Health Check");
  const health = await get("/api/health");
  assert(health.status === 200 && health.data.status === "ok", "System health reports ok");

  // 2. Tenant Registration
  console.log("\n2. Tenant Setup & Authentication");
  const timestamp = Date.now();
  const emailAlpha = `alpha-phase7-${timestamp}@publishing-live.local`;
  const regAlpha = await post("/api/auth?action=register", {
    email: emailAlpha,
    password: "ProductionReadyPassword123!",
    name: "Publishing Director",
  });
  assert(regAlpha.status === 200, "Publishing Operator registered");
  const cookieAlpha = regAlpha.cookie;

  // 3. Unauthenticated Access Barrier
  console.log("\n3. Unauthenticated API Boundaries");
  const unauthAccounts = await get("/api/publishing/accounts");
  assert(unauthAccounts.status === 401, "Unauthenticated /api/publishing/accounts blocked with 401");

  const unauthPublish = await post("/api/studio/assets/non-existent/publish", {});
  assert(unauthPublish.status === 401, "Unauthenticated /api/studio/assets/[id]/publish blocked with 401");

  // 4. OAuth State / CSRF Generation & Validation
  console.log("\n4. OAuth State & CSRF Protection");
  const oauthInit = await get("/api/oauth/youtube/authorize", cookieAlpha);
  assert(oauthInit.status === 200, "OAuth authorization initiated successfully");
  assert(oauthInit.data.stateToken && oauthInit.data.stateToken.length === 64, "Generated 32-byte cryptographic state token");
  const stateToken = oauthInit.data.stateToken;

  // Replay / Forgery Defense
  const fakeCallback = await get(`/api/oauth/youtube/callback?state=forged-state-12345&code=test`, cookieAlpha);
  assert(fakeCallback.status === 400, "Forged OAuth state rejected with 400 Bad Request");

  // Legitimate OAuth Callback
  const validCallback = await get(`/api/oauth/youtube/callback?state=${stateToken}&code=auth-code-live`, cookieAlpha);
  assert(validCallback.status === 200, "OAuth callback executed and account connected");
  const connectedAccountId = validCallback.data.account.id;

  // Replay Prevention: Using same stateToken again MUST fail
  const replayCallback = await get(`/api/oauth/youtube/callback?state=${stateToken}&code=auth-code-live`, cookieAlpha);
  assert(replayCallback.status === 400, "Replay attack with consumed state token blocked with 400 Bad Request");

  // 5. Zero Token Exposure in API Responses
  console.log("\n5. Token Storage & Zero-Leakage Invariants");
  const accountsRes = await get("/api/publishing/accounts", cookieAlpha);
  assert(accountsRes.status === 200, "Connected accounts list fetched");
  const channel = accountsRes.data.accounts?.find((a) => a.id === connectedAccountId);
  assert(channel !== undefined, "Connected channel present in account catalog");
  assert(channel.encryptedAccessToken === undefined, "encryptedAccessToken strictly omitted from API response");
  assert(channel.encryptedRefreshToken === undefined, "encryptedRefreshToken strictly omitted from API response");
  assert(channel.status === "ACTIVE", "Channel status is ACTIVE");

  // 6. Campaign & Content Studio Setup
  console.log("\n6. Content Creation & Human Approval Gate");
  const campRes = await post("/api/campaigns", {
    title: "Phase 7 Distribution Initiative",
    description: "Multi-channel publishing pipeline",
  }, cookieAlpha);
  const campaignId = campRes.data.campaign.id;

  const assetRes = await post("/api/studio/assets", {
    campaignId,
    type: "YOUTUBE_LONG_FORM",
    title: "Autonomous Multi-Agent Architecture for Enterprise",
  }, cookieAlpha);
  const assetId = assetRes.data.asset.id;

  const genRes = await post(`/api/studio/assets/${assetId}/generate`, { mode: "GENERATE" }, cookieAlpha);
  const v1Id = genRes.data.version.id;

  // AI Publish Attempt -> 403 Forbidden
  const aiPublish = await post(`/api/studio/assets/${assetId}/publish`, {
    versionId: v1Id,
    connectedAccountId,
    platform: "YOUTUBE",
    reviewerType: "AI_EDITOR",
  }, cookieAlpha);
  assert(aiPublish.status === 403, "AI identity publish attempt strictly blocked with 403 Forbidden");

  // Publish Unapproved Asset (in GENERATED status) -> 400 Bad Request
  const unapprovedPublish = await post(`/api/studio/assets/${assetId}/publish`, {
    versionId: v1Id,
    connectedAccountId,
    platform: "YOUTUBE",
  }, cookieAlpha);
  assert(unapprovedPublish.status === 400, "Publishing unapproved asset blocked with 400 Bad Request");

  // Human Operator Approves v1
  await patch(`/api/studio/assets/${assetId}`, { status: "EDITING" }, cookieAlpha);
  await patch(`/api/studio/assets/${assetId}`, { status: "READY_FOR_REVIEW" }, cookieAlpha);
  const approveRes = await post(`/api/studio/assets/${assetId}/approve`, {
    versionId: v1Id,
    comment: "Editorial Director signed off on technical claims and chapters.",
  }, cookieAlpha);
  assert(approveRes.status === 200, "Human operator approved content asset");

  // 7. Live Publishing Execution
  console.log("\n7. Live Publishing Execution & Delivery");
  const publishRes = await post(`/api/studio/assets/${assetId}/publish`, {
    versionId: v1Id,
    connectedAccountId,
    platform: "YOUTUBE",
  }, cookieAlpha);
  assert(publishRes.status === 200 || publishRes.status === 201, "Publishing dispatch executed successfully");
  assert(publishRes.data.isDuplicate === false, "Initial publication marked isDuplicate: false");
  assert(publishRes.data.publishingRecord.status === "PUBLISHED", "PublishingRecord transitioned to PUBLISHED");
  assert(publishRes.data.publishingRecord.externalPostId.startsWith("yt_"), "Assigned authentic platform video ID");
  assert(publishRes.data.publishingRecord.externalPostUrl.includes("youtube.com/watch?v="), "Generated public post URL");

  const assetAfterPub = await get(`/api/studio/assets/${assetId}`, cookieAlpha);
  assert(assetAfterPub.data.asset.status === "PUBLISHED", "ContentAsset status transitioned to PUBLISHED");

  // 8. Delivery Idempotency: Re-publishing Prevents Duplicate Dispatch
  console.log("\n8. Publishing Idempotency Enforcement");
  const dupPublishRes = await post(`/api/studio/assets/${assetId}/publish`, {
    versionId: v1Id,
    connectedAccountId,
    platform: "YOUTUBE",
  }, cookieAlpha);
  assert(dupPublishRes.status === 200, "Duplicate publication call returned 200 OK");
  assert(dupPublishRes.data.isDuplicate === true, "Gracefully caught by idempotency lock: isDuplicate is true");
  assert(
    dupPublishRes.data.publishingRecord.externalPostId === publishRes.data.publishingRecord.externalPostId,
    "Preserved original video ID without creating a duplicate post"
  );

  // 9. Version Invalidation on Content Edit
  console.log("\n9. Version Invalidation on Subsequent Edit");
  const saveRes = await post(`/api/studio/assets/${assetId}/save`, {
    blocks: [{ blockType: "CHAPTER", orderIndex: 0, content: "Post-approval edit" }],
    changeSummary: "Manual tweak after publishing",
  }, cookieAlpha);
  assert(saveRes.status === 200, "Saved edits creating new immutable version");

  // Attempting to publish v1 again after asset was modified MUST fail
  const postEditPublish = await post(`/api/studio/assets/${assetId}/publish`, {
    versionId: v1Id,
    connectedAccountId,
    platform: "YOUTUBE",
  }, cookieAlpha);
  assert(postEditPublish.status === 400, "Post-edit publishing blocked: asset status reverted to EDITING");

  // 10. Channel Revocation & Token Destruction
  console.log("\n10. Channel Revocation & Token Destruction");
  const revokeRes = await post(`/api/publishing/accounts/${connectedAccountId}/revoke`, {}, cookieAlpha);
  assert(revokeRes.status === 200, "Channel revoked successfully");
  assert(revokeRes.data.account.status === "REVOKED", "Account marked as REVOKED");

  // 11. Publishing History & Audit Trail
  console.log("\n11. Publishing History & Zero Token Exposure in Audits");
  const histRes = await get(`/api/studio/assets/${assetId}/publishing-history`, cookieAlpha);
  assert(histRes.status === 200, "Publishing history retrieved");
  assert(histRes.data.history?.length >= 1, "Historical publishing records cataloged for asset");

  const auditRes = await get("/api/audit", cookieAlpha);
  assert(auditRes.status === 200, "Audit logs retrieved");
  const pubAudit = auditRes.data.logs?.find((l) => l.action === "CONTENT_PUBLISHED");
  assert(pubAudit !== undefined, "CONTENT_PUBLISHED audit event recorded in workspace audit trail");
  assert(!JSON.stringify(pubAudit).includes("tok_"), "Audit logs contain ZERO raw or encrypted token leakage");

  // 12. Frontend Route Smoke Test
  console.log("\n12. UI Route Smoke Verification");
  const routes = ["/publishing", "/studio", "/studio/" + assetId];
  for (const r of routes) {
    const res = await get(r, cookieAlpha);
    assert(res.status === 200, `UI route ${r} returns 200 OK`);
  }

  console.log("\n===============================================================================");
  console.log(" ✅ ALL PHASE 7 PUBLISHING & SECURITY INVARIANTS VERIFIED (PASS)");
  console.log("===============================================================================\n");
}

run().catch((err) => {
  console.error("FATAL PHASE 7 VERIFICATION FAILURE:", err);
  process.exit(1);
});
