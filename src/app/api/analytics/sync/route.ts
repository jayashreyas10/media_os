import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/server/services/auth-service";
import { MetricSyncService } from "@/server/services/metric-sync-service";
import { AuthorizationGuard, AuthorizationError, RateLimitError } from "@/server/auth/authorization-guard";
import { getCorrelationId } from "@/server/observability/telemetry";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req.headers);

  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json(
        { error: "Unauthorized. Authentication required to synchronize channel metrics." },
        { status: 401, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Rate limit synchronization per tenant
    await AuthorizationGuard.checkRateLimit(session, "ANALYTICS_SYNC");

    const body = await req.json().catch(() => ({}));
    const { accountId, brandId, periodStart, periodEnd } = body;
    const resolvedBrandId = brandId || session.brand?.id;

    if (accountId) {
      // Sync single account
      if (!resolvedBrandId) {
        return NextResponse.json(
          { error: "brandId is required when syncing a specific account." },
          { status: 400, headers: { "x-correlation-id": correlationId } }
        );
      }

      const result = await MetricSyncService.syncAccountMetrics({
        workspaceId: session.workspace.id,
        brandId: resolvedBrandId,
        accountId,
        periodStart,
        periodEnd,
        userId: session.user.id,
      });

      return NextResponse.json(result, {
        status: 200,
        headers: { "x-correlation-id": correlationId },
      });
    }

    // Sync all active accounts in the workspace
    const result = await MetricSyncService.syncAllActiveAccounts(
      session.workspace.id,
      session.user.id
    );

    return NextResponse.json(result, {
      status: 200,
      headers: { "x-correlation-id": correlationId },
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, code: err.code, retryAfter: err.retryAfterSeconds },
        {
          status: 429,
          headers: {
            "Retry-After": err.retryAfterSeconds.toString(),
            "x-correlation-id": correlationId,
          },
        }
      );
    }

    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode, headers: { "x-correlation-id": correlationId } }
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Metric synchronization failed." },
      { status: 400, headers: { "x-correlation-id": correlationId } }
    );
  }
}
