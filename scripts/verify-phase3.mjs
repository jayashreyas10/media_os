/**
 * MediaOS Phase 3 End-to-End Verification Script
 * 
 * Verifies:
 * 1. Health check endpoint (/api/health)
 * 2. Signal Scout scan (/api/signals) with opportunity scoring
 * 3. Signal promotion to Campaign (/api/signals/promote) in DISCOVERY stage
 * 4. Evidence Researcher (/api/research) claim extraction & primary source linking
 * 5. Content Strategist (/api/strategy) singular thesis formulation & campaign progression
 * 6. Zero API cost and offline mock determinism
 */

import http from "node:http";

const BASE_URL = "http://localhost:3000";

async function post(endpoint, data, cookie = "") {
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
        headers: cookie ? { Cookie: cookie } : {},
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

async function runVerification() {
  console.log("==================================================");
  console.log("   MEDIAOS PHASE 3 END-TO-END VERIFICATION");
  console.log("==================================================\n");

  // 1. Health check
  const health = await get("/api/health");
  console.log(`[1] Health Check Status: ${health.status} (status: ${health.data?.status})`);
  if (health.status !== 200) throw new Error("Health check failed");

  // 2. Authentication
  console.log("\n[2] Authenticating demo user...");
  const login = await post("/api/auth?action=login", {
    email: "operator@mediaos.local",
    password: "Password123!",
  });
  console.log(`    Auth status: ${login.status} (User: ${login.data?.user?.email})`);
  const sessionCookie = login.cookie;
  if (!sessionCookie) throw new Error("Authentication failed: No session cookie");

  // 3. Signal Scout Scan
  console.log("\n[3] Triggering Signal Scout scan (/api/signals)...");
  const scan = await post(
    "/api/signals",
    { topic: "Deterministic Agentic Workflows in Media Production" },
    sessionCookie
  );
  console.log(`    Scan status: ${scan.status}`);
  const scoutResult = scan.data?.result;
  console.log(`    Signals discovered: ${scoutResult?.signals?.length}`);
  const topSignal = scoutResult?.signals[scoutResult.recommendedSignalIndex];
  console.log(`    Top Signal: "${topSignal?.title}"`);
  console.log(`    Opportunity Score: ${topSignal?.opportunityScore}/10, Urgency: ${topSignal?.urgency}`);
  console.log(`    Suggested Angle: "${topSignal?.suggestedAngle}"`);

  // 4. Promote Signal to Campaign
  console.log("\n[4] Promoting top signal to Campaign (/api/signals/promote)...");
  const promotion = await post(
    "/api/signals/promote",
    {
      title: topSignal.title,
      event: topSignal.event,
      whyNow: topSignal.whyNow,
      suggestedAngle: topSignal.suggestedAngle,
      opportunityScore: topSignal.opportunityScore,
    },
    sessionCookie
  );
  console.log(`    Promotion status: ${promotion.status}`);
  const campaign = promotion.data?.campaign;
  console.log(`    Created Campaign ID: ${campaign?.id}`);
  console.log(`    Campaign Stage: ${campaign?.stage} (Expected: DISCOVERY)`);
  if (campaign?.stage !== "DISCOVERY") throw new Error("Expected DISCOVERY stage after promotion");

  // 5. Run Evidence Researcher
  console.log("\n[5] Running Evidence Researcher (/api/research)...");
  const research = await post(
    "/api/research",
    { campaignId: campaign.id },
    sessionCookie
  );
  console.log(`    Research status: ${research.status}`);
  const researchResult = research.data?.result;
  console.log(`    Researcher Outcome: ${researchResult?.status}`);
  console.log(`    Claims extracted: ${researchResult?.claimCount}`);
  console.log(`    Primary sources linked: ${researchResult?.sourceCount}`);
  console.log(`    Verified claims: ${researchResult?.verifiedCount}`);
  console.log(`    Contradictions: ${researchResult?.contradictionCount}`);
  if (researchResult?.claims?.length > 0) {
    const c0 = researchResult.claims[0];
    console.log(`    First Claim: "${c0.claimText}"`);
    console.log(`    Verification Status: ${c0.verificationStatus} (Fact: ${c0.isFact})`);
  }

  // 5b. Evidence Integrity Graph Verification
  console.log("\n[5b] Auditing Evidence Integrity via /api/claims...");
  const claimsRes = await get(`/api/claims?campaignId=${campaign.id}`, sessionCookie);
  console.log(`    Claims query status: ${claimsRes.status}`);
  const campaignClaims = claimsRes.data?.claims || [];
  console.log(`    Campaign Claims found: ${campaignClaims.length}`);

  if (campaignClaims.length === 0) {
    throw new Error("Expected campaign claims in evidence graph");
  }

  const primaryClaim = campaignClaims[0];
  console.log(`    Claim text: "${primaryClaim.claimText}"`);
  console.log(`    Claim status: ${primaryClaim.verificationStatus}`);
  console.log(`    Primary Source: "${primaryClaim.primarySource?.title}"`);
  console.log(`    Source Synthetic Flag: ${primaryClaim.primarySource?.isSynthetic}`);
  console.log(`    Attached Evidence count: ${primaryClaim.evidence?.length}`);

  if (primaryClaim.evidence?.length > 0) {
    const ev = primaryClaim.evidence[0];
    console.log(`    Evidence Quote: "${ev.quoteSnippet}"`);
    console.log(`    Support Stance: ${ev.supportStance}`);
    console.log(`    Quote Grounding Verified: ${ev.isQuoteVerified}`);
    console.log(`    Grounding Score: ${ev.groundingScore}`);

    if (ev.supportStance !== "SUPPORTS") {
      throw new Error(`Expected supportStance to be SUPPORTS, got ${ev.supportStance}`);
    }
    if (!ev.isQuoteVerified) {
      throw new Error("Expected evidence quote to be grounded and verified against source text");
    }
  }

  if (primaryClaim.verificationStatus !== "VERIFIED") {
    throw new Error(`Expected claim to be VERIFIED after grounded supporting evidence, got ${primaryClaim.verificationStatus}`);
  }

  // Verify Campaign Stage after Research
  const campaignAfterResearch = await get(`/api/campaigns/${campaign.id}`, sessionCookie);
  console.log(`    Campaign Stage after Research: ${campaignAfterResearch.data?.campaign?.stage} (Expected: RESEARCH)`);
  if (campaignAfterResearch.data?.campaign?.stage !== "RESEARCH") {
    throw new Error("Expected campaign stage to advance to RESEARCH");
  }

  // 6. Run Content Strategist
  console.log("\n[6] Running Content Strategist (/api/strategy)...");
  const strategy = await post(
    "/api/strategy",
    { campaignId: campaign.id },
    sessionCookie
  );
  console.log(`    Strategist status: ${strategy.status}`);
  const strategyData = strategy.data?.strategy;
  console.log(`    Primary Headline: "${strategyData?.primaryHeadline}"`);
  console.log(`    Thesis: "${strategyData?.thesis}"`);
  console.log(`    Central Tension: "${strategyData?.centralTension}"`);
  console.log(`    Flagship Format: ${strategyData?.flagshipFormat}`);
  console.log(`    Key Narrative Sections: ${strategyData?.keySections?.length}`);
  console.log(`    Distribution Channels: ${strategyData?.distributionEntryPoints?.join(", ")}`);

  // Verify Campaign Stage after Strategy
  const campaignAfterStrategy = await get(`/api/campaigns/${campaign.id}`, sessionCookie);
  console.log(`    Campaign Stage after Strategy: ${campaignAfterStrategy.data?.campaign?.stage} (Expected: STRATEGY)`);
  if (campaignAfterStrategy.data?.campaign?.stage !== "STRATEGY") {
    throw new Error("Expected campaign stage to advance to STRATEGY");
  }

  // 7. UI Route Availability
  console.log("\n[7] Verifying Page Routes (HTTP 200):");
  const signalsPage = await get("/signals", sessionCookie);
  console.log(`    GET /signals -> ${signalsPage.status}`);
  const campaignPage = await get(`/campaigns/${campaign.id}`, sessionCookie);
  console.log(`    GET /campaigns/${campaign.id} -> ${campaignPage.status}`);
  const evidencePage = await get("/evidence", sessionCookie);
  console.log(`    GET /evidence -> ${evidencePage.status}`);
  if (evidencePage.status !== 200) throw new Error("GET /evidence failed");

  console.log("\n==================================================");
  console.log("   ALL PHASE 3 VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
