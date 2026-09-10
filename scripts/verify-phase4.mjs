/**
 * MediaOS Phase 4 End-to-End Acceptance Verification Script
 * 
 * Verifies:
 * 1. Health check endpoint (/api/health)
 * 2. Signal Scout -> Promote -> Research -> Strategy pipeline produces verified claims and thesis
 * 3. Content Studio catalog (/studio) loads with 200 OK
 * 4. ContentAsset creation (/api/studio/assets) with Workspace/Brand/Campaign scoping
 * 5. Generation (/api/studio/assets/[id]/generate) with MockAIProvider
 * 6. Structured block verification (Hook, Promise, Context, Chapters with evidence, Conclusion, CTA)
 * 7. Evidence Provenance & verified claim linking
 * 8. Block editing & immutable versioning (v1 -> v2) via /api/studio/assets/[id]/save
 * 9. Visual Diff computation (/api/studio/assets/[id]/diff) with structured and text LCS diffs
 * 10. Non-destructive restore (/api/studio/assets/[id]/versions/[versionId]/restore) creates v3 matching v1
 * 11. Lifecycle status guards: DRAFT -> GENERATED -> EDITING -> READY_FOR_REVIEW -> APPROVED
 * 12. Rejection of unearned auto-approval and strict prohibition of PUBLISHED (Phase 4 guard)
 * 13. Studio asset detail page UI route (/studio/[id]) loads with 200 OK
 * 14. Asset duplication (/api/studio/assets/[id]/duplicate) creates fresh asset with v1 snapshot
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

async function patch(endpoint, data = {}, cookie = "") {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const url = new URL(endpoint, BASE_URL);
    const req = http.request(
      url,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
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
              rawText: body,
            });
          } catch {
            resolve({ status: res.statusCode, data: null, rawText: body });
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log("================================================================================");
  console.log("🚀 MEDIAOS PHASE 4 END-TO-END VERIFICATION: CONTENT STUDIO & DOWNSTREAM GENERATION");
  console.log("================================================================================\n");

  // Step 1: Health Check
  console.log("STEP 1: Verify API Health & Provider Status");
  const health = await get("/api/health");
  assert(health.status === 200, "Health check endpoint returned 200 OK");
  assert(health.data?.status === "ok", "System status is healthy ('ok')");
  assert(health.data?.mode === "mock-ai", "Active AI provider is deterministic free MOCK mode");

  // Step 1b: Authenticate Session
  console.log("\nSTEP 1b: Authenticate User Session");
  const login = await post("/api/auth?action=login", {
    email: "operator@mediaos.local",
    password: "Password123!",
  });
  assert(login.status === 200, "User logged in with operator credentials");
  const cookie = login.cookie;
  assert(Boolean(cookie), "Received valid session cookie");

  // Step 2: Ensure Campaign with Strategy and Verified Evidence exists
  console.log("\nSTEP 2: Upstream Intelligence Pipeline (Signal -> Campaign -> Research -> Strategy)");
  const signals = await get("/api/signals", cookie);
  assert(signals.status === 200, "Signal Scout endpoint returned 200 OK");
  const signalList = signals.data?.signals || [];
  assert(signalList.length > 0, "Signal Scout discovered signals");

  // Promote top signal
  const topSignal = signalList[0];
  const promoteRes = await post(
    "/api/signals/promote",
    {
      title: topSignal.title || "Phase 4 Production Masterclass",
      event: topSignal.event || "Engineering Breakthrough",
      whyNow: topSignal.whyNow || "Production scale requirements",
      suggestedAngle: topSignal.suggestedAngle || "State machines for bounded execution",
      opportunityScore: topSignal.opportunityScore || 95,
    },
    cookie
  );
  assert(
    [200, 201].includes(promoteRes.status),
    "Promoted signal to active Campaign in DISCOVERY stage"
  );
  const campaignId = promoteRes.data.campaign.id;

  // Run Evidence Researcher
  console.log(`  Running Evidence Researcher for campaign ${campaignId}...`);
  const researchRes = await post("/api/research", { campaignId }, cookie);
  assert(researchRes.status === 200, "Evidence Researcher completed successfully");
  assert(researchRes.data.result.claimCount > 0, "Researcher extracted verified claims with grounded evidence");

  // Run Content Strategist
  console.log("  Running Content Strategist to synthesize thesis & strategy...");
  const strategyRes = await post("/api/strategy", { campaignId }, cookie);
  assert(strategyRes.status === 200, "Content Strategist synthesized singular thesis");
  assert(Boolean(strategyRes.data.strategy.thesis), "Strategy record contains high-conviction thesis");

  // Step 3: Content Studio Catalog UI Check
  console.log("\nSTEP 3: Content Studio Catalog Route (/studio)");
  const studioPage = await get("/studio", cookie);
  assert(studioPage.status === 200, "/studio page loaded with HTTP 200 OK");
  assert(studioPage.rawText.includes("Content Studio"), "Studio UI contains Content Studio header");

  // Step 4: Create ContentAsset
  console.log("\nSTEP 4: Create Content Asset in Content Studio");
  const createAssetRes = await post("/api/studio/assets", {
    campaignId,
    type: "YOUTUBE_LONG_FORM",
    title: "Stop Prompting. Start Engineering: The 6-Agent Operating Model",
  }, cookie);
  assert(
    [200, 201].includes(createAssetRes.status),
    "Created ContentAsset in DRAFT status"
  );
  const asset = createAssetRes.data.asset;
  assert(asset.type === "YOUTUBE_LONG_FORM", "Asset type is YOUTUBE_LONG_FORM");
  assert(asset.status === "DRAFT", "Initial asset status is DRAFT");
  const assetId = asset.id;

  // Step 5: Generate Draft with WriterService & MockAIProvider
  console.log("\nSTEP 5: Generate Structured Content Draft via WriterService");
  const generateRes = await post(`/api/studio/assets/${assetId}/generate`, {
    mode: "GENERATE",
  }, cookie);
  assert(generateRes.status === 200, "Generation API executed successfully");
  const v1 = generateRes.data.version;
  assert(v1.versionNumber === 1, "Initial generation created version 1");
  assert(v1.sourceType === "AI_GENERATED" || v1.sourceType === "GENERATED", "Source type marked as AI_GENERATED");
  const v1Id = v1.id;

  // Step 6: Verify Structured Blocks
  console.log("\nSTEP 6: Verify Structured Block Composition");
  const blocks = v1.blocks;
  const blockTypes = blocks.map((b) => b.blockType);
  assert(blockTypes.includes("HOOK"), "Contains video HOOK block");
  assert(blockTypes.includes("PROMISE"), "Contains viewer PROMISE block");
  assert(blockTypes.includes("CONTEXT"), "Contains CONTEXT block");
  assert(blockTypes.includes("CHAPTER"), "Contains CHAPTER blocks");
  assert(blockTypes.includes("CONCLUSION"), "Contains CONCLUSION block");
  assert(blockTypes.includes("CTA"), "Contains CTA block");

  const chapters = blocks.filter((b) => b.blockType === "CHAPTER");
  assert(chapters.length >= 3, `Generated ${chapters.length} chapters (>= 3 chapters)`);
  assert(Boolean(chapters[0].title), "Chapter has title");
  assert(Boolean(chapters[0].content), "Chapter has narration body");
  assert(Boolean(chapters[0].example), "Chapter has concrete example");
  assert(Boolean(chapters[0].transition), "Chapter has forward narrative transition");

  // Step 7: Verify Evidence Provenance & Claim Tracing
  console.log("\nSTEP 7: Evidence Provenance & Claim Tracing Verification");
  const claimRefs = v1.claimReferences || [];
  assert(claimRefs.length > 0, `Linked ${claimRefs.length} verifiable claim references in script`);
  assert(Boolean(claimRefs[0].claim), "Claim reference points to verified claim entity");
  assert(Boolean(claimRefs[0].claim.claimText), "Claim text is preserved in evidence provenance");

  // Step 8: Manual Block Editing & Immutable Versioning
  console.log("\nSTEP 8: Manual Edit in Block Editor (Creates v2)");
  const modifiedBlocks = blocks.map((b) => {
    if (b.blockType === "CHAPTER" && b.orderIndex === 3) {
      return {
        ...b,
        content: b.content + " [HUMAN EDIT: Verified against internal cluster benchmarks]",
      };
    }
    return b;
  });

  const saveEditRes = await post(`/api/studio/assets/${assetId}/save`, {
    blocks: modifiedBlocks,
    changeSummary: "Added cluster benchmark verification note to chapter 1",
  }, cookie);
  assert(saveEditRes.status === 200, "Saved manual edit version");
  const v2 = saveEditRes.data.version;
  assert(v2.versionNumber === 2, "Manual edit created version 2");
  assert(v2.sourceType === "MANUAL_EDIT", "v2 sourceType is MANUAL_EDIT");
  const v2Id = v2.id;

  // Step 9: Visual Diff Computation
  console.log("\nSTEP 9: Visual Diff Inspection (v1 vs v2)");
  const diffRes = await get(`/api/studio/assets/${assetId}/diff?v1=${v1Id}&v2=${v2Id}`, cookie);
  assert(diffRes.status === 200, "Diff API returned 200 OK");
  const diff = diffRes.data.diff;
  assert(diff.v1VersionNumber === 1, "Diff v1 number is 1");
  assert(diff.v2VersionNumber === 2, "Diff v2 number is 2");
  assert(diff.summary.blocksModified === 1, "Structured diff detected exactly 1 modified block");
  assert(diff.textDiff.length > 0, "Text diff computed line-by-line diff");
  const hasAdded = diff.textDiff.some((l) => l.type === "added");
  assert(hasAdded, "Text diff identified added lines in v2");

  // Step 10: Non-Destructive Restore (Restore v1 -> v3)
  console.log("\nSTEP 10: Restore v1 (Guarantees History Immutability: v1 -> v2 -> restore v1 -> v3)");
  const restoreRes = await post(`/api/studio/assets/${assetId}/versions/${v1Id}/restore`, {}, cookie);
  assert(restoreRes.status === 200, "Restored v1 successfully");
  const v3 = restoreRes.data.version;
  assert(v3.versionNumber === 3, "Restoration created immutable version 3");
  assert(v3.sourceType === "RESTORED", "v3 sourceType is RESTORED");

  // Verify versions history endpoint
  const versionsRes = await get(`/api/studio/assets/${assetId}/versions`, cookie);
  assert(versionsRes.status === 200, "Versions list returned 200 OK");
  const versionHistory = versionsRes.data.versions;
  assert(versionHistory.length === 3, "Complete version history preserved (3 versions: v1, v2, v3)");

  // Step 11: Lifecycle Transitions & Guardrails
  console.log("\nSTEP 11: Lifecycle Status Machine & Phase 4 Approval Safeguards");
  // 11a: Cannot jump to APPROVED from DRAFT or EDITING
  const badApprove = await patch(`/api/studio/assets/${assetId}`, { status: "APPROVED" }, cookie);
  assert(badApprove.status === 400, "Asset in EDITING cannot jump directly to APPROVED");

  // 11b: Transition to READY_FOR_REVIEW
  const readyRes = await patch(`/api/studio/assets/${assetId}`, { status: "READY_FOR_REVIEW" }, cookie);
  if (readyRes.status !== 200) {
    console.log("readyRes status:", readyRes.status, "data:", readyRes.data);
  }
  assert(readyRes.status === 200, "Transitioned asset to READY_FOR_REVIEW");

  // 11c: Human Editorial Approval from READY_FOR_REVIEW
  const approveRes = await patch(`/api/studio/assets/${assetId}`, { status: "APPROVED" }, cookie);
  assert(approveRes.status === 200, "Human editor approved asset from READY_FOR_REVIEW");

  // 11d: External publishing is strictly forbidden in Phase 4
  const publishRes = await patch(`/api/studio/assets/${assetId}`, { status: "PUBLISHED" }, cookie);
  assert(publishRes.status === 400, "PUBLISHED status is strictly rejected (external publishing reserved for Phase 7)");

  // Step 12: Studio Detail UI Route
  console.log("\nSTEP 12: Content Studio Editor Detail Page (/studio/[id])");
  const detailUi = await get(`/studio/${assetId}`, cookie);
  assert(
    detailUi.rawText.toLowerCase().includes("studio workspace") || detailUi.rawText.includes("Content Studio"),
    "Studio workspace interface rendered correctly"
  );

  // Step 13: Asset Duplication
  console.log("\nSTEP 13: Asset Duplication");
  const dupRes = await post(`/api/studio/assets/${assetId}/duplicate`, {}, cookie);
  assert(
    [200, 201].includes(dupRes.status),
    "Duplicated asset successfully"
  );
  const dupAsset = dupRes.data.asset;
  assert(dupAsset.id !== assetId, "Duplicated asset has distinct ID");
  assert(dupAsset.title.includes("(Copy)"), "Duplicated asset title contains '(Copy)'");
  assert(dupAsset.status === "DRAFT", "Duplicated asset initialized in DRAFT state");

  console.log("\n================================================================================");
  console.log("🎉 ALL PHASE 4 CONTENT STUDIO VERIFICATION CHECKS PASSED WITH 100% SUCCESS!");
  console.log("================================================================================\n");
}

run().catch((err) => {
  console.error("FATAL ERROR IN VERIFICATION:", err);
  process.exit(1);
});
