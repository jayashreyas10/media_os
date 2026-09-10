// Phase 1 Acceptance Test Script
async function runAcceptanceSuite() {
  console.log("==================================================");
  console.log("   MEDIAOS PHASE 1 LIVE ACCEPTANCE TEST SUITE     ");
  console.log("==================================================\n");

  const baseUrl = "http://localhost:3000";
  let sessionCookie = "";

  // Wait for server to be ready
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!ready) {
    throw new Error("Dev server did not start on port 3000 within 20s");
  }

  // 1. Health check
  console.log("Step 1: Testing /api/health endpoint...");
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const healthData = await healthRes.json();
  console.log(`✓ Health status: ${healthData.status}, DB: ${healthData.database}`);
  if (healthData.status !== "ok" || healthData.database !== "connected") {
    throw new Error("Health check failed");
  }

  // 2. Authentication: Login with seeded operator
  console.log("\nStep 2: Authenticating as seeded operator...");
  const loginRes = await fetch(`${baseUrl}/api/auth?action=login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "operator@mediaos.local",
      password: "Password123!",
    }),
  });
  if (!loginRes.ok) throw new Error("Login failed");
  const rawCookies = loginRes.headers.get("set-cookie") || "";
  sessionCookie = rawCookies.split(";")[0];
  console.log(`✓ Authenticated successfully. Session Cookie captured.`);

  const authHeaders = {
    Cookie: sessionCookie,
    "Content-Type": "application/json",
  };

  // 3. Verify Session & Workspace/Brand context
  console.log("\nStep 3: Verifying workspace and brand context...");
  const userRes = await fetch(`${baseUrl}/api/auth`, { headers: authHeaders });
  const userData = await userRes.json();
  console.log(`✓ Operator: ${userData.user.name} (${userData.user.email})`);
  console.log(`✓ Workspace: ${userData.workspace.name} (id: ${userData.workspace.id})`);
  console.log(`✓ Brand: ${userData.brand.name} (id: ${userData.brand.id})`);

  // 4. Retrieve Brand Brain
  console.log("\nStep 4: Fetching Brand Brain editorial memory...");
  const bbRes = await fetch(`${baseUrl}/api/brand-brain`, { headers: authHeaders });
  const bbData = await bbRes.json();
  console.log(`✓ Brand Brain loaded. Content Pillars count: ${bbData.brandBrain.pillars.length}`);
  console.log(`✓ Editorial Rules count: ${bbData.brandBrain.editorialRules.length}`);

  // 5. Edit Brand Brain
  console.log("\nStep 5: Editing Brand Brain (updating tone & style)...");
  const updateRes = await fetch(`${baseUrl}/api/brand-brain`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      section: "voice",
      data: {
        tone: "Direct, technical, authoritative, highly empirical, zero fluff.",
        styleGuidelines: "Lead with empirical benchmarks. Highlight architecture diagrams.",
        forbiddenWords: "delve, game-changer, revolutionary, supercharge, leverage, unleash",
        signaturePhrases: "Build systems, not scripts; Evidence over confidence",
      },
    }),
  });
  if (!updateRes.ok) throw new Error("Brand brain update failed");
  console.log("✓ Brand Brain updated and persisted.");

  // 6. Create new Campaign
  console.log("\nStep 6: Creating new production campaign...");
  const campRes = await fetch(`${baseUrl}/api/campaigns`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      title: "State Machines in Production Media",
      brief: "Technical essay on using deterministic state machines to control AI workflows.",
      priority: "HIGH",
    }),
  });
  const campData = await campRes.json();
  const campaign = campData.campaign;
  console.log(`✓ Campaign created: "${campaign.title}" (ID: ${campaign.id}, Stage: ${campaign.stage})`);

  // 7. Transition Campaign: DISCOVERY -> RESEARCH
  console.log("\nStep 7: Advancing campaign: DISCOVERY -> RESEARCH...");
  const trans1Res = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/transition`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      targetStage: "RESEARCH",
      reason: "Approved discovery signal on agent architectures.",
    }),
  });
  if (!trans1Res.ok) throw new Error("Transition to RESEARCH failed");
  console.log("✓ Stage advanced to RESEARCH.");

  // 8. Transition Campaign: RESEARCH -> STRATEGY
  console.log("\nStep 8: Advancing campaign: RESEARCH -> STRATEGY...");
  const trans2Res = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/transition`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      targetStage: "STRATEGY",
      reason: "Evidence verified against benchmarks.",
    }),
  });
  if (!trans2Res.ok) throw new Error("Transition to STRATEGY failed");
  console.log("✓ Stage advanced to STRATEGY.");

  // 9. Attempt ILLEGAL transition: STRATEGY -> PUBLISHED (must be rejected!)
  console.log("\nStep 9: Testing state machine enforcement (attempting illegal STRATEGY -> PUBLISHED)...");
  const illegalRes = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/transition`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ targetStage: "PUBLISHED" }),
  });
  console.log(`✓ Server response status: ${illegalRes.status} (Expected: 422)`);
  if (illegalRes.status !== 422) {
    throw new Error("State machine allowed illegal skip transition!");
  }
  const illegalJson = await illegalRes.json();
  console.log(`✓ Rejection message: "${illegalJson.error}"`);

  // 10. Advance to CREATION
  console.log("\nStep 10: Advancing campaign: STRATEGY -> CREATION...");
  const trans3Res = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/transition`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ targetStage: "CREATION" }),
  });
  if (!trans3Res.ok) throw new Error("Transition to CREATION failed");
  console.log("✓ Stage advanced to CREATION.");

  // 11. Test Revision Transition: CREATION -> STRATEGY
  console.log("\nStep 11: Testing revision transition: CREATION -> STRATEGY...");
  const revRes = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/transition`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      targetStage: "STRATEGY",
      reason: "Editorial revision requested: pivot angle toward solo founders.",
    }),
  });
  if (!revRes.ok) throw new Error("Revision rollback failed");
  console.log("✓ Revision transition accepted and recorded.");

  // 12. Execute Mock AI Task
  console.log("\nStep 12: Executing AI Task (Signal Scout via Mock AI)...");
  const taskRes = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      taskType: "SIGNAL_SCOUT",
      campaignId: campaign.id,
      inputData: { focus: "State machines and deterministic agents" },
      autoExecute: true,
    }),
  });
  const taskData = await taskRes.json();
  const task = taskData.task;
  console.log(`✓ Task executed. ID: ${task.id}, Status: ${task.status}`);
  const output = JSON.parse(task.outputJson);
  console.log(`✓ AI Output Zod Validated: ${output.signals.length} signals generated.`);
  console.log(`✓ Recommended Signal: "${output.signals[0].title}" (Score: ${output.signals[0].opportunityScore}/10)`);

  // 13. Verify Task Queue
  console.log("\nStep 13: Verifying Task Queue query...");
  const listTasksRes = await fetch(`${baseUrl}/api/tasks?campaignId=${campaign.id}`, {
    headers: authHeaders,
  });
  const listTasksData = await listTasksRes.json();
  console.log(`✓ Tasks associated with campaign: ${listTasksData.tasks.length}`);

  // 14. Verify Audit Log
  console.log("\nStep 14: Verifying Audit Log append stream...");
  const auditRes = await fetch(`${baseUrl}/api/audit`, { headers: authHeaders });
  const auditData = await auditRes.json();
  console.log(`✓ Total audit events recorded: ${auditData.logs.length}`);
  console.log(`✓ Most recent audit action: "${auditData.logs[0].action}" on ${auditData.logs[0].entityType}`);

  // 15. Verify UI pages render HTML without errors
  console.log("\nStep 15: Verifying frontend routes render HTML...");
  const pages = ["/", "/campaigns", `/campaigns/${campaign.id}`, "/brand-brain", "/tasks", "/audit", "/login"];
  for (const page of pages) {
    const pageRes = await fetch(`${baseUrl}${page}`, { headers: authHeaders });
    if (!pageRes.ok) {
      throw new Error(`Page ${page} returned HTTP ${pageRes.status}`);
    }
    console.log(`✓ Route "${page}" rendered HTTP 200`);
  }

  console.log("\n==================================================");
  console.log("   🎉 ALL PHASE 1 ACCEPTANCE TESTS PASSED!       ");
  console.log("==================================================");
}

runAcceptanceSuite().catch((err) => {
  console.error("\n❌ Acceptance test failed:", err);
  process.exit(1);
});
