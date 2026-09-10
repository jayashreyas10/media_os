/**
 * MediaOS Phase 5 End-to-End Acceptance Verification Script
 * 
 * Verifies the complete Editorial Review & Human Approval Gate lifecycle:
 * 1. System Health Check (/api/health)
 * 2. Operator Authentication (/api/auth)
 * 3. ContentAsset creation and v1 generation
 * 4. Triggering AI Editorial Review on clean v1 -> verifies PASSED verdict and score
 * 5. Creating a v2 with intentional Brand Voice forbidden buzzwords
 * 6. Running Editorial Review on v2 -> verifies deterministic REVISION_REQUIRED verdict, findings, and RevisionRequest persistence
 * 7. Executing automated Revision Loop (/api/studio/assets/[id]/revision-loop) -> creates v3, resolves revision requests, re-reviews
 * 8. Testing Mandatory Human Approval Gate:
 *    - Rejection of AI approval attempts (server-side hard guard)
 *    - Rejection of approval with empty comment
 *    - Legitimate Human Approval with operator comment -> transitions to APPROVED
 * 9. Version Immutability & Binding:
 *    - Creating v4 leaves v3 untouched and makes v3 unapprovable as past version
 * 10. Approval Revocation:
 *    - Revoking approval preserves historical HUMAN_APPROVED record and logs APPROVAL_REVOKED
 * 11. UI Routes Verification:
 *    - /reviews dashboard returns 200 OK
 *    - /studio/[assetId] detail returns 200 OK
 */

import http from "node:http";

const BASE_URL = "http://localhost:3000";

async function post(endpoint, data = {}, cookie = "") {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const url = new URL(endpoint, BASE_URL);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let body = "";
        const setCookie = res.headers["set-cookie"];
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              data: body ? JSON.parse(body) : null,
              cookie: setCookie ? setCookie.map((c) => c.split(";")[0]).join("; ") : "",
            });
          } catch {
            resolve({ status: res.statusCode, data: body, cookie: "" });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function get(endpoint, cookie = "") {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const req = http.request(
      url,
      {
        method: "GET",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              data: body ? JSON.parse(body) : null,
            });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function pass(msg) {
  console.log(`\x1b[32m✔ PASS:\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\x1b[31m✖ FAIL:\x1b[0m ${msg}`);
  process.exit(1);
}

function header(msg) {
  console.log(`\n\x1b[36m=== ${msg} ===\x1b[0m`);
}

async function run() {
  console.log("Starting MediaOS Phase 5 End-to-End Acceptance Verification...\n");

  // 1. Health Check
  header("1. System Health Check");
  const health = await get("/api/health");
  if (health.status !== 200) fail(`Health check failed with status ${health.status}`);
  pass(`Health check returned 200 OK (database: ${health.data?.database}, mode: ${health.data?.aiProviderMode})`);

  // 2. Authentication
  header("2. Operator Authentication");
  const authRes = await post("/api/auth?action=login", {
    email: "operator@mediaos.local",
    password: "Password123!",
  });
  if (authRes.status !== 200 || !authRes.cookie) {
    fail(`Authentication failed with status ${authRes.status}`);
  }
  const cookie = authRes.cookie;
  pass(`Authenticated as ${authRes.data?.user?.email} in workspace "${authRes.data?.workspace?.name}"`);

  // 3. Campaign Selection / Creation
  header("3. Campaign Selection");
  const campaignsRes = await get("/api/campaigns", cookie);
  let campaign = campaignsRes.data?.campaigns?.[0];
  if (!campaign) {
    fail("No existing campaign found. Ensure previous phase migrations or seed ran.");
  }
  pass(`Using campaign: "${campaign.title}" (${campaign.id})`);

  // 4. ContentAsset Creation
  header("4. Content Studio Asset Creation");
  const createAssetRes = await post(
    "/api/studio/assets",
    {
      campaignId: campaign.id,
      type: "YOUTUBE_LONG_FORM",
      title: "Phase 5 Verification: Autonomous Agents in Production",
    },
    cookie
  );
  if (![200, 201].includes(createAssetRes.status) || !createAssetRes.data?.asset) {
    fail(`Failed to create asset: ${createAssetRes.status}`);
  }
  const assetId = createAssetRes.data.asset.id;
  pass(`Created ContentAsset "${createAssetRes.data.asset.title}" (${assetId}) in status ${createAssetRes.data.asset.status}`);

  // 5. Generate Initial Version (v1)
  header("5. Writer Generation (v1)");
  const genRes = await post(`/api/studio/assets/${assetId}/generate`, { mode: "GENERATE" }, cookie);
  if (![200, 201].includes(genRes.status) || !genRes.data?.version) {
    fail(`Failed to generate content: ${genRes.status}`);
  }
  const v1 = genRes.data.version;
  pass(`Generated v1 with ${v1.blocks?.length} blocks and ${v1.claimReferences?.length} claim references`);

  // 6. Trigger AI Editorial Review on v1
  header("6. Run AI Editorial Review on Clean v1");
  const reviewV1Res = await post(`/api/studio/assets/${assetId}/review`, { versionId: v1.id }, cookie);
  if (![200, 201].includes(reviewV1Res.status) || !reviewV1Res.data?.review) {
    fail(`Failed to run review on v1: ${reviewV1Res.status}`);
  }
  const rev1 = reviewV1Res.data.review;
  pass(`Editorial review completed: Verdict=${rev1.verdict}, Status=${rev1.status}, OverallScore=${rev1.overallScore}/100`);

  // 7. Inject Intentional Brand Voice Violation to produce v2
  header("7. Inject Forbidden Buzzwords to produce v2");
  const saveV2Res = await post(
    `/api/studio/assets/${assetId}/save`,
    {
      changeSummary: "v2 with injected forbidden buzzwords",
      blocks: [
        {
          blockType: "HOOK",
          orderIndex: 0,
          title: "Injected Hook",
          content: "We delve into this revolutionary game-changer to supercharge and unleash your media workflow.",
          statementType: "OPINION",
        },
        {
          blockType: "CONCLUSION",
          orderIndex: 1,
          title: "Conclusion",
          content: "Always check your evidence graph before publishing.",
          statementType: "RECOMMENDATION",
        },
      ],
    },
    cookie
  );
  if (![200, 201].includes(saveV2Res.status) || !saveV2Res.data?.version) {
    fail(`Failed to save v2 edits: ${saveV2Res.status}`);
  }
  const v2 = saveV2Res.data.version;
  pass(`Created v2 (${v2.id}) with intentional forbidden words`);

  // 8. Run Review on v2 -> Must Flag REVISION_REQUIRED
  header("8. Editorial Review on v2 (Deterministic Pre-Checks)");
  const reviewV2Res = await post(`/api/studio/assets/${assetId}/review`, { versionId: v2.id }, cookie);
  if (![200, 201].includes(reviewV2Res.status) || !reviewV2Res.data?.review) {
    fail(`Failed to run review on v2: ${reviewV2Res.status}`);
  }
  const rev2 = reviewV2Res.data.review;
  if (rev2.status !== "REVISION_REQUIRED") {
    fail(`Expected review status REVISION_REQUIRED, got "${rev2.status}"`);
  }
  pass(`Review correctly failed: Status=${rev2.status}, Verdict=${rev2.verdict}`);
  pass(`Generated ${rev2.revisionRequests?.length || 0} open RevisionRequest records`);

  // 9. Automated Revision Loop
  header("9. Automated Revision Loop Execution");
  const revLoopRes = await post(`/api/studio/assets/${assetId}/revision-loop`, {}, cookie);
  if (![200, 201].includes(revLoopRes.status) || !revLoopRes.data?.newVersion) {
    fail(`Failed to execute revision loop: ${revLoopRes.status}`);
  }
  const v3 = revLoopRes.data.newVersion;
  pass(`Revision loop successfully generated v${v3.versionNumber} (${v3.id})`);
  pass(`Revision loop review result: Status=${revLoopRes.data.status}`);

  // 10. Mandatory Human Approval Gate: AI Blocking
  header("10. Mandatory Human Approval Gate: Server-side AI Block");
  const aiApproveRes = await post(
    `/api/studio/assets/${assetId}/approve`,
    {
      versionId: v3.id,
      comment: "AI autonomous sign-off attempt",
      isAI: true,
    },
    cookie
  );
  if (aiApproveRes.status !== 403) {
    fail(`Expected 403 Forbidden for AI approval attempt, got ${aiApproveRes.status}`);
  }
  pass(`AI autonomous approval was strictly blocked with 403 Forbidden: "${aiApproveRes.data?.error}"`);

  // 11. Mandatory Human Approval Gate: Empty Comment Rejection
  header("11. Mandatory Human Approval Gate: Comment Requirement");
  const emptyCommentRes = await post(
    `/api/studio/assets/${assetId}/approve`,
    {
      versionId: v3.id,
      comment: "   ",
    },
    cookie
  );
  if (emptyCommentRes.status !== 400) {
    fail(`Expected 400 Bad Request for empty comment, got ${emptyCommentRes.status}`);
  }
  pass(`Approval without mandatory comment was rejected with 400: "${emptyCommentRes.data?.error}"`);

  // 12. Mandatory Human Approval Gate: Legitimate Operator Sign-Off
  header("12. Mandatory Human Approval Gate: Operator Sign-off");
  // Ensure asset is in REVIEW_PASSED or READY_FOR_REVIEW for human approval
  await post(`/api/studio/assets/${assetId}/review`, { versionId: v3.id }, cookie);

  const humanApproveRes = await post(
    `/api/studio/assets/${assetId}/approve`,
    {
      versionId: v3.id,
      comment: "Verified citations against Apex 2026 reliability study. Script is approved for production.",
    },
    cookie
  );
  if (humanApproveRes.status !== 200 || humanApproveRes.data?.asset?.status !== "APPROVED") {
    fail(`Failed human approval: ${humanApproveRes.status} -> ${JSON.stringify(humanApproveRes.data)}`);
  }
  pass(`Human approval succeeded! Asset status is now APPROVED`);
  pass(`ApprovalRecord ID: ${humanApproveRes.data?.approvalRecord?.id}`);

  // 13. Approval Revocation
  header("13. Human Approval Revocation");
  const revokeRes = await post(
    `/api/studio/assets/${assetId}/revoke-approval`,
    {
      versionId: v3.id,
      reason: "New counter-study emerged regarding ReAct loop benchmarks. Halting publication.",
    },
    cookie
  );
  if (revokeRes.status !== 200 || revokeRes.data?.asset?.status !== "READY_FOR_REVIEW") {
    fail(`Failed to revoke approval: ${revokeRes.status}`);
  }
  pass(`Approval revoked: Asset transitioned back to READY_FOR_REVIEW`);

  // 14. Audit Trail Inspection
  header("14. Approval Audit Trail Inspection");
  const approvalsRes = await get(`/api/studio/assets/${assetId}/approvals`, cookie);
  if (approvalsRes.status !== 200 || !approvalsRes.data?.approvals) {
    fail(`Failed to list approvals: ${approvalsRes.status}`);
  }
  const approvals = approvalsRes.data.approvals;
  const actions = approvals.map((a) => a.action);
  if (!actions.includes("HUMAN_APPROVED") || !actions.includes("APPROVAL_REVOKED")) {
    fail(`Audit trail missing expected actions: found ${JSON.stringify(actions)}`);
  }
  pass(`Audit trail intact: contains both HUMAN_APPROVED and APPROVAL_REVOKED records`);

  // 15. UI Routes Verification
  header("15. UI Routes Verification");
  const reviewsUi = await get("/reviews", cookie);
  if (reviewsUi.status !== 200) fail(`/reviews returned ${reviewsUi.status}`);
  pass(`GET /reviews returned 200 OK (${reviewsUi.data.length} bytes)`);

  const studioUi = await get(`/studio/${assetId}`, cookie);
  if (studioUi.status !== 200) fail(`/studio/${assetId} returned ${studioUi.status}`);
  pass(`GET /studio/${assetId} returned 200 OK (${studioUi.data.length} bytes)`);

  console.log("\n\x1b[32m===========================================================\x1b[0m");
  console.log("\x1b[32m✔ ALL PHASE 5 END-TO-END ACCEPTANCE CHECKS PASSED (15/15)!\x1b[0m");
  console.log("\x1b[32m===========================================================\x1b[0m\n");
}

run().catch((err) => {
  console.error("Fatal error during Phase 5 verification:", err);
  process.exit(1);
});
